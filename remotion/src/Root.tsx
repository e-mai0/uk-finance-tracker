import React, { useEffect, useState } from "react";
import { Composition, continueRender, delayRender } from "remotion";
import { WatchItCount } from "./WatchItCount";
import { Countdown } from "./videos/Countdown";
import { Comeback } from "./videos/Comeback";
import { NightShift } from "./videos/NightShift";
import { TheOdds } from "./videos/TheOdds";
import { FONT_SPECS } from "./fonts";

// Force-load + await the self-hosted fonts before the first frame renders.
const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    Promise.all(FONT_SPECS.map((s) => (document as any).fonts.load(s)))
      .then(() => (document as any).fonts.ready)
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
  return <>{children}</>;
};

const gate = (C: React.FC) => (props: any) => (
  <FontGate>
    <C {...props} />
  </FontGate>
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="WatchItCount" component={gate(WatchItCount)} durationInFrames={450} fps={30} width={1080} height={1920} />
      <Composition id="Countdown" component={gate(Countdown)} durationInFrames={660} fps={30} width={1080} height={1920} />
      <Composition id="Comeback" component={gate(Comeback)} durationInFrames={510} fps={30} width={1080} height={1920} />
      <Composition id="NightShift" component={gate(NightShift)} durationInFrames={540} fps={30} width={1080} height={1920} />
      <Composition id="TheOdds" component={gate(TheOdds)} durationInFrames={480} fps={30} width={1080} height={1920} />
    </>
  );
};
