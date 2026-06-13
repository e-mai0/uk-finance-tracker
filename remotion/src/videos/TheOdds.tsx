import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { ED, Eyebrow, Ghost, Display, Kicker, Card, Lockup, Music, Vo, NarratorCam } from "../editorial";
import { WaveSwoosh, Confetti, beatBump } from "../kit";
import { fonts } from "../fonts";

const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: ED.linen, overflow: "hidden" }}>{children}</AbsoluteFill>
);

// big counting "200"
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [6, 46], [1, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Scene>
      <Ghost char="200" x={0.5} y={0.3} />
      <Eyebrow text="CYCLOPS · THE ODDS" />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 470, fontFamily: fonts.display, fontWeight: 700, fontSize: 320, color: ED.ink, lineHeight: 1, transform: `scale(${1 + 0.05 * beatBump(frame)})` }}>{n}</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 32, color: ED.sub, letterSpacing: "0.05em", marginTop: 4 }}>applicants · <span style={{ color: ED.amber }}>1</span> spring analyst role</div>
      </AbsoluteFill>
      <Kicker text="everyone sends the same answer." from={30} />
    </Scene>
  );
};

// identical bland answers stacking, greying out
const Same: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Scene>
      <Ghost char="=" x={0.6} y={0.32} />
      <Eyebrow text="THE SLUSH PILE" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        {[0, 1, 2].map((i) => {
          const fr = 6 + i * 7;
          const op = interpolate(frame, [fr, fr + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const y = interpolate(frame, [fr, fr + 8], [60, i * 150 - 150], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ position: "absolute", width: 760, opacity: op * 0.9, transform: `translateY(${y}px) rotate(${(i - 1) * 2}deg)` }}>
              <div style={{ background: ED.linen2, border: `1px solid ${ED.cardLine}`, borderRadius: 18, padding: "26px 30px", fontFamily: fonts.ui, fontSize: 30, color: ED.faint, boxShadow: "0 14px 30px rgba(33,30,25,0.08)" }}>
                “I am a hard-working team player passionate about finance…”
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", top: "60%", fontFamily: fonts.mono, fontSize: 30, color: ED.faint, letterSpacing: "0.06em", opacity: interpolate(frame, [26, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          + 197 more
        </div>
      </AbsoluteFill>
      <Kicker text="recruiters read 200 of these." from={34} />
    </Scene>
  );
};

// Cyclops makes one specific — lights amber, fit 94
const Specific: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Scene>
      <Ghost char="1" x={0.62} y={0.3} />
      <Eyebrow text="GROUNDED IN YOUR STORIES" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Card from={6} style={{ width: 840, border: `2px solid ${ED.amber}`, boxShadow: `0 0 ${40 + 40 * beatBump(frame)}px ${ED.amber}44` }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 22, color: ED.amber, marginBottom: 16 }}>◆ your answer · in your voice</div>
          <div style={{ fontFamily: fonts.ui, fontStyle: "italic", fontSize: 36, color: ED.ink, lineHeight: 1.4 }}>
            “I rebuilt our hackathon pricing tool at 3am — that's when models earn their assumptions.”
          </div>
          <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 20, color: ED.faint }}>fit = match to the role's posted criteria</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 30, color: ED.green }}>fit <span style={{ fontSize: 56, fontWeight: 700, marginLeft: 10 }}>94</span></div>
          </div>
        </Card>
      </AbsoluteFill>
      <Kicker text="yours is the one they remember." from={40} />
    </Scene>
  );
};

export const TheOdds: React.FC = () => (
  <AbsoluteFill style={{ background: ED.linen }}>
    <Music vol={0.22} />
    <Vo name="o1" from={10} />
    <Vo name="o2" from={140} />
    <Vo name="o3" from={278} />
    <Vo name="o4" from={412} />
    <Vo name="o5" from={452} />

    <Sequence from={0} durationInFrames={135}><Hook /></Sequence>
    <Sequence from={135} durationInFrames={135}><Same /></Sequence>
    <Sequence from={270} durationInFrames={135}><Specific /></Sequence>
    <Sequence from={405} durationInFrames={75}>
      <AbsoluteFill style={{ background: ED.linen }}><Confetti from={4} originY={760} count={36} burst={0.85} /><Lockup tagline="Be the 1." /></AbsoluteFill>
    </Sequence>

    <Sequence from={0} durationInFrames={402}>
      <NarratorCam corner="bl" eqWindows={[[10, 110], [140, 222], [278, 402]]} />
    </Sequence>

    <WaveSwoosh from={129} idSuffix="od1" />
    <WaveSwoosh from={264} idSuffix="od2" />
    <WaveSwoosh from={399} idSuffix="od3" />
  </AbsoluteFill>
);
