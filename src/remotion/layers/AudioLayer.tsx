import React from 'react';
import { Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface AudioLayerProps {
  voiceUrl?: string;
  bgmUrl?: string;
  voiceVolume?: number;
  bgmVolume?: number;
  voiceDuration?: number;
}

export const AudioLayer: React.FC<AudioLayerProps> = React.memo(({
  voiceUrl,
  bgmUrl,
  voiceVolume = 1.0,
  bgmVolume = 0.15,
  voiceDuration,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Nếu có voiceDuration, tính toán Fade-out cho BGM ở 1.0s trước khi hết Voice
  let currentBgmVolume = bgmVolume;
  if (voiceDuration && voiceDuration > 1.0) {
    const fadeStartFrame = Math.round((voiceDuration - 1.0) * fps);
    const fadeEndFrame = Math.round(voiceDuration * fps);
    currentBgmVolume = interpolate(
      frame,
      [fadeStartFrame, fadeEndFrame],
      [bgmVolume, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  const voiceDurationFrames = voiceDuration ? Math.ceil(voiceDuration * fps) : undefined;

  return (
    <>
      {voiceUrl && (
        <Sequence from={0} durationInFrames={voiceDurationFrames} layout="none">
          <Audio
            key={voiceUrl}
            src={voiceUrl}
            volume={voiceVolume}
            onError={(err) => console.warn('[AudioLayer] Voice audio error:', voiceUrl, err)}
          />
        </Sequence>
      )}
      {bgmUrl && (
        <Sequence from={0} durationInFrames={voiceDurationFrames} layout="none">
          <Audio
            key={bgmUrl}
            src={bgmUrl}
            volume={currentBgmVolume}
            loop
            onError={(err) => console.warn('[AudioLayer] BGM audio error:', bgmUrl, err)}
          />
        </Sequence>
      )}
    </>
  );
});
