import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ED, Eyebrow, Ghost, Display, Kicker, Card, LogLines, Lockup, Music, Vo } from "../editorial";
import { WaveSwoosh } from "../kit";

const NightHook: React.FC = () => (
  <AbsoluteFill style={{ background: ED.night, overflow: "hidden" }}>
    <Ghost char="Z" dark x={0.55} y={0.26} />
    <Eyebrow text="CYCLOPS · NIGHT SHIFT" dark />
    <Display top={560} size={150} dark bold={<>3:47<br />AM</>} sub="you: asleep · cyclops: locked in" from={6} />
    <Kicker text="the night shift is real." from={30} dark />
  </AbsoluteFill>
);

const Log: React.FC = () => (
  <AbsoluteFill style={{ background: ED.night, overflow: "hidden" }}>
    <Ghost char="03" dark x={0.6} y={0.28} />
    <Eyebrow text="WHILE YOU SLEEP" dark />
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Card from={6} dark style={{ width: 880, marginTop: 80, textAlign: "left" }}>
        <div style={{ fontFamily: "monospace", fontSize: 24, color: ED.amber, marginBottom: 22, letterSpacing: "0.04em" }}>◆ cyclops · night shift_</div>
        <LogLines
          dark
          from={16}
          rows={[
            ["03:47", "drafting J.P. Morgan answer…"],
            ["03:52", "answer 2 drafted ✓"],
            ["04:12", "refreshed 14 listings"],
          ]}
        />
      </Card>
    </AbsoluteFill>
    <Kicker text="it never stops applying pressure." from={56} dark />
  </AbsoluteFill>
);

const Morning: React.FC = () => (
  <AbsoluteFill style={{ background: ED.linen, overflow: "hidden" }}>
    <Ghost char="07" x={0.6} y={0.28} />
    <Eyebrow text="GOOD MORNING, ERIC" />
    <Display top={560} size={170} bold="07:00" accent="you're already ahead." accentColor={ED.green} sub="✓ 2 drafted" from={6} />
    <Kicker text="wake up ahead. every day." from={34} />
  </AbsoluteFill>
);

export const NightShift: React.FC = () => (
  <AbsoluteFill style={{ background: ED.night }}>
    <Music vol={0.18} />
    <Vo name="n1" from={10} />
    <Vo name="n2" from={188} />
    <Vo name="n3" from={338} />
    <Vo name="n5" from={456} />

    <Sequence from={0} durationInFrames={180}><NightHook /></Sequence>
    <Sequence from={180} durationInFrames={150}><Log /></Sequence>
    <Sequence from={330} durationInFrames={126}><Morning /></Sequence>
    <Sequence from={456} durationInFrames={84}><Lockup tagline="While you sleep." /></Sequence>

    <WaveSwoosh from={174} idSuffix="ns1" />
    <WaveSwoosh from={324} idSuffix="ns2" />
    <WaveSwoosh from={450} idSuffix="ns3" />
  </AbsoluteFill>
);
