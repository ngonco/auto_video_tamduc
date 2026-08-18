import React from 'react';
import { AbsoluteFill } from 'remotion';
import { MainVideoProps } from './types.js';
import { VideoLayer } from './layers/VideoLayer.js';
import { KaraokeLayer } from './layers/KaraokeLayer.js';
import { AudioLayer } from './layers/AudioLayer.js';

export const MainVideo: React.FC<MainVideoProps> = ({
  clips,
  subtitles,
  voiceUrl,
  bgmUrl,
  voiceVolume = 1.0,
  bgmVolume = 0.15,
  fontFamily = 'Be Vietnam Pro',
  activeWordColor = '#FFD700',
  inactiveWordColor = '#FFFFFF',
  voiceDuration,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0F19' }}>
      {/* 1. Tầng Video Clips & Outro */}
      <VideoLayer clips={clips} />

      {/* 2. Tầng Phụ đề Karaoke */}
      <KaraokeLayer
        subtitles={subtitles}
        fontFamily={fontFamily}
        activeColor={activeWordColor}
        inactiveColor={inactiveWordColor}
      />

      {/* 3. Tầng Âm thanh (Voice + BGM fade-out trước Outro) */}
      <AudioLayer
        voiceUrl={voiceUrl}
        bgmUrl={bgmUrl}
        voiceVolume={voiceVolume}
        bgmVolume={bgmVolume}
        voiceDuration={voiceDuration}
      />
    </AbsoluteFill>
  );
};
