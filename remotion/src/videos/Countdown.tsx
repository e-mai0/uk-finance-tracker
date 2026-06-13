import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { ED, Eyebrow, Ghost, Display, Kicker, Card, Lockup, Music, Vo, NarratorCam } from "../editorial";
import { WaveSwoosh, beatBump } from "../kit";
import { fonts } from "../fonts";

const Scene: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = ED.linen }) => (
  <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>{children}</AbsoluteFill>
);

const Hook: React.FC = () => (
  <Scene>
    <Ghost char="05" x={0.62} y={0.3} />
    <Eyebrow text="CYCLOPS · INTERVIEW MODE" />
    <Display
      top={520}
      size={188}
      bold={<>5 <span style={{ color: ED.amber }}>DAYS.</span></>}
      sub="till your Citadel interview"
      from={6}
    />
    <Kicker text="the panic is real." from={26} />
  </Scene>
);

const Ask: React.FC = () => {
  const frame = useCurrentFrame();
  const caret = Math.floor(frame / 8) % 2 === 0 ? "|" : " ";
  return (
    <Scene>
      <Ghost char="?" x={0.6} y={0.32} />
      <Eyebrow text="ASK CYCLOPS" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Card from={6} style={{ width: 760, marginTop: 40 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, color: ED.amber, marginBottom: 18 }}>&gt; ask cyclops…</div>
          <div style={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: 40, color: ED.ink, lineHeight: 1.3 }}>
            How do I prep for my Citadel interview{caret}
          </div>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
            <div style={{ background: ED.ink, color: ED.linen, fontFamily: fonts.ui, fontWeight: 700, fontSize: 30, padding: "16px 40px", borderRadius: 999 }}>Send</div>
          </div>
        </Card>
      </AbsoluteFill>
      <Kicker text="no tabs. no panic. just ask." from={30} />
    </Scene>
  );
};

const Working: React.FC = () => {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [6, 40], [0, 38], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Scene>
      <Ghost char="38" x={0.6} y={0.26} />
      <Eyebrow text="CYCLOPS IS WORKING…" />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 360, fontFamily: fonts.display, fontWeight: 700, fontSize: 240, color: ED.ink, transform: `scale(${1 + 0.04 * beatBump(frame)})` }}>{n}</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 28, color: ED.sub, letterSpacing: "0.05em" }}>public interview write-ups · read</div>
        <Card from={44} style={{ width: 820, marginTop: 48, textAlign: "left" }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 22, color: ED.amber, marginBottom: 16 }}>◆ your prep plan · built in 90 seconds</div>
          <div style={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: 34, color: ED.ink, marginBottom: 12 }}>Day 1–2 · arrays + probability drills</div>
          <div style={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: 34, color: ED.ink }}>Day 3 · mock behavioral — hackathon story</div>
        </Card>
      </AbsoluteFill>
      <Kicker text="a real plan. in 90 seconds." from={60} />
    </Scene>
  );
};

const Day: React.FC = () => (
  <Scene>
    <Ghost char="GO" x={0.5} y={0.3} />
    <Eyebrow text="INTERVIEW DAY" />
    <Display top={680} size={140} bold="DAY 5." accent="you walk in ready." accentColor={ED.green} from={6} />
    <Kicker text="38 reports. 1 plan. 0 panic." from={30} />
  </Scene>
);

export const Countdown: React.FC = () => (
  <AbsoluteFill style={{ background: ED.linen }}>
    <Music vol={0.22} />
    <Vo name="c1" from={10} />
    <Vo name="c2" from={142} />
    <Vo name="c3" from={262} />
    <Vo name="c4" from={472} />
    <Vo name="c5" from={590} />

    <Sequence from={0} durationInFrames={135}><Hook /></Sequence>
    <Sequence from={135} durationInFrames={120}><Ask /></Sequence>
    <Sequence from={255} durationInFrames={210}><Working /></Sequence>
    <Sequence from={465} durationInFrames={120}><Day /></Sequence>
    <Sequence from={585} durationInFrames={75}><Lockup tagline="Ws only." /></Sequence>

    <Sequence from={0} durationInFrames={582}>
      <NarratorCam corner="bl" eqWindows={[[10, 107], [142, 251], [262, 468], [472, 572]]} />
    </Sequence>

    <WaveSwoosh from={129} idSuffix="cd1" />
    <WaveSwoosh from={249} idSuffix="cd2" />
    <WaveSwoosh from={459} idSuffix="cd3" />
    <WaveSwoosh from={579} idSuffix="cd4" />
  </AbsoluteFill>
);
