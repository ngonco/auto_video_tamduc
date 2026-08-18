import React from 'react';
import { Audio } from 'remotion';

interface AudioLayerProps {
  voiceUrl?: string;
  bgmUrl?: string;
  voiceVolume?: number;
  bgmVolume?: number;
}

export const AudioLayer: React.FC<AudioLayerProps> = React.memo(({
  voiceUrl,
  bgmUrl,
  voiceVolume = 1.0,
  bgmVolume = 0.15,
}) => {
  return (
    <>
      {voiceUrl && (
        <Audio
          key={voiceUrl}
          src={voiceUrl}
          volume={voiceVolume}
          pauseWhenBuffering
        />
      )}
      {bgmUrl && (
        <Audio
          key={bgmUrl}
          src={bgmUrl}
          volume={bgmVolume}
          loop
          pauseWhenBuffering
        />
      )}
    </>
  );
});
