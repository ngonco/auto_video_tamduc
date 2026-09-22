import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SubtitleLine } from '../types.js';

interface KaraokeLayerProps {
  subtitles: SubtitleLine[];
  fontFamily?: string;
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  positionBottomPercent?: number;
}

export const KaraokeLayer: React.FC<KaraokeLayerProps> = ({
  subtitles,
  fontFamily = 'Be Vietnam Pro',
  activeColor = '#FFD700',
  inactiveColor = '#FFFFFF',
  fontSize = 65,
  positionBottomPercent = 22,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const currentTime = frame / fps;

  // Tính độ dày viền chữ tỉ lệ theo cỡ chữ (khoảng 7% cỡ chữ, tối thiểu 3px)
  const strokeWidth = Math.max(3, Math.round(fontSize * 0.07 * 10) / 10);
  const activeStrokeWidth = Math.round((strokeWidth + 0.5) * 10) / 10;

  // Tìm câu phụ đề đang hiển thị
  const activeLine = subtitles.find(
    (line) => currentTime >= line.start - 0.1 && currentTime <= line.end + 0.2
  );

  // Đảm bảo an toàn 100% nếu activeLine.words bị thiếu hoặc rỗng (phụ đề thủ công)
  const resolvedWords = React.useMemo(() => {
    if (!activeLine) return [];
    if (activeLine.words && activeLine.words.length > 0) {
      return activeLine.words;
    }
    if (!activeLine.text) return [];
    const tokens = activeLine.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const dur = Math.max(0.2, activeLine.end - activeLine.start);
    const wordDur = dur / tokens.length;
    return tokens.map((token, idx) => ({
      word: token,
      start: Number((activeLine.start + idx * wordDur).toFixed(2)),
      end: Number((activeLine.start + (idx + 1) * wordDur).toFixed(2)),
    }));
  }, [activeLine]);

  if (!activeLine || resolvedWords.length === 0) {
    return null;
  }

  // Chia 2 hàng cân đối nếu câu dài (> 6 từ hoặc > 28 ký tự)
  const shouldWrapBalanced = resolvedWords.length > 6 || (activeLine.text && activeLine.text.length > 28);
  const midIndex = shouldWrapBalanced ? Math.ceil(resolvedWords.length / 2) : -1;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: `${positionBottomPercent}%`, // Vùng an toàn 9:16 Safe Zone
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
          fontSize: fontSize,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.35,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 960,
          gap: '12px 14px',
        }}
      >
        {resolvedWords.map((wordObj, idx) => {
          const isCurrent = currentTime >= wordObj.start && currentTime <= wordObj.end;
          const isPassed = currentTime > wordObj.end;

          let color = inactiveColor;
          let scale = 1;
          let shadow = '0 3px 12px rgba(0, 0, 0, 0.95)';
          let stroke = `${strokeWidth}px #000000`;

          if (isCurrent) {
            color = activeColor; // Vàng kim hoàng gia
            scale = 1.08;
            shadow = `0 0 20px rgba(255, 215, 0, 0.9), 0 3px 12px rgba(0, 0, 0, 0.95)`;
            stroke = `${activeStrokeWidth}px #000000`;
          } else if (isPassed) {
            color = activeColor; // Vàng kim (đã hoàn thành karaoke)
            stroke = `${strokeWidth}px #000000`;
          }

          return (
            <React.Fragment key={idx}>
              {idx === midIndex && <div style={{ flexBasis: '100%', height: 0 }} />}
              <span
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
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
