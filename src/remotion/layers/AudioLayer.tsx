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
  const { fps } = useVideoConfig();

  const safeVoiceDuration = (voiceDuration && !isNaN(Number(voiceDuration)) && Number(voiceDuration) > 0) ? Number(voiceDuration) : undefined;
  const voiceDurationFrames = safeVoiceDuration ? Math.ceil(safeVoiceDuration * fps) : undefined;
  const safeVoiceVolume = (!isNaN(Number(voiceVolume)) && Number(voiceVolume) >= 0) ? Number(voiceVolume) : 1.0;
  const safeBgmVolume = (!isNaN(Number(bgmVolume)) && Number(bgmVolume) >= 0) ? Number(bgmVolume) : 0.15;

  return (
    <>
      {voiceUrl && (
        <Audio
          key={`voice_${voiceUrl}`}
          src={voiceUrl}
          volume={() => safeVoiceVolume}
          startFrom={0}
          endAt={voiceDurationFrames}
          crossOrigin="anonymous"
          onError={(err) => console.warn('[AudioLayer] Voice audio error:', voiceUrl, err)}
        />
      )}
      {bgmUrl && (
        <Audio
          key={`bgm_${bgmUrl}`}
          src={bgmUrl}
          volume={(f) => {
            if (safeVoiceDuration && safeVoiceDuration > 1.0) {
              const fadeStartFrame = Math.round((safeVoiceDuration - 1.0) * fps);
              const fadeEndFrame = Math.round(safeVoiceDuration * fps);
              return interpolate(
                f,
                [fadeStartFrame, fadeEndFrame],
                [safeBgmVolume, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              );
            }
            return safeBgmVolume;
          }}
          loop
          crossOrigin="anonymous"
          onError={(err) => console.warn('[AudioLayer] BGM audio error:', bgmUrl, err)}
        />
      )}
    </>
  );
});
