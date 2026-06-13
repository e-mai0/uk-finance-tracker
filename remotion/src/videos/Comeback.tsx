import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ED, Eyebrow, Ghost, Display, Kicker, Card, Stamp, Lockup, Music, Vo } from "../editorial";
import { WaveSwoosh, Confetti } from "../kit";
import { fonts } from "../fonts";

const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: ED.linen, overflow: "hidden" }}>{children}</AbsoluteFill>
);

const Reject: React.FC = () => (
  <Scene>
    <Ghost char="L" x={0.66} y={0.34} />
    <Eyebrow text="APPLICATION UPDATE" />
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Card from={6} style={{ width: 820 }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 22, color: ED.amber, marginBottom: 14 }}>◆ morgan stanley · tech analyst</div>
        <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 48, color: ED.ink }}>Application status</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 24, color: ED.faint, marginTop: 10 }}>updated just now</div>
      </Card>
      <Stamp text="Rejected" from={26} left="62%" top="52%" />
    </AbsoluteFill>
  </Scene>
);

const NowWatch: React.FC = () => (
  <Scene>
    <Ghost char="W" x={0.6} y={0.32} />
    <Eyebrow text="PLOT TWIST LOADING" />
    <Display top={640} size={170} bold="cool." accent="now watch." from={6} />
    <Kicker text="every L is training data." from={30} />
  </Scene>
);

const Rewrite: React.FC = () => (
  <Scene>
    <Ghost char="5" x={0.62} y={0.3} />
    <Eyebrow text="REWRITING YOUR PLAYBOOK" />
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Card from={6} style={{ width: 860, marginTop: 360, textAlign: "left" }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 22, color: ED.amber, marginBottom: 14 }}>¶ voice.md · learned from the loss</div>
        <div style={{ background: ED.greenSoft, borderRadius: 14, padding: "20px 24px", fontFamily: fonts.ui, fontWeight: 700, fontSize: 34, color: ED.ink }}>
          + lead with the hackathon story.
        </div>
        <div style={{ marginTop: 22, background: ED.ink, color: ED.linen, fontFamily: fonts.ui, fontWeight: 700, fontSize: 30, padding: "14px 36px", borderRadius: 999, display: "inline-block" }}>Review draft</div>
      </Card>
      <Card from={30} style={{ width: 860, marginTop: 28, textAlign: "left" }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 22, color: ED.amber, marginBottom: 12 }}>◆ next up — goldman sachs</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: 44, color: ED.ink }}>Answer drafted</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 30, color: ED.green }}>fit <span style={{ fontSize: 56, fontWeight: 700 }}>82</span></div>
        </div>
        <div style={{ fontFamily: fonts.mono, fontSize: 20, color: ED.faint, marginTop: 8 }}>fit = match to the role's posted criteria</div>
      </Card>
    </AbsoluteFill>
    <Kicker text="it learns. you level up." from={56} />
  </Scene>
);

export const Comeback: React.FC = () => (
  <AbsoluteFill style={{ background: ED.linen }}>
    <Music vol={0.24} />
    <Vo name="b1" from={10} />
    <Vo name="b2" from={128} />
    <Vo name="b3" from={262} />
    <Vo name="b5" from={440} />

    <Sequence from={0} durationInFrames={120}><Reject /></Sequence>
    <Sequence from={120} durationInFrames={135}><NowWatch /></Sequence>
    <Sequence from={255} durationInFrames={165}><Rewrite /></Sequence>
    <Sequence from={420} durationInFrames={90}>
      <AbsoluteFill style={{ background: ED.linen }}><Confetti from={4} originY={760} count={40} burst={0.9} /><Lockup tagline="Ws only." /></AbsoluteFill>
    </Sequence>

    <WaveSwoosh from={114} idSuffix="cb1" />
    <WaveSwoosh from={249} idSuffix="cb2" />
    <WaveSwoosh from={414} idSuffix="cb3" />

    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 34, pointerEvents: "none" }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 20, color: ED.faint, letterSpacing: "0.08em" }}>you review + send · cyclops never submits</div>
    </AbsoluteFill>
  </AbsoluteFill>
);
