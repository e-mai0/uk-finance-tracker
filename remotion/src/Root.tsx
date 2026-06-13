import { Composition } from "remotion";
import { WatchItCount } from "./WatchItCount";

// 9:16 Instagram Reel, 15s @ 30fps.
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WatchItCount"
      component={WatchItCount}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
