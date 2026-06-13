import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { theme, radius } from "./theme";
import { fonts } from "./fonts";

const W = 1080;

// ---- Persistent counter value across the whole reel --------------------------
const counterValue = (frame: number) => {
  if (frame < 45)
    return Math.round(
      interpolate(frame, [0, 45], [1, 41], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      }),
    );
  if (frame < 210)
    return Math.round(
      interpolate(frame, [45, 210], [41, 52], { extrapolateRight: "clamp" }),
    );
  if (frame < 300)
    return Math.round(
      interpolate(frame, [210, 300], [52, 8], {
        easing: Easing.in(Easing.cubic),
        extrapolateRight: "clamp",
      }),
    );
  if (frame < 318)
    return Math.round(
      interpolate(frame, [300, 318], [8, 1], { extrapolateRight: "clamp" }),
    );
  return 1;
};

const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      fontFamily: fonts.mono,
      fontSize: 26,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: theme.faint,
      ...style,
    }}
  >
    {children}
  </div>
);

// ---- Top-pinned counter ------------------------------------------------------
const PinnedCounter: React.FC = () => {
  const frame = useCurrentFrame();
  const value = counterValue(frame);
  const isOne = frame >= 300;

  const appear = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const leave = interpolate(frame, [378, 388], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Slam pulse as it hits 1.
  const slam = interpolate(frame, [300, 309, 320], [1, 1.18, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // "…and counting." flicker while it climbs.
  const counting =
    frame > 45 && frame < 205
      ? 0.35 + 0.4 * Math.abs(Math.sin(frame / 6))
      : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: appear * leave,
      }}
    >
      <Label>Times you'll type "Why this firm?":</Label>
      <div
        style={{
          fontFamily: fonts.mono,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          fontSize: 280,
          lineHeight: 1,
          marginTop: 18,
          color: isOne ? theme.agentMark : theme.ink,
          transform: `scale(${slam})`,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: fonts.ui,
          fontSize: 30,
          color: theme.accentText,
          height: 40,
          opacity: counting,
        }}
      >
        …and counting.
      </div>
    </div>
  );
};

// ---- Caption (big UI statement) ---------------------------------------------
const Caption: React.FC<{ text: string; from: number }> = ({ text, from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [40, 0]);
  return (
    <div
      style={{
        fontFamily: fonts.ui,
        fontWeight: 800,
        fontSize: 76,
        letterSpacing: "-0.02em",
        color: theme.ink,
        textAlign: "center",
        opacity: s,
        transform: `translateY(${y}px)`,
      }}
    >
      {text}
    </div>
  );
};

const QuestionCard: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: radius.card,
      padding: "30px 28px",
      fontFamily: fonts.ui,
      fontSize: 34,
      fontWeight: 600,
      color: theme.ink,
      boxShadow: "0 8px 24px rgba(43,39,34,0.06)",
      ...style,
    }}
  >
    Why this firm?
  </div>
);

// ---- Scene: 9 identical cards land, then collapse into one memory file -------
const CardsLifecycle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = 3;
  const rows = 3;
  const gap = 34;
  const gridW = 760;
  const cardW = (gridW - gap * (cols - 1)) / cols;
  const startX = (W - gridW) / 2;
  const startY = 640;
  const cardH = 118;

  const collapse = interpolate(frame, [75, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const targetX = W / 2 - cardW / 2;
  const targetY = startY + (cardH + gap) * 1; // center row

  return (
    <AbsoluteFill>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const land = spring({
          frame: frame - i * 5,
          fps,
          config: { damping: 14, stiffness: 120 },
        });
        const homeX = startX + c * (cardW + gap);
        const homeY = startY + r * (cardH + gap);
        const x = interpolate(collapse, [0, 1], [homeX, targetX]);
        const y = interpolate(collapse, [0, 1], [homeY, targetY]);
        const cardOpacity = i === 4 ? 1 : interpolate(collapse, [0.4, 1], [1, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: cardW,
              opacity: land * cardOpacity,
              transform: `scale(${interpolate(land, [0, 1], [0.8, 1])})`,
            }}
          >
            <QuestionCard />
          </div>
        );
      })}

      {/* The single glowing memory file the duplicates collapse into */}
      <div
        style={{
          position: "absolute",
          left: targetX,
          top: targetY,
          width: cardW,
          opacity: interpolate(collapse, [0.55, 1], [0, 1], {
            extrapolateLeft: "clamp",
          }),
          transform: `scale(${interpolate(collapse, [0.55, 1], [0.9, 1.06], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })})`,
        }}
      >
        <div
          style={{
            background: theme.accentTint,
            border: `2px solid ${theme.agentMark}`,
            borderRadius: radius.card,
            padding: "26px 24px",
            boxShadow: `0 0 ${interpolate(collapse, [0.6, 1], [0, 60])}px ${theme.agentMark}55`,
          }}
        >
          <Label style={{ color: theme.accentText, fontSize: 20 }}>
            memory · saved
          </Label>
          <div
            style={{
              fontFamily: fonts.ui,
              fontWeight: 700,
              fontSize: 32,
              color: theme.ink,
              marginTop: 8,
            }}
          >
            Why this firm? ✓
          </div>
        </div>
      </div>

      <Sequence from={88}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 1180 }}>
          <Caption text="Answer once." from={0} />
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};

// ---- Scene: three ATS forms fill sequentially --------------------------------
const FieldBar: React.FC<{ fill: number; w: number }> = ({ fill, w }) => (
  <div
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
        width: `${fill * 100}%`,
        background: theme.agentMark,
        borderRadius: radius.pill,
      }}
    />
  </div>
);

const AtsRow: React.FC<{ name: string; index: number }> = ({ name, index }) => {
  const frame = useCurrentFrame();
  // Each row fills in its own 28-frame window, staggered.
  const start = index * 28;
  const fill = interpolate(frame, [start, start + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const done = fill >= 1;
  const filling = fill > 0 && fill < 1;
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${filling ? theme.agentMark : theme.border}`,
        borderRadius: radius.card,
        padding: "30px 34px",
        marginBottom: 28,
        boxShadow: "0 8px 24px rgba(43,39,34,0.05)",
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
        <div
          style={{
            fontFamily: fonts.ui,
            fontWeight: 700,
            fontSize: 38,
            color: theme.ink,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: done ? theme.success : theme.faint,
            background: done ? "#e8efe6" : theme.surface3,
            borderRadius: radius.pill,
            padding: "8px 18px",
          }}
        >
          {done ? "filled ✓" : "awaiting your review"}
        </div>
      </div>
      <FieldBar fill={fill} w={560} />
      <FieldBar fill={Math.max(0, fill - 0.15) / 0.85} w={460} />
    </div>
  );
};

const FormsFilling: React.FC = () => {
  return (
    <AbsoluteFill style={{ padding: "560px 90px 0" }}>
      <AtsRow name="Greenhouse" index={0} />
      <AtsRow name="Lever" index={1} />
      <AtsRow name="Ashby" index={2} />
    </AbsoluteFill>
  );
};

// ---- Cursor ------------------------------------------------------------------
const Cursor: React.FC<{ x: number; y: number; press: number }> = ({
  x,
  y,
  press,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `scale(${interpolate(press, [0, 1], [1, 0.82])})`,
    }}
  >
    <svg width="64" height="64" viewBox="0 0 24 24">
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

  const rise = spring({ frame, fps, config: { damping: 200 } });
  const cardY = interpolate(rise, [0, 1], [760, 620]);

  // Cursor travels in, then clicks at ~frame 40.
  const cx = interpolate(frame, [0, 40], [820, 600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const cy = interpolate(frame, [0, 40], [1320, 1015], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const press = interpolate(frame, [40, 46, 54], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const submitted = frame >= 46;

  return (
    <AbsoluteFill>
      <Sequence from={4}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 520 }}>
          <Caption text="The 1 is your click." from={0} />
        </div>
      </Sequence>

      <div
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: cardY,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: radius.card,
          padding: "44px 44px 48px",
          boxShadow: "0 20px 60px rgba(43,39,34,0.10)",
          opacity: rise,
        }}
      >
        <Label style={{ fontSize: 22 }}>Ashby · application</Label>
        <div
          style={{
            fontFamily: fonts.ui,
            fontWeight: 700,
            fontSize: 40,
            color: theme.ink,
            margin: "14px 0 30px",
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

        <div
          style={{
            marginTop: 36,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              background: submitted ? theme.success : theme.chrome,
              color: theme.chromeInk,
              fontFamily: fonts.ui,
              fontWeight: 700,
              fontSize: 32,
              padding: "22px 44px",
              borderRadius: radius.pill,
              transform: `scale(${interpolate(press, [0, 1], [1, 0.96])})`,
            }}
          >
            {submitted ? "Submitted ✓" : "Submit application"}
          </div>
        </div>
      </div>

      <Cursor x={cx} y={cy} press={press} />
    </AbsoluteFill>
  );
};

// ---- End card ----------------------------------------------------------------
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Eye blink: lid closes then opens early, so the wordmark + tagline hold.
  const lid = interpolate(frame, [6, 12, 18], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eyeIn = spring({ frame, fps, config: { damping: 200 } });
  const wordIn = spring({ frame: frame - 14, fps, config: { damping: 200 } });
  const tagIn = spring({ frame: frame - 24, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        background: theme.chrome,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Minimal eye mark */}
      <div style={{ opacity: eyeIn, transform: `scale(${eyeIn})` }}>
        <svg width="220" height="140" viewBox="0 0 220 140">
          <path
            d="M10 70 Q110 0 210 70 Q110 140 10 70 Z"
            fill="none"
            stroke={theme.amberOnDark}
            strokeWidth="6"
          />
          <circle cx="110" cy="70" r="34" fill={theme.amberOnDark} />
          <circle cx="110" cy="70" r="14" fill={theme.chrome} />
          {/* blinking lid */}
          <rect
            x="6"
            y={70 - 64 * lid}
            width="208"
            height={128 * lid}
            fill={theme.chrome}
          />
        </svg>
      </div>

      <div
        style={{
          fontFamily: fonts.ui,
          fontWeight: 800,
          fontSize: 92,
          letterSpacing: "0.04em",
          color: theme.chromeInk,
          marginTop: 56,
          opacity: wordIn,
          transform: `translateY(${interpolate(wordIn, [0, 1], [24, 0])}px)`,
        }}
      >
        CYCLOPS
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontStyle: "italic",
          fontSize: 46,
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

// ---- Main composition --------------------------------------------------------
export const WatchItCount: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: theme.canvas }}>
      {frame < 388 && <PinnedCounter />}

      <Sequence from={45} durationInFrames={165}>
        <CardsLifecycle />
      </Sequence>

      <Sequence from={210} durationInFrames={90}>
        <FormsFilling />
      </Sequence>

      <Sequence from={300} durationInFrames={90}>
        <TheOneClick />
      </Sequence>

      <Sequence from={388} durationInFrames={62}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
