import React, { useEffect, useState } from "react";
import { Composition, continueRender, delayRender } from "remotion";
import { WatchItCount } from "./WatchItCount";
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

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WatchItCount"
      component={(props) => (
        <FontGate>
          <WatchItCount {...props} />
        </FontGate>
      )}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
