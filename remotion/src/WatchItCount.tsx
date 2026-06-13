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
import {
  W,
  H,
  FPB,
  GRAD,
  beatBump,
  ease,
  overshoot,
  WaveSwoosh,
  Confetti,
  Cursor,
  EyeMark,
  QCard,
  FolderFan,
  FormPanel,
  RewardBar,
  CheckBurst,
  Toggle,
  PillMorph,
  Trail,
} from "./kit";

// ---- Persistent counter value ------------------------------------------------
const counterValue = (frame: number) => {
  if (frame < 40)
    return Math.round(interpolate(frame, [0, 40], [3, 47], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  if (frame < 255) return 47;
  if (frame < 300) return Math.round(interpolate(frame, [255, 300], [47, 6], { easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp" }));
  if (frame < 348) return Math.round(interpolate(frame, [300, 348], [6, 1], { extrapolateRight: "clamp" }));
  return 1;
};

// ---- Crisp white stage with a faint beating gold glow ------------------------
const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  const s = 1 + 0.04 * beatBump(frame);
  return (
    <AbsoluteFill style={{ background: theme.paper, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "46%",
          width: 1500,
          height: 1500,
          marginLeft: -750,
          marginTop: -750,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accentSoft} 0%, transparent 62%)`,
          opacity: 0.5,
          transform: `scale(${s})`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---- Persistent counter (big center -> pinned top, slams to 1) ---------------
const Counter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = counterValue(frame);
  const isOne = frame >= 348;

  const cy = interpolate(frame, [0, 30, 50], [680, 680, 108], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const cs = interpolate(frame, [30, 50], [1, 0.34], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const intro = spring({ frame: frame - 2, fps, config: overshoot });
  const slam = interpolate(frame, [348, 357, 372], [1, 1.25, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const leave = interpolate(frame, [352, 360], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + 0.07 * beatBump(frame);
  const counting = frame > 14 && frame < 86 ? 0.45 + 0.4 * Math.abs(Math.sin(frame / 4)) : 0;
  const ringAge = (frame % FPB) / FPB;
  const hookGlow = interpolate(frame, [0, 50], [1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ zIndex: 45, opacity: leave, transform: `translateY(${cy}px) scale(${cs * pulse * intro})`, transformOrigin: "50% 0%" }}>
      <div style={{ textAlign: "center", position: "relative" }}>
        <div style={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 42, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.subtle }}>
          Times you'll type "Why this firm?":
        </div>
        <div style={{ position: "relative", height: 320 }}>
          {/* warm glow disc behind the number so the hook isn't an empty white field */}
          <div style={{ position: "absolute", left: "50%", top: 160, width: 760, height: 760, marginLeft: -380, marginTop: -380, borderRadius: "50%", background: `radial-gradient(circle, ${theme.gold2} 0%, transparent 60%)`, opacity: 0.55 * hookGlow, transform: `scale(${1 + 0.05 * beatBump(frame)})` }} />
          <div style={{ position: "absolute", left: "50%", top: 150, width: 400, height: 400, marginLeft: -200, marginTop: -200, border: `6px solid ${theme.agentMark}`, borderRadius: "50%", opacity: (1 - ringAge) * 0.6, transform: `scale(${0.5 + ringAge * 1.25})` }} />
          <div style={{ fontFamily: fonts.mono, fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 320, lineHeight: "320px", color: isOne ? theme.agentMark : theme.ink, transform: `scale(${slam})`, textShadow: "0 12px 44px rgba(43,39,34,0.16)" }}>
            {value}
          </div>
        </div>
        <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 38, color: theme.accentText, height: 48, opacity: counting }}>…and counting.</div>
      </div>
    </AbsoluteFill>
  );
};

const Punch: React.FC<{ text: string; from: number; top: number; color?: string; size?: number }> = ({ text, from, top, color = theme.ink, size = 92 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: overshoot });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", fontFamily: fonts.ui, fontWeight: 800, fontSize: size, letterSpacing: "-0.03em", color, opacity: interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }), transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})` }}>
      {text}
    </div>
  );
};

// ===== SCENE: hook card slide-in (0-30) ======================================
const HookCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const x = interpolate(frame, [0, 13], [-760, 0], { extrapolateRight: "clamp", easing: ease });
  const pop = spring({ frame: frame - 12, fps, config: overshoot });
  const out = interpolate(frame, [24, 30], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame > 30) return null;
  // slide in + springy scale pop — no Y-flip (a mid-flip renders the text as gibberish)
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Trail layers={4} lagInFrames={0.7} trailOpacity={0.4}>
        <div style={{ transform: `translateX(${x}px) scale(${1 + 0.12 * pop})`, marginTop: 360, opacity: out }}>
          <QCard />
        </div>
      </Trail>
    </AbsoluteFill>
  );
};

// ===== SCENE: the pile — cards stack in 3D, push-in, peak (30-90) =============
const Pile: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const N = 22;
  // camera pushes in hard and tilts — strong perspective recede so cards pile, not float
  const camScale = interpolate(frame, [0, 60], [0.8, 1.22], { easing: ease });
  const camRotX = interpolate(frame, [0, 60], [10, 30], { easing: ease });
  const jitter = frame > 48 ? (random(`j${Math.floor(frame / 2)}`) - 0.5) * 18 * interpolate(frame, [48, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill style={{ perspective: 1100 }}>
      {/* cards live BELOW the pinned counter and stack toward the camera */}
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `translateX(${jitter}px) scale(${camScale}) rotateX(${camRotX}deg)`, transformOrigin: "50% 82%" }}>
        {Array.from({ length: N }).map((_, i) => {
          const enter = spring({ frame: frame - i * 2.0, fps, config: overshoot });
          const col = i % 3;
          const rowi = Math.floor(i / 3);
          // tight, overlapping placement that bleeds past the edges -> "more than fits"
          const homeX = 30 + col * 250 + (random(`x${i}`) - 0.5) * 130;
          const homeY = 400 + rowi * 96 + (random(`y${i}`) - 0.5) * 40;
          const rot = (random(`r${i}`) - 0.5) * 16;
          const z = i * 26; // newest cards loom large + occlude the ones beneath
          const fromY = homeY - 1700;
          const y = interpolate(enter, [0, 1], [fromY, homeY]);
          const card = (
            <div style={{ position: "absolute", left: homeX, top: y, opacity: enter, transform: `translateZ(${z}px) scale(${0.92 + 0.04 * beatBump(frame)})` }}>
              <QCard rot={rot} />
            </div>
          );
          return frame - i * 2.0 < 8 ? (
            <Trail key={i} layers={3} lagInFrames={0.7} trailOpacity={0.35}>{card}</Trail>
          ) : (
            <React.Fragment key={i}>{card}</React.Fragment>
          );
        })}
      </div>
      {frame >= 58 && <Punch text="…again?" from={60} top={1500} color={theme.accentText} size={76} />}
    </AbsoluteFill>
  );
};

// ===== SCENE: the answer — memory + folder fan (100-150) =====================
const Answer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 4, fps, config: overshoot });
  const fan = interpolate(frame, [22, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const glow = 30 + 50 * beatBump(frame);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", top: 340 }}>
        <FolderFan progress={fan} labels={["Greenhouse", "Lever", "Ashby", "Workday"]} />
      </div>
      <div style={{ position: "absolute", top: 240, transform: `scale(${interpolate(pop, [0, 1], [0.2, 1])})`, opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }) }}>
        <div style={{ background: theme.accentTint, border: `3px solid ${theme.agentMark}`, borderRadius: radius.card, padding: "26px 30px", boxShadow: `0 0 ${glow}px ${theme.agentMark}66`, width: 460 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.accentText }}>memory · saved once</div>
          <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 40, color: theme.ink, marginTop: 8 }}>Why this firm? ✓</div>
        </div>
      </div>
      {frame >= 18 && <Confetti from={20} originY={520} count={36} burst={0.8} />}
      <Punch text="Answer once." from={30} top={1280} />
    </AbsoluteFill>
  );
};

// ===== SCENE: 3D form carousel (150-210) =====================================
const Carousel: React.FC = () => {
  const frame = useCurrentFrame();
  const cards = [
    { name: "Greenhouse", note: "Two years captaining a college VIII taught me how small margins compound." },
    { name: "Lever", note: "I rebuilt our hackathon pricing tool at 3am — that's when models earn their assumptions." },
    { name: "Ashby", note: "I took the securities module everyone avoids; it rewired how I read a balance sheet." },
  ];
  // coverflow: a strip of 3 cards, the active one front+centre, siblings angled in 3D
  const active = interpolate(frame, [0, 60], [0, 2], { easing: Easing.inOut(Easing.cubic) });
  const fillFor = (i: number) => {
    const front = i * 26 + 4;
    return interpolate(frame, [front - 6, front + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  };
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", perspective: 1500 }}>
      <div style={{ position: "relative", width: 1, height: 1, transformStyle: "preserve-3d", marginTop: 40 }}>
        {cards.map((c, i) => {
          const d = i - active; // distance from centre slot
          const x = d * 360;
          const ry = -d * 38;
          const z = -Math.abs(d) * 260;
          const scale = interpolate(Math.abs(d), [0, 1.4], [1.06, 0.84], { extrapolateRight: "clamp" });
          const op = interpolate(Math.abs(d), [0, 1.5], [1, 0.5], { extrapolateRight: "clamp" });
          return (
            <div key={c.name} style={{ position: "absolute", left: -290, top: -210, width: 580, transformStyle: "preserve-3d", transform: `translateX(${x}px) translateZ(${z}px) rotateY(${ry}deg) scale(${scale})`, opacity: op, zIndex: 100 - Math.round(Math.abs(d) * 10) }}>
              <FormPanel name={c.name} fill={fillFor(i)} note={c.note} width={580} />
            </div>
          );
        })}
      </div>
      <Punch text="In your voice. Tuned to each firm." from={30} top={1340} size={64} />
    </AbsoluteFill>
  );
};

// ===== SCENE: reward bar -> checkmark + confetti (210-255) ====================
const Reward: React.FC = () => {
  const frame = useCurrentFrame();
  const fill = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const showCheck = frame >= 20;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {!showCheck && <RewardBar fill={fill} />}
      {showCheck && (
        <>
          <CheckBurst spawn={20} />
          <Confetti from={21} originY={900} count={70} burst={1.15} />
        </>
      )}
    </AbsoluteFill>
  );
};

// ===== SCENE: tactile beats — toggle + pill morph (255-300) ==================
const Tactile: React.FC = () => {
  const frame = useCurrentFrame();
  const tog = interpolate(frame, [6, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const morph = interpolate(frame, [24, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const cx = interpolate(frame, [0, 10], [720, 600], { extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 60, alignItems: "center", marginTop: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: 36, color: theme.ink }}>Use my real stories</div>
          <Toggle on={tog} />
        </div>
        <div style={{ transform: `scale(${1 + 0.1 * morph})` }}>
          <PillMorph morph={morph} label="Tuned to each firm" />
        </div>
      </div>
      <Cursor x={cx} y={760} press={interpolate(frame, [10, 14, 20], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};

// ===== SCENE: hero — riser + the one click (300-360) =========================
const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - 4, fps, config: overshoot });
  const cardY = interpolate(rise, [0, 1], [840, 640]);
  const CLICK = 48; // global 348
  const cx = interpolate(frame, [12, CLICK], [860, 600], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const cyy = interpolate(frame, [12, CLICK], [1360, 1010], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const press = interpolate(frame, [CLICK, CLICK + 5, CLICK + 12], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const submitted = frame >= CLICK + 4;
  return (
    <AbsoluteFill>
      <Sequence from={20}>
        <Punch text="The 1 is your click." from={0} top={460} />
      </Sequence>
      <div style={{ position: "absolute", left: 140, right: 140, top: cardY, background: theme.paper, border: `1px solid ${theme.border}`, borderRadius: radius.card, padding: "44px 44px 48px", boxShadow: "0 30px 76px rgba(43,39,34,0.18)", opacity: rise, transform: `scale(${interpolate(rise, [0, 1], [0.9, 1])})` }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.faint }}>Ashby · application</div>
        <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 44, color: theme.ink, margin: "14px 0 28px" }}>Why this firm?</div>
        <div style={{ background: theme.accentTint, border: `1px solid ${theme.border}`, borderRadius: radius.control, padding: "24px 26px", fontFamily: fonts.ui, fontSize: 28, lineHeight: 1.5, color: theme.muted }}>
          Drafted from your memory, in your voice — ready for your read.
        </div>
        <div style={{ marginTop: 34, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ background: submitted ? GRAD : theme.chrome, color: "#fff", fontFamily: fonts.ui, fontWeight: 800, fontSize: 34, padding: "24px 48px", borderRadius: radius.pill, transform: `scale(${interpolate(press, [0, 1], [1, 0.94])})`, boxShadow: submitted ? `0 0 44px ${theme.gold}aa` : "none" }}>
            {submitted ? "Submitted ✓" : "Submit application"}
          </div>
        </div>
      </div>
      <Cursor x={cx} y={cyy} press={press} blur />
      {/* burst low + around the button so flecks don't smear across the body copy */}
      {frame >= CLICK + 2 && <Confetti from={CLICK + 2} originY={1140} count={56} burst={1.25} />}
    </AbsoluteFill>
  );
};

// ===== SCENE: transform "1" -> eye, then lockup (360-450) ====================
const Transform: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // local 0-30: big "1" morphs into eye; wave handled in root at ~388
  const morph = interpolate(frame, [4, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const oneOpacity = interpolate(morph, [0, 0.6], [1, 0], { extrapolateRight: "clamp" });
  const eyeOpacity = interpolate(morph, [0.4, 1], [0, 1], { extrapolateLeft: "clamp" });

  // lockup after frame 30 (global 390)
  const L = frame - 30;
  const dark = L >= -2;
  const blink = interpolate(L, [8, 14, 20], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyeIn = spring({ frame: L, fps, config: overshoot });
  const wordIn = spring({ frame: L - 14, fps, config: overshoot });
  const tagIn = spring({ frame: L - 26, fps, config: { damping: 200 } });

  if (frame < 30) {
    const glow = 0.6 + 0.4 * beatBump(frame);
    // cut to a dark field almost immediately so the gold "1" + eye glow throughout
    const darken = interpolate(frame, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
    const almond = interpolate(morph, [0.05, 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // outline draws in
    const oneSquash = interpolate(morph, [0.3, 0.62], [1, 0.16], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // 1 flattens into the iris line
    const oneOpac = interpolate(morph, [0, 0.5, 0.72], [1, 1, 0], { extrapolateRight: "clamp" });
    const iris = interpolate(morph, [0.55, 0.85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // iris + pupil grow from the line
    const bloom = interpolate(morph, [0.35, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: `rgb(${43 * (1 - 0)}, 39, 34)`, opacity: 1 }}>
        <AbsoluteFill style={{ background: theme.chrome, opacity: darken }} />
        <div style={{ position: "absolute", width: 1200, height: 1200, borderRadius: "50%", background: `radial-gradient(circle, ${theme.gold} 0%, transparent 55%)`, opacity: 0.5 * glow * bloom, transform: `scale(${0.7 + 0.4 * morph})` }} />
        {/* the numeral "1", bright gold, squashing down into the iris line */}
        <div style={{ position: "absolute", opacity: oneOpac, transform: `scaleY(${oneSquash})`, fontFamily: fonts.mono, fontWeight: 700, fontSize: 460, lineHeight: "460px", color: theme.gold2, textShadow: `0 0 ${50 * glow}px ${theme.gold}` }}>1</div>
        {/* eye outline draws in; iris + pupil grow out of the flattened 1 */}
        <div style={{ position: "absolute", filter: `drop-shadow(0 0 ${60 * glow}px ${theme.gold})` }}>
          <svg width="760" height="486" viewBox="0 0 220 140">
            <path d="M10 70 Q110 0 210 70 Q110 140 10 70 Z" fill="none" stroke={theme.gold} strokeWidth="6" opacity={almond} />
            <circle cx="110" cy="70" r={34 * iris} fill={theme.gold} />
            <circle cx="110" cy="70" r={14 * iris} fill={theme.chrome} />
          </svg>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: dark ? theme.chrome : "transparent", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: eyeIn, transform: `scale(${eyeIn})`, filter: `drop-shadow(0 0 ${30 + 30 * beatBump(L)}px ${theme.gold}aa)` }}>
        <EyeMark size={250} blink={blink} stroke={theme.gold} />
      </div>
      <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 98, letterSpacing: "0.04em", color: theme.chromeInk, marginTop: 54, opacity: wordIn, transform: `translateY(${interpolate(wordIn, [0, 1], [30, 0])}px)` }}>CYCLOPS</div>
      <div style={{ fontFamily: fonts.display, fontStyle: "italic", fontSize: 48, color: theme.gold, marginTop: 18, opacity: tagIn }}>Never say anything twice.</div>
    </AbsoluteFill>
  );
};

// ---- Bottom progress line ----------------------------------------------------
const ProgressLine: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 360], [0, 1], { extrapolateRight: "clamp" });
  if (frame >= 360) return null;
  return <div style={{ position: "absolute", left: 0, bottom: 0, height: 10, width: `${p * 100}%`, background: GRAD, zIndex: 35 }} />;
};

// ===== ROOT ===================================================================
export const WatchItCount: React.FC = () => {
  const frame = useCurrentFrame();
  const darkBg = frame >= 388;
  return (
    <AbsoluteFill style={{ background: darkBg ? theme.chrome : theme.paper }}>
      <Audio src={staticFile("track.wav")} />

      {!darkBg && <Stage />}
      {frame < 358 && <Counter />}
      <ProgressLine />

      <Sequence from={0} durationInFrames={30}><HookCard /></Sequence>
      <Sequence from={30} durationInFrames={62}><Pile /></Sequence>
      <Sequence from={100} durationInFrames={52}><Answer /></Sequence>
      <Sequence from={150} durationInFrames={62}><Carousel /></Sequence>
      <Sequence from={210} durationInFrames={47}><Reward /></Sequence>
      <Sequence from={255} durationInFrames={47}><Tactile /></Sequence>
      <Sequence from={300} durationInFrames={62}><Hero /></Sequence>
      <Sequence from={360} durationInFrames={90}><Transform /></Sequence>

      {/* liquid wave wipes on the beat */}
      <WaveSwoosh from={90} idSuffix="a" />
      <WaveSwoosh from={146} idSuffix="b" />
      <WaveSwoosh from={205} idSuffix="c" />
      <WaveSwoosh from={251} idSuffix="d" />
      <WaveSwoosh from={384} idSuffix="e" />
    </AbsoluteFill>
  );
};
