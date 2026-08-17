import React from 'react';
import { Composition } from 'remotion';
import { MainVideo } from './MainVideo.js';
import { MainVideoProps } from './types.js';

export const RemotionRoot: React.FC = () => {
  const defaultProps: MainVideoProps = {
    durationInFrames: 300,
    fps: 30,
    width: 1080,
    height: 1920,
    clips: [],
    subtitles: [],
  };

  return (
    <Composition
      id="AutoVideoTamDuc"
      component={MainVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
  );
};
