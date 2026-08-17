import React from 'react';
import { Audio } from 'remotion';

interface AudioLayerProps {
  voiceUrl?: string;
  bgmUrl?: string;
  voiceVolume?: number;
  bgmVolume?: number;
}

export const AudioLayer: React.FC<AudioLayerProps> = ({
  voiceUrl,
  bgmUrl,
  voiceVolume = 1.0,
  bgmVolume = 0.15,
}) => {
  return (
    <>
      {voiceUrl && <Audio src={voiceUrl} volume={voiceVolume} />}
      {bgmUrl && <Audio src={bgmUrl} volume={bgmVolume} loop />}
    </>
  );
};
