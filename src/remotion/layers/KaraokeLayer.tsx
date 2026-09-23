import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SubtitleLine, SubtitleFontWeight } from '../types.js';

interface KaraokeLayerProps {
  subtitles: SubtitleLine[];
  fontFamily?: string;
  fontWeight?: SubtitleFontWeight;
  allCaps?: boolean;
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  positionBottomPercent?: number;
}

export const KaraokeLayer: React.FC<KaraokeLayerProps> = ({
  subtitles,
  fontFamily = 'Lexend',
  fontWeight = 'bold',
  allCaps = true,
  activeColor = '#FFD700',
  inactiveColor = '#FFFFFF',
  fontSize = 65,
  positionBottomPercent = 22,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const currentTime = frame / fps;

  // 1. Ánh xạ độ đậm font weight sang giá trị số CSS (Hook đặt ở ĐẦU component, KHÔNG BAO GIỜ BỊ BỎ QUA)
  const numericFontWeight = React.useMemo(() => {
    switch (fontWeight) {
      case 'normal':
        return 500;
      case 'extraBold':
        return 800;
      case 'bold':
      default:
        return 700;
    }
  }, [fontWeight]);

  // 2. Tìm câu phụ đề đang hiển thị (Hook useMemo luôn chạy mỗi frame)
  const activeLine = React.useMemo(() => {
    if (!subtitles || subtitles.length === 0) return null;
    return (
      subtitles.find(
        (line) => currentTime >= line.start - 0.05 && currentTime <= line.end + 0.1
      ) || null
    );
  }, [subtitles, currentTime]);

  // 3. Đảm bảo an toàn 100% nếu activeLine.words bị thiếu hoặc rỗng (Hook useMemo luôn chạy mỗi frame)
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

  // 4. Chia 2 hàng cân đối nếu câu dài (> 6 từ hoặc > 28 ký tự)
  const midIndex = React.useMemo(() => {
    if (!activeLine || resolvedWords.length <= 6) return -1;
    const shouldWrap = resolvedWords.length > 6 || (activeLine.text && activeLine.text.length > 28);
    return shouldWrap ? Math.ceil(resolvedWords.length / 2) : -1;
  }, [activeLine, resolvedWords]);

  // 5. Tính độ dày viền chữ chuẩn xác:
  // Viền đen thanh thoát, kết hợp với paintOrder: 'stroke fill' để viền vẽ PHÍA SAU,
  // tuyệt đối không đè đen vào thân chữ hay làm đen chữ trắng/vàng
  const strokeWidth = Math.max(2, Math.round(fontSize * 0.04 * 10) / 10);
  const activeStrokeWidth = Math.round((strokeWidth + 0.6) * 10) / 10;

  // 6. KIỂM TRA SỚM SAU KHI TẤT CẢ HOOKS ĐÃ CHẠY XONG (Không bao giờ vi phạm React Hooks rules)
  if (!activeLine || resolvedWords.length === 0) {
    return null;
  }

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
          fontWeight: numericFontWeight,
          textAlign: 'center',
          lineHeight: 1.35,
          textTransform: allCaps ? 'uppercase' : 'none',
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
          let shadow = '0 2px 8px rgba(0, 0, 0, 0.9)';
          let stroke = `${strokeWidth}px #000000`;

          if (isCurrent) {
            color = activeColor; // Vàng kim hoàng gia
            scale = 1.08;
            shadow = `0 0 20px rgba(255, 215, 0, 0.9), 0 2px 8px rgba(0, 0, 0, 0.95)`;
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
                  transition: 'transform 0.1s ease, color 0.1s ease',
                  WebkitTextStroke: stroke,
                  paintOrder: 'stroke fill',
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
