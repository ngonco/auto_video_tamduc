import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SubtitleLine } from '../types.js';

interface KaraokeLayerProps {
  subtitles: SubtitleLine[];
  fontFamily?: string;
  activeColor?: string;
  inactiveColor?: string;
}

export const KaraokeLayer: React.FC<KaraokeLayerProps> = ({
  subtitles,
  fontFamily = 'Be Vietnam Pro',
  activeColor = '#FFD700',
  inactiveColor = '#FFFFFF',
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const currentTime = frame / fps;

  // Tìm câu phụ đề đang hiển thị
  const activeLine = subtitles.find(
    (line) => currentTime >= line.start - 0.1 && currentTime <= line.end + 0.2
  );

  if (!activeLine) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '22%', // Vùng an toàn 9:16 Safe Zone
        left: 0,
        width: width,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 40px',
        boxSizing: 'border-box',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: `"${fontFamily}", sans-serif`,
          fontSize: 50,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.35,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '12px 14px',
        }}
      >
        {activeLine.words.map((wordObj, idx) => {
          const isCurrent = currentTime >= wordObj.start && currentTime <= wordObj.end;
          const isPassed = currentTime > wordObj.end;

          let color = inactiveColor;
          let scale = 1;
          let shadow = '0 3px 12px rgba(0, 0, 0, 0.95)';
          let stroke = '3px #000000';

          if (isCurrent) {
            color = activeColor; // Vàng kim hoàng gia
            scale = 1.1;
            shadow = `0 0 20px rgba(255, 215, 0, 0.9), 0 3px 12px rgba(0, 0, 0, 0.95)`;
            stroke = '3.5px #000000';
          } else if (isPassed) {
            color = '#FFF8DC'; // Màu kem sáng
          }

          return (
            <span
              key={idx}
              style={{
                color: color,
                transform: `scale(${scale})`,
                transition: 'all 0.1s ease',
                WebkitTextStroke: stroke,
                textShadow: shadow,
                display: 'inline-block',
              }}
            >
              {wordObj.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
