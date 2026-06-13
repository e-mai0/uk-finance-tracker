import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

// Background music bed (looped, low) + a single placed VO line.
export const Music: React.FC<{ src?: string; vol?: number }> = ({ src = "track.wav", vol = 0.24 }) => (
  <Audio src={staticFile(src)} volume={vol} loop />
);
export const Vo: React.FC<{ name: string; from: number; vol?: number }> = ({ name, from, vol = 1 }) => (
  <Sequence from={from}>
    <Audio src={staticFile(`vo/${name}.wav`)} volume={vol} />
  </Sequence>
);
import { Trail } from "@remotion/motion-blur";
import { fonts } from "./fonts";
import { beatBump, ease, overshoot, FPB } from "./kit";

// Brand palette lifted from the user's actual finals (warm editorial).
export const ED = {
  linen: "#f1ede2",
  linen2: "#ebe6d8",
  card: "#fdfbf4",
  cardLine: "#e7e0d0",
  ink: "#211e19",
  sub: "#6f675a",
  faint: "#a99f8c",
  ghost: "#e6e0d1",
  ghostDark: "#3f3e39",
  amber: "#b85c18",
  amberDeep: "#9a4c0c",
  amberSoft: "#f6e7d4",
  green: "#5f7a3f",
  greenSoft: "#e6ecdb",
  night: "#322f2b",
  nightCard: "#41403a",
  nightLine: "#52504a",
  nightInk: "#f1ede2",
  nightSub: "#a39a89",
};

// ---- Huge faint ghost numeral/letter behind everything (their signature) -----
export const Ghost: React.FC<{ char: string; dark?: boolean; x?: number; y?: number }> = ({
  char,
  dark,
  x = 0.5,
  y = 0.34,
}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 90], [0, -40]);
  const intro = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: ease });
  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(-50%,-50%) translateY(${drift}px) scale(${0.98 + 0.02 * beatBump(frame)})`,
        fontFamily: fonts.display,
        fontWeight: 600,
        fontSize: 1440,
        lineHeight: 1,
        color: dark ? ED.ghostDark : ED.ghost,
        opacity: intro * (dark ? 0.5 : 1),
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {char}
    </div>
  );
};

// ---- Eyebrow label: ◆ CYCLOPS · MODE ----------------------------------------
export const Eyebrow: React.FC<{ text: string; dark?: boolean; from?: number }> = ({ text, dark, from = 0 }) => {
  const frame = useCurrentFrame();
  const s = spring({ frame: frame - from, fps: 30, config: { damping: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: fonts.mono,
        fontSize: 26,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: dark ? ED.amber : ED.amber,
        opacity: s,
      }}
    >
      <span style={{ marginRight: 14 }}>◆</span>
      {text}
    </div>
  );
};

// ---- Big serif display block (bold line + optional italic accent line) -------
export const Display: React.FC<{
  top?: number;
  bold: React.ReactNode;
  accent?: string;
  accentColor?: string;
  sub?: string;
  from?: number;
  dark?: boolean;
  size?: number;
}> = ({ top = 720, bold, accent, accentColor = ED.amber, sub, from = 0, dark, size = 150 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame: frame - from, fps, config: overshoot });
  const s2 = spring({ frame: frame - from - 6, fps, config: overshoot });
  const s3 = spring({ frame: frame - from - 10, fps, config: { damping: 200 } });
  const blur1 = interpolate(s1, [0, 1], [14, 0]);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center" }}>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.0,
          letterSpacing: "-0.02em",
          color: dark ? ED.nightInk : ED.ink,
          opacity: s1,
          filter: `blur(${blur1}px)`,
          transform: `translateY(${interpolate(s1, [0, 1], [40, 0])}px)`,
        }}
      >
        {bold}
      </div>
      {accent && (
        <div
          style={{
            fontFamily: fonts.display,
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: size * 0.92,
            lineHeight: 1.05,
            color: accentColor,
            opacity: s2,
            transform: `translateY(${interpolate(s2, [0, 1], [30, 0])}px)`,
          }}
        >
          {accent}
        </div>
      )}
      {sub && (
        <div style={{ fontFamily: fonts.mono, fontSize: 30, letterSpacing: "0.04em", color: dark ? ED.nightSub : ED.sub, marginTop: 26, opacity: s3 }}>
          {sub}
        </div>
      )}
    </div>
  );
};

// ---- Bottom kicker (bold sans, lowercase) ------------------------------------
export const Kicker: React.FC<{ text: string; from?: number; dark?: boolean }> = ({ text, from = 0, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: overshoot });
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 150,
        textAlign: "center",
        fontFamily: fonts.ui,
        fontWeight: 800,
        fontSize: 60,
        letterSpacing: "-0.02em",
        color: dark ? ED.nightInk : ED.ink,
        opacity: interpolate(s, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
      }}
    >
      {text}
    </div>
  );
};

// ---- A floating card (chat / answer / status), springy ----------------------
export const Card: React.FC<{ from?: number; dark?: boolean; style?: React.CSSProperties; children: React.ReactNode }> = ({
  from = 0,
  dark,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: overshoot });
  return (
    <div
      style={{
        background: dark ? ED.nightCard : ED.card,
        border: `1px solid ${dark ? ED.nightLine : ED.cardLine}`,
        borderRadius: 22,
        padding: "34px 38px",
        boxShadow: dark ? "0 26px 60px rgba(0,0,0,0.4)" : "0 26px 60px rgba(33,30,25,0.14)",
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px) scale(${interpolate(s, [0, 1], [0.92, 1])})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ---- Mono log lines appearing one per beat ----------------------------------
export const LogLines: React.FC<{ rows: [string, string][]; from: number; dark?: boolean }> = ({ rows, from, dark }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {rows.map(([t, txt], i) => {
        const fr = from + i * 12;
        const op = interpolate(frame, [fr, fr + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const x = interpolate(frame, [fr, fr + 6], [-20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        return (
          <div key={i} style={{ display: "flex", gap: 22, marginBottom: 18, opacity: op, transform: `translateX(${x}px)`, fontFamily: fonts.mono, fontSize: 28 }}>
            <span style={{ color: ED.amber }}>{t}</span>
            <span style={{ color: dark ? ED.nightInk : ED.ink }}>{txt}</span>
          </div>
        );
      })}
    </>
  );
};

// ---- REJECTED stamp slamming in ---------------------------------------------
export const Stamp: React.FC<{ text: string; from: number; left?: string; top?: string }> = ({ text, from, left = "50%", top = "50%" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: { damping: 7, stiffness: 200, mass: 1.1 } });
  const scale = interpolate(s, [0, 1], [2.6, 1]);
  const op = interpolate(frame - from, [0, 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: `translate(-50%,-50%) rotate(-14deg) scale(${scale})`,
        border: `7px solid ${ED.amber}`,
        color: ED.amber,
        fontFamily: fonts.ui,
        fontWeight: 800,
        fontSize: 86,
        letterSpacing: "0.04em",
        padding: "12px 30px",
        borderRadius: 14,
        opacity: op * 0.92,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
};

// ---- Lockup: cyclops. + italic tagline + Get early access + cyclops.app ------
export const Lockup: React.FC<{ tagline: string; from?: number }> = ({ tagline, from = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const word = spring({ frame: frame - from, fps, config: overshoot });
  const dot = spring({ frame: frame - from - 8, fps, config: { damping: 7, stiffness: 200 } });
  const tag = spring({ frame: frame - from - 14, fps, config: { damping: 200 } });
  const cta = spring({ frame: frame - from - 22, fps, config: overshoot });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "flex-end", opacity: word, transform: `translateY(${interpolate(word, [0, 1], [30, 0])}px)` }}>
        <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 132, color: ED.ink, letterSpacing: "-0.02em" }}>cyclops</span>
        <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 132, color: ED.amber, transform: `scale(${dot})`, display: "inline-block" }}>.</span>
      </div>
      <div style={{ fontFamily: fonts.display, fontStyle: "italic", fontSize: 52, color: ED.sub, marginTop: 14, opacity: tag }}>{tagline}</div>
      <div style={{ marginTop: 46, background: ED.ink, color: ED.linen, fontFamily: fonts.ui, fontWeight: 700, fontSize: 38, padding: "22px 46px", borderRadius: 999, opacity: cta, transform: `scale(${interpolate(cta, [0, 1], [0.9, 1])})` }}>
        Get early access
      </div>
      <div style={{ fontFamily: fonts.mono, fontSize: 28, color: ED.faint, marginTop: 22, opacity: cta }}>cyclops.app</div>
    </AbsoluteFill>
  );
};

// ---- Narrator cam: "Cyclops is narrating" reaction-cam tile -----------------
// Frames the synthetic voice as the product talking. eqWindows = [from,to] frame
// ranges where VO is actually speaking, so the waveform only dances on speech.
export const NarratorCam: React.FC<{ corner?: "bl" | "tl" | "br" | "tr"; dark?: boolean; eqWindows?: [number, number][] }> = ({
  corner = "bl",
  dark,
  eqWindows = [],
}) => {
  const frame = useCurrentFrame();
  const speaking = eqWindows.some(([a, b]) => frame >= a && frame <= b);
  const pos: React.CSSProperties =
    corner === "bl" ? { left: 56, bottom: 64 } : corner === "br" ? { right: 56, bottom: 64 } : corner === "tl" ? { left: 56, top: 200 } : { right: 56, top: 200 };
  const ink = dark ? ED.nightInk : ED.ink;
  const cardBg = dark ? ED.nightCard : ED.card;
  const line = dark ? ED.nightLine : ED.cardLine;
  // occasional blink
  const blinkPhase = frame % 95;
  const blink = blinkPhase > 88 ? Math.sin(((blinkPhase - 88) / 7) * Math.PI) : 0;
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        display: "flex",
        alignItems: "center",
        gap: 18,
        background: cardBg,
        border: `1px solid ${line}`,
        borderRadius: 20,
        padding: "16px 22px 16px 16px",
        boxShadow: dark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 40px rgba(33,30,25,0.14)",
      }}
    >
      {/* eye avatar */}
      <div style={{ width: 76, height: 76, borderRadius: 16, background: dark ? ED.night : ED.amberSoft, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        <svg width="60" height="40" viewBox="0 0 220 140">
          <path d="M10 70 Q110 0 210 70 Q110 140 10 70 Z" fill="none" stroke={ED.amber} strokeWidth="9" />
          <circle cx="110" cy="70" r="32" fill={ED.amber} />
          <circle cx="110" cy="70" r="13" fill={dark ? ED.night : ED.amberSoft} />
          <rect x="6" y={70 - 66 * blink} width="208" height={132 * blink} fill={dark ? ED.night : ED.amberSoft} />
        </svg>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 30, color: ink }}>cyclops<span style={{ color: ED.amber }}>.</span></span>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: ED.green, opacity: 0.55 + 0.45 * Math.abs(Math.sin(frame / 6)) }} />
          <span style={{ fontFamily: fonts.mono, fontSize: 17, letterSpacing: "0.12em", color: dark ? ED.nightSub : ED.faint }}>LIVE</span>
        </div>
        {/* equalizer */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 28 }}>
          {bars.map((i) => {
            const amp = speaking ? 0.25 + 0.75 * Math.abs(Math.sin(frame / (2.4 + i * 0.5) + i * 1.7)) : 0.16 + 0.06 * Math.abs(Math.sin(frame / 8 + i));
            return <div key={i} style={{ width: 7, height: 28 * amp, borderRadius: 4, background: ED.amber }} />;
          })}
        </div>
      </div>
    </div>
  );
};

export { Trail };
