import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  random,
} from "remotion";
import { Trail } from "@remotion/motion-blur";
import { theme, radius } from "./theme";
import { fonts } from "./fonts";

export const W = 1080;
export const H = 1920;
export const FPB = 15; // 120 BPM @ 30fps
export const GRAD = `linear-gradient(135deg, ${theme.agentMark}, ${theme.gold})`;
export const GRAD_H = `linear-gradient(90deg, ${theme.agentMark}, ${theme.gold})`;

// spike ~1 on each beat, decays
export const beatBump = (frame: number) => Math.exp(-(frame % FPB) / 3.0);
// spike on a specific frame
export const bumpAt = (frame: number, at: number, k = 3.5) =>
  frame < at ? 0 : Math.exp(-(frame - at) / k);

export const ease = Easing.bezier(0.22, 1, 0.36, 1); // snappy out
export const overshoot = { damping: 9, stiffness: 150, mass: 0.9 };

// ---- Liquid wave swoosh transition ------------------------------------------
const wavePath = (w: number, h: number, amp: number) => {
  const segs = 3;
  let d = `M -500 -120 L ${w} -120`;
  for (let i = 0; i < segs; i++) {
    const y1 = -120 + (h + 240) * ((i + 1) / segs);
    const ymid = -120 + (h + 240) * ((i + 0.5) / segs);
    const cx = w + (i % 2 === 0 ? amp : -amp);
    d += ` Q ${cx} ${ymid} ${w} ${y1}`;
  }
  d += ` L -500 ${h + 120} Z`;
  return d;
};

export const WaveSwoosh: React.FC<{ from: number; dur?: number; idSuffix: string }> = ({
  from,
  dur = 16,
  idSuffix,
}) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local > dur) return null;
  const t = interpolate(local, [0, dur], [-1.7 * W, 1.7 * W], { easing: ease });
  const t2 = interpolate(local, [0, dur], [-1.9 * W, 1.5 * W], { easing: ease });
  const gid = `wave-${idSuffix}`;
  return (
    <AbsoluteFill style={{ zIndex: 70, pointerEvents: "none" }}>
      <svg width={W} height={H} style={{ position: "absolute", filter: "drop-shadow(-30px 0 40px rgba(43,39,34,0.18))" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={theme.gold} />
            <stop offset="1" stopColor={theme.agentMark} />
          </linearGradient>
        </defs>
        <path d={wavePath(W, H, 175)} fill={theme.gold2} transform={`translate(${t2},0)`} opacity={0.9} />
        <path d={wavePath(W, H, 140)} fill={`url(#${gid})`} transform={`translate(${t},0)`} />
      </svg>
    </AbsoluteFill>
  );
};

// ---- Confetti ----------------------------------------------------------------
export const Confetti: React.FC<{ from: number; count?: number; originY?: number; burst?: number }> = ({
  from,
  count = 60,
  originY = 900,
  burst = 1,
}) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local > 70) return null;
  const t = local / 30;
  // warm amber/gold only — dark flecks read as "dirt" on white, so they're out
  const colors = [theme.agentMark, theme.gold, theme.gold2, "#ffc46b", "#e08a2e"];
  return (
    <AbsoluteFill style={{ zIndex: 55, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const ang = random(`a${i}`) * Math.PI * 2;
        const spd = (760 + random(`s${i}`) * 1300) * burst; // fly wide so they clear the centre fast
        const vx = Math.cos(ang) * spd;
        const vy = -Math.abs(Math.sin(ang)) * spd - 360;
        const x = W / 2 + vx * t;
        const y = originY + vy * t + 1550 * t * t;
        const op = interpolate(local, [0, 5, 48, 66], [0, 1, 1, 0], { extrapolateRight: "clamp" });
        const sz = 12 + random(`z${i}`) * 20;
        const rot = local * (5 + random(`r${i}`) * 13);
        const round = random(`c${i}`) > 0.6;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: sz,
              height: round ? sz : sz * 0.45,
              background: colors[i % colors.length],
              opacity: op,
              transform: `rotate(${rot}deg)`,
              borderRadius: round ? "50%" : 2,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ---- Cursor (with motion-blur trail) ----------------------------------------
export const Cursor: React.FC<{ x: number; y: number; press: number; blur?: boolean }> = ({
  x,
  y,
  press,
  blur,
}) => {
  const node = (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 40, transform: `scale(${interpolate(press, [0, 1], [1, 0.78])})` }}>
      <svg width="74" height="74" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 6px 8px rgba(43,39,34,0.25))" }}>
        <path d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z" fill={theme.agentMark} stroke="#fff" strokeWidth="1" />
      </svg>
    </div>
  );
  return blur ? <Trail layers={5} lagInFrames={0.6} trailOpacity={0.5}>{node}</Trail> : node;
};

// ---- Eye mark (parametric blink) --------------------------------------------
export const EyeMark: React.FC<{ size?: number; blink?: number; stroke?: string }> = ({
  size = 240,
  blink = 0,
  stroke = theme.gold,
}) => (
  <svg width={size} height={size * 0.64} viewBox="0 0 220 140">
    <path d="M10 70 Q110 0 210 70 Q110 140 10 70 Z" fill="none" stroke={stroke} strokeWidth="6" />
    <circle cx="110" cy="70" r="34" fill={stroke} />
    <circle cx="110" cy="70" r="14" fill={theme.chrome} />
    <rect x="6" y={70 - 64 * blink} width="208" height={128 * blink} fill={theme.chrome} />
  </svg>
);

// ---- "Why this firm?" card --------------------------------------------------
export const QCard: React.FC<{ rot?: number; ghost?: boolean }> = ({ rot = 0, ghost }) => (
  <div
    style={{
      background: ghost ? theme.surface2 : theme.paper,
      border: `1px solid ${theme.border}`,
      borderRadius: radius.card,
      padding: "24px 28px",
      fontFamily: fonts.ui,
      fontSize: 33,
      fontWeight: 700,
      color: ghost ? theme.faint : theme.ink,
      boxShadow: "0 22px 48px rgba(43,39,34,0.14)",
      transform: `rotate(${rot}deg)`,
      whiteSpace: "nowrap",
    }}
  >
    Why this firm?
  </div>
);

// ---- Folder fanning files ---------------------------------------------------
export const FolderFan: React.FC<{ progress: number; labels: string[] }> = ({ progress, labels }) => {
  const n = labels.length;
  return (
    <div style={{ position: "relative", width: 520, height: 520 }}>
      {/* folder back */}
      <div style={{ position: "absolute", left: 110, top: 300, width: 300, height: 200, background: theme.agentMark, borderRadius: 18 }} />
      {labels.map((lab, i) => {
        const spread = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
        const ang = (i - (n - 1) / 2) * 26 * spread;
        const lift = -160 * spread;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 160,
              top: 320,
              width: 200,
              height: 128,
              background: theme.paper,
              border: `1px solid ${theme.border}`,
              borderRadius: 14,
              boxShadow: "0 14px 30px rgba(43,39,34,0.16)",
              transformOrigin: "50% 100%",
              transform: `translateY(${lift}px) rotate(${ang}deg)`,
              opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
              display: "flex",
              alignItems: "flex-start",
              padding: 16,
              fontFamily: fonts.mono,
              fontSize: 18,
              color: theme.accentText,
              letterSpacing: "0.04em",
            }}
          >
            {lab}
          </div>
        );
      })}
      {/* folder front */}
      <div style={{ position: "absolute", left: 110, top: 350, width: 300, height: 150, background: theme.gold, borderRadius: 18, boxShadow: "0 18px 36px rgba(43,39,34,0.18)" }} />
    </div>
  );
};

// ---- Application form panel (used in carousel + hero) -----------------------
export const FormPanel: React.FC<{ name: string; fill: number; width?: number; big?: boolean; note?: string }> = ({
  name,
  fill,
  width = 520,
  big,
  note,
}) => {
  const done = fill >= 1;
  const filling = fill > 0 && fill < 1;
  return (
    <div
      style={{
        width,
        background: theme.paper,
        border: `2px solid ${filling || done ? theme.agentMark : theme.border}`,
        borderRadius: radius.card,
        padding: big ? "40px 42px" : "30px 34px",
        boxShadow: filling || done ? `0 26px 64px ${theme.agentMark}3a` : "0 18px 44px rgba(43,39,34,0.14)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: big ? 44 : 38, color: theme.ink }}>{name}</div>
        {/* never say "auto" — the human always reads + submits */}
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 19,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: theme.accentText,
            background: theme.accentSoft,
            borderRadius: radius.pill,
            padding: "8px 16px",
          }}
        >
          {done ? "drafted ✓ · your read" : "draft"}
        </div>
      </div>
      {note && (
        <div style={{ fontFamily: fonts.ui, fontStyle: "italic", fontSize: 24, color: theme.muted, marginBottom: 18, opacity: Math.min(1, fill * 1.5), lineHeight: 1.4 }}>
          “{note}”
        </div>
      )}
      {[1, 0.82].map((m, k) => (
        <div key={k} style={{ height: 22, width: `${m * 100}%`, borderRadius: radius.pill, background: theme.surface3, overflow: "hidden", marginBottom: 13 }}>
          <div style={{ height: "100%", width: `${Math.max(0, fill - k * 0.12) * 100}%`, background: GRAD_H, borderRadius: radius.pill }} />
        </div>
      ))}
    </div>
  );
};

// ---- Progress bar + counting % + checkmark ----------------------------------
export const RewardBar: React.FC<{ fill: number }> = ({ fill }) => {
  const pct = Math.round(fill * 100);
  return (
    <div style={{ width: 820, textAlign: "center" }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 26, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.faint, marginBottom: 18 }}>
        Drafted — ready for your read
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: 200,
          lineHeight: 1,
          background: GRAD_H,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          marginBottom: 30,
        }}
      >
        {pct}%
      </div>
      <div style={{ height: 56, width: "100%", borderRadius: radius.pill, background: theme.surface3, overflow: "hidden", boxShadow: "inset 0 2px 8px rgba(43,39,34,0.10)" }}>
        <div style={{ height: "100%", width: `${fill * 100}%`, background: GRAD_H, borderRadius: radius.pill, boxShadow: `0 0 40px ${theme.gold}` }} />
      </div>
    </div>
  );
};

export const CheckBurst: React.FC<{ spawn: number }> = ({ spawn }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - spawn, fps, config: overshoot });
  const glow = 40 + 60 * beatBump(frame);
  return (
    <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.2, 1])})`, opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div
        style={{
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: GRAD,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 ${glow}px ${theme.agentMark}77`,
        }}
      >
        <svg width="140" height="140" viewBox="0 0 24 24">
          <path d="M4 12.5 L10 18 L20 6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};

// ---- Toggle + Pill morph (tactile beats) ------------------------------------
export const Toggle: React.FC<{ on: number }> = ({ on }) => (
  <div style={{ width: 130, height: 64, borderRadius: radius.pill, background: interpolateColor(on), position: "relative", transition: "none", boxShadow: "inset 0 2px 6px rgba(43,39,34,0.12)" }}>
    <div style={{ position: "absolute", top: 7, left: interpolate(on, [0, 1], [7, 73]), width: 50, height: 50, borderRadius: "50%", background: "#fff", boxShadow: "0 4px 10px rgba(43,39,34,0.25)" }} />
  </div>
);
const interpolateColor = (on: number) => (on > 0.5 ? theme.agentMark : theme.surface3);

export const PillMorph: React.FC<{ morph: number; label: string }> = ({ morph, label }) => (
  <div
    style={{
      padding: "26px 56px",
      borderRadius: radius.pill,
      background: morph > 0.5 ? GRAD : theme.surface,
      border: `2px solid ${morph > 0.5 ? "transparent" : theme.border}`,
      color: morph > 0.5 ? "#fff" : theme.ink,
      fontFamily: fonts.ui,
      fontWeight: 800,
      fontSize: 38,
      boxShadow: morph > 0.5 ? `0 0 ${40 + morph * 40}px ${theme.gold}aa` : "0 14px 30px rgba(43,39,34,0.12)",
    }}
  >
    {label}
  </div>
);

export { Trail };
