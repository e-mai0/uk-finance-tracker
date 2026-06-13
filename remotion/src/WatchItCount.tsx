import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
  random,
} from "remotion";
import { theme, radius } from "./theme";
import { fonts } from "./fonts";

const W = 1080;
const H = 1920;
const FPB = 15; // 120 BPM @ 30fps -> 15 frames per beat

// Spikes to ~1 right on each beat, then decays — drives the whole reel's bounce.
const beatBump = (frame: number) => Math.exp(-(frame % FPB) / 3.2);

const grad = `linear-gradient(90deg, ${theme.agentMark}, ${theme.amberOnDark})`;

// ---- Persistent counter value across the reel --------------------------------
const counterValue = (frame: number) => {
  if (frame < 100)
    return Math.round(
      interpolate(frame, [0, 100], [1, 41], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      }),
    );
  if (frame < 238)
    return Math.round(
      interpolate(frame, [100, 238], [41, 58], { extrapolateRight: "clamp" }),
    );
  if (frame < 340)
    return Math.round(
      interpolate(frame, [238, 340], [58, 8], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateRight: "clamp",
      }),
    );
  if (frame < 360)
    return Math.round(
      interpolate(frame, [340, 360], [8, 1], { extrapolateRight: "clamp" }),
    );
  return 1;
};

// ---- Animated background: drifting amber blobs + beat pulse -------------------
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + 0.03 * beatBump(frame);
  const blob = (x: number, y: number, r: number, color: string, sp: number, i: number) => (
    <div
      style={{
        position: "absolute",
        left: x + Math.sin(frame / sp + i) * 60,
        top: y + Math.cos(frame / (sp * 1.3) + i) * 60,
        width: r,
        height: r,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: "blur(40px)",
        transform: `scale(${pulse})`,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: theme.surface, overflow: "hidden" }}>
      {blob(-150, 200, 700, theme.accentSoft, 90, 0)}
      {blob(640, 1250, 760, theme.accentTint, 70, 1)}
      {blob(120, 1500, 560, "#f3e2c9", 110, 2)}
    </AbsoluteFill>
  );
};

// ---- Swoosh wipe -------------------------------------------------------------
const Swoosh: React.FC<{ from: number; color: string; dur?: number }> = ({
  from,
  color,
  dur = 13,
}) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local > dur) return null;
  const p = interpolate(local, [0, dur], [-1.35, 1.35], {
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{ zIndex: 60, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: "-25% -20%",
          background: color,
          borderRadius: "45% 45% 45% 45% / 58% 58% 58% 58%",
          transform: `translateX(${p * 120}%) skewX(-10deg)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---- Confetti burst ----------------------------------------------------------
const Confetti: React.FC<{ from: number; count?: number; originY?: number }> = ({
  from,
  count = 48,
  originY = 880,
}) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local > 60) return null;
  const t = local / 30;
  const colors = [theme.agentMark, theme.amberOnDark, theme.ink, "#dca94f", theme.goodMark];
  return (
    <AbsoluteFill style={{ zIndex: 45, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const ang = random(`a${i}`) * Math.PI * 2;
        const spd = 520 + random(`s${i}`) * 1000;
        const vx = Math.cos(ang) * spd;
        const vy = -Math.abs(Math.sin(ang)) * spd - 280;
        const x = W / 2 + vx * t;
        const y = originY + vy * t + 1500 * t * t;
        const op = interpolate(local, [0, 6, 42, 58], [0, 1, 1, 0], {
          extrapolateRight: "clamp",
        });
        const sz = 12 + random(`z${i}`) * 18;
        const rot = local * (6 + random(`r${i}`) * 12);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: sz,
              height: sz * 0.5,
              background: colors[i % colors.length],
              opacity: op,
              transform: `rotate(${rot}deg)`,
              borderRadius: 2,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ---- Persistent counter (big & centered -> pinned small at top) --------------
const PersistentCounter: React.FC = () => {
  const frame = useCurrentFrame();
  const value = counterValue(frame);
  const isOne = frame >= 360;

  const cy = interpolate(frame, [0, 100, 118], [720, 720, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const cs = interpolate(frame, [100, 118], [1, 0.36], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const intro = spring({ frame: frame - 4, fps: 30, config: { damping: 11, stiffness: 120 } });
  const slam = interpolate(frame, [360, 369, 382], [1, 1.22, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const leave = interpolate(frame, [380, 388], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = 1 + 0.06 * beatBump(frame);
  const counting = frame > 60 && frame < 232 ? 0.4 + 0.4 * Math.abs(Math.sin(frame / 5)) : 0;

  // expanding ring on every beat
  const ringAge = (frame % FPB) / FPB;

  return (
    <AbsoluteFill
      style={{
        zIndex: 30,
        opacity: leave,
        transform: `translateY(${cy}px) scale(${cs * pulse * intro})`,
        transformOrigin: "50% 0%",
      }}
    >
      <div style={{ textAlign: "center", position: "relative" }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 30,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: theme.faint,
          }}
        >
          Times you'll type "Why this firm?":
        </div>
        <div style={{ position: "relative", height: 320 }}>
          {/* beat ring */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 150,
              width: 360,
              height: 360,
              marginLeft: -180,
              marginTop: -180,
              border: `4px solid ${theme.agentMark}`,
              borderRadius: "50%",
              opacity: (1 - ringAge) * 0.5,
              transform: `scale(${0.6 + ringAge * 1.1})`,
            }}
          />
          <div
            style={{
              fontFamily: fonts.mono,
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              fontSize: 300,
              lineHeight: "320px",
              color: isOne ? theme.agentMark : theme.ink,
              transform: `scale(${slam})`,
              textShadow: "0 10px 40px rgba(43,39,34,0.12)",
            }}
          >
            {value}
          </div>
        </div>
        <div
          style={{
            fontFamily: fonts.ui,
            fontWeight: 700,
            fontSize: 34,
            color: theme.accentText,
            height: 44,
            opacity: counting,
          }}
        >
          …and counting.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- Big punchy caption ------------------------------------------------------
const Punch: React.FC<{ text: string; from: number; top: number; color?: string }> = ({
  text,
  from,
  top,
  color = theme.ink,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: { damping: 9, stiffness: 140 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        textAlign: "center",
        fontFamily: fonts.ui,
        fontWeight: 800,
        fontSize: 88,
        letterSpacing: "-0.025em",
        color,
        opacity: interpolate(s, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
        transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
      }}
    >
      {text}
    </div>
  );
};

const QCard: React.FC<{ rot: number }> = ({ rot }) => (
  <div
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: radius.card,
      padding: "24px 26px",
      fontFamily: fonts.ui,
      fontSize: 32,
      fontWeight: 700,
      color: theme.ink,
      boxShadow: "0 18px 40px rgba(43,39,34,0.12)",
      transform: `rotate(${rot}deg)`,
      whiteSpace: "nowrap",
    }}
  >
    Why this firm?
  </div>
);

// ---- Scene: cards storm in (3D scatter) then implode into one memory file ----
const CardsLifecycle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const COUNT = 12;
  const cols = 3;
  const cellW = 300;
  const cellH = 200;
  const gridX = (W - cols * cellW) / 2 + 30;
  const gridY = 470;

  const implode = interpolate(frame, [60, 86], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ perspective: 1400 }}>
      {Array.from({ length: COUNT }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const homeX = gridX + c * cellW + (random(`ox${i}`) - 0.5) * 40;
        const homeY = gridY + r * cellH + (random(`oy${i}`) - 0.5) * 30;
        const rot = (random(`rot${i}`) - 0.5) * 16;
        // fly in from a random offscreen direction, staggered on the beat grid
        const enter = spring({
          frame: frame - i * 4,
          fps,
          config: { damping: 12, stiffness: 110 },
        });
        const offAng = random(`ang${i}`) * Math.PI * 2;
        const fromX = homeX + Math.cos(offAng) * 1100;
        const fromY = homeY + Math.sin(offAng) * 1100;
        const baseX = interpolate(enter, [0, 1], [fromX, homeX]);
        const baseY = interpolate(enter, [0, 1], [fromY, homeY]);
        // implode toward center
        const x = interpolate(implode, [0, 1], [baseX, W / 2 - 150]);
        const y = interpolate(implode, [0, 1], [baseY, 760]);
        const sc =
          interpolate(implode, [0, 1], [1, 0.1]) *
          (1 + 0.04 * beatBump(frame));
        const op = interpolate(implode, [0.5, 1], [1, 0], { extrapolateLeft: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              opacity: enter * op,
              transform: `scale(${sc})`,
            }}
          >
            <QCard rot={rot * (1 - implode)} />
          </div>
        );
      })}

      {/* memory file bursts out of the implosion */}
      {frame >= 82 && (
        <MemoryFile spawn={82} />
      )}
      {frame >= 82 && <Confetti from={84} originY={760} count={40} />}
      <Sequence from={92}>
        <Punch text="Answer once." from={0} top={1180} />
      </Sequence>
    </AbsoluteFill>
  );
};

const MemoryFile: React.FC<{ spawn: number }> = ({ spawn }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - spawn, fps, config: { damping: 8, stiffness: 130 } });
  const glow = 30 + 50 * beatBump(frame);
  return (
    <div
      style={{
        position: "absolute",
        left: W / 2 - 230,
        top: 700,
        width: 460,
        transform: `scale(${interpolate(pop, [0, 1], [0.2, 1.05])})`,
        opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      <div
        style={{
          background: theme.accentTint,
          border: `3px solid ${theme.agentMark}`,
          borderRadius: radius.card,
          padding: "28px 30px",
          boxShadow: `0 0 ${glow}px ${theme.agentMark}66`,
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: theme.accentText,
          }}
        >
          memory · saved
        </div>
        <div
          style={{
            fontFamily: fonts.ui,
            fontWeight: 800,
            fontSize: 40,
            color: theme.ink,
            marginTop: 10,
          }}
        >
          Why this firm? ✓
        </div>
      </div>
    </div>
  );
};

// ---- Scene: three ATS forms stack in 3D and fill on the beat -----------------
const AtsCard: React.FC<{ name: string; index: number }> = ({ name, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - index * 8,
    fps,
    config: { damping: 13, stiffness: 110 },
  });
  const start = 14 + index * 16;
  const fill = interpolate(frame, [start, start + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const done = fill >= 1;
  const filling = fill > 0 && fill < 1;
  const x = interpolate(enter, [0, 1], [900, 0]);
  const tilt = interpolate(enter, [0, 1], [22, 0]);
  return (
    <div
      style={{
        transform: `translateX(${x}px) rotateY(${tilt}deg)`,
        opacity: enter,
        background: theme.surface,
        border: `2px solid ${filling ? theme.agentMark : theme.border}`,
        borderRadius: radius.card,
        padding: "30px 36px",
        marginBottom: 30,
        boxShadow: filling
          ? `0 18px 50px ${theme.agentMark}33`
          : "0 14px 36px rgba(43,39,34,0.10)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 42, color: theme.ink }}>
          {name}
        </div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: done ? theme.success : theme.faint,
            background: done ? "#e8efe6" : theme.surface3,
            borderRadius: radius.pill,
            padding: "9px 20px",
            transform: `scale(${done ? 1 + 0.12 * beatBump(frame) : 1})`,
          }}
        >
          {done ? "filled ✓" : "awaiting your review"}
        </div>
      </div>
      {[560, 460].map((w, k) => (
        <div
          key={k}
          style={{
            height: 26,
            width: w,
            borderRadius: radius.pill,
            background: theme.surface3,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, fill - k * 0.12) * 100}%`,
              background: grad,
              borderRadius: radius.pill,
            }}
          />
        </div>
      ))}
    </div>
  );
};

const FormsFilling: React.FC = () => (
  <AbsoluteFill style={{ padding: "560px 90px 0", perspective: 1500 }}>
    <AtsCard name="Greenhouse" index={0} />
    <AtsCard name="Lever" index={1} />
    <AtsCard name="Ashby" index={2} />
  </AbsoluteFill>
);

// ---- Cursor ------------------------------------------------------------------
const Cursor: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      zIndex: 20,
      transform: `scale(${interpolate(press, [0, 1], [1, 0.8])})`,
    }}
  >
    <svg width="72" height="72" viewBox="0 0 24 24">
      <path
        d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z"
        fill={theme.agentMark}
        stroke={theme.chromeInk}
        strokeWidth="1"
      />
    </svg>
  </div>
);

// ---- Scene: the one click ----------------------------------------------------
const TheOneClick: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 13, stiffness: 120 } });
  const cardY = interpolate(rise, [0, 1], [820, 640]);

  // click lands on the beat at local frame 62 (global 360)
  const CLICK = 62;
  const cx = interpolate(frame, [10, CLICK], [840, 600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const cy = interpolate(frame, [10, CLICK], [1340, 1010], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const press = interpolate(frame, [CLICK, CLICK + 5, CLICK + 12], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const submitted = frame >= CLICK + 4;

  return (
    <AbsoluteFill>
      <Sequence from={30}>
        <Punch text="The 1 is your click." from={0} top={470} color={theme.ink} />
      </Sequence>

      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: cardY,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: radius.card,
          padding: "44px 44px 48px",
          boxShadow: "0 28px 70px rgba(43,39,34,0.16)",
          opacity: rise,
          transform: `scale(${interpolate(rise, [0, 1], [0.9, 1])})`,
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: theme.faint,
          }}
        >
          Ashby · application
        </div>
        <div
          style={{
            fontFamily: fonts.ui,
            fontWeight: 800,
            fontSize: 44,
            color: theme.ink,
            margin: "14px 0 28px",
          }}
        >
          Why this firm?
        </div>
        <div
          style={{
            background: theme.accentTint,
            border: `1px solid ${theme.border}`,
            borderRadius: radius.control,
            padding: "24px 26px",
            fontFamily: fonts.ui,
            fontSize: 28,
            lineHeight: 1.5,
            color: theme.muted,
          }}
        >
          Drafted from your memory, in your voice — ready for your read.
        </div>
        <div style={{ marginTop: 34, display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{
              background: submitted ? theme.goodMark : theme.chrome,
              color: theme.chromeInk,
              fontFamily: fonts.ui,
              fontWeight: 800,
              fontSize: 34,
              padding: "24px 48px",
              borderRadius: radius.pill,
              transform: `scale(${interpolate(press, [0, 1], [1, 0.94])})`,
            }}
          >
            {submitted ? "Submitted ✓" : "Submit application"}
          </div>
        </div>
      </div>

      <Cursor x={cx} y={cy} press={press} />
      {frame >= CLICK + 2 && <Confetti from={CLICK + 2} originY={1000} count={56} />}
    </AbsoluteFill>
  );
};

// ---- End card ----------------------------------------------------------------
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lid = interpolate(frame, [6, 12, 18], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eyeIn = spring({ frame, fps, config: { damping: 11, stiffness: 120 } });
  const wordIn = spring({ frame: frame - 14, fps, config: { damping: 12, stiffness: 130 } });
  const tagIn = spring({ frame: frame - 24, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill
      style={{ background: theme.chrome, justifyContent: "center", alignItems: "center" }}
    >
      <Confetti from={4} originY={760} count={40} />
      <div style={{ opacity: eyeIn, transform: `scale(${eyeIn})` }}>
        <svg width="240" height="150" viewBox="0 0 220 140">
          <path
            d="M10 70 Q110 0 210 70 Q110 140 10 70 Z"
            fill="none"
            stroke={theme.amberOnDark}
            strokeWidth="6"
          />
          <circle cx="110" cy="70" r="34" fill={theme.amberOnDark} />
          <circle cx="110" cy="70" r="14" fill={theme.chrome} />
          <rect x="6" y={70 - 64 * lid} width="208" height={128 * lid} fill={theme.chrome} />
        </svg>
      </div>
      <div
        style={{
          fontFamily: fonts.ui,
          fontWeight: 800,
          fontSize: 96,
          letterSpacing: "0.04em",
          color: theme.chromeInk,
          marginTop: 56,
          opacity: wordIn,
          transform: `translateY(${interpolate(wordIn, [0, 1], [30, 0])}px)`,
        }}
      >
        CYCLOPS
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontStyle: "italic",
          fontSize: 48,
          color: theme.amberOnDark,
          marginTop: 18,
          opacity: tagIn,
        }}
      >
        Never say anything twice.
      </div>
    </AbsoluteFill>
  );
};

// ---- Bottom progress line (persistent motion) --------------------------------
const ProgressLine: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 384], [0, 1], { extrapolateRight: "clamp" });
  if (frame >= 388) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 12,
        width: `${p * 100}%`,
        background: grad,
        zIndex: 35,
      }}
    />
  );
};

// ---- Main composition --------------------------------------------------------
export const WatchItCount: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Audio src={staticFile("track.wav")} />

      {frame < 388 && <Background />}
      {frame < 386 && <PersistentCounter />}
      <ProgressLine />

      <Sequence from={118} durationInFrames={120}>
        <CardsLifecycle />
      </Sequence>

      <Sequence from={238} durationInFrames={60}>
        <FormsFilling />
      </Sequence>

      <Sequence from={298} durationInFrames={90}>
        <TheOneClick />
      </Sequence>

      <Sequence from={388} durationInFrames={62}>
        <EndCard />
      </Sequence>

      {/* swoosh wipes masking the scene cuts, on the beat */}
      <Swoosh from={112} color={theme.agentMark} />
      <Swoosh from={232} color={theme.ink} />
      <Swoosh from={292} color={theme.agentMark} />
      <Swoosh from={384} color={theme.ink} />
    </AbsoluteFill>
  );
};
