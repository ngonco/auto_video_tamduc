import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig, interpolate, OffthreadVideo, Img } from 'remotion';
import { TimelineClipItem } from '../types.js';

interface VideoLayerProps {
  clips: TimelineClipItem[];
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

function isImageFile(filePath: string): boolean {
  const ext = (filePath || '').toLowerCase().split('?')[0].split('.').pop();
  return ext ? IMAGE_EXTS.some((e) => e.endsWith(ext)) : false;
}

interface SingleClipViewProps {
  clip: TimelineClipItem;
  durationFrames: number;
  isFirst: boolean;
  width: number;
  height: number;
  fps: number;
}

const SingleClipView: React.FC<SingleClipViewProps> = ({
  clip,
  durationFrames,
  isFirst,
  width,
  height,
  fps,
}) => {
  const frame = useCurrentFrame();
  const isImage = clip.mediaType === 'image' || isImageFile(clip.filePath);
  const isHorizontal = clip.aspectRatioType === '16:9';
  const mediaSrc = `/media/stream?path=${encodeURIComponent(clip.filePath)}`;

  // Hiệu ứng Zoom nhẹ (Ken Burns scale 1.0x -> 1.10x) cho ảnh tĩnh
  const progress = durationFrames > 0 ? Math.max(0, Math.min(1, frame / durationFrames)) : 0;
  const zoomScale = isImage ? 1.0 + 0.10 * progress : 1.0;

  // Hiệu ứng Cross Dissolve chuyển cảnh: Fade in 0.5s (15 frames tại 30fps) ở đầu clip (trừ clip đầu tiên)
  const transitionFrames = Math.min(Math.round(0.5 * fps), Math.floor(durationFrames / 2));
  const opacity = isFirst
    ? 1.0
    : interpolate(frame, [0, Math.max(1, transitionFrames)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  const startFromFrame = Math.max(0, Math.round((clip.sourceStart || 0) * fps));

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        opacity,
        overflow: 'hidden',
        backgroundColor: '#000000',
      }}
    >
      {isHorizontal ? (
        <>
          {/* Nền mờ (Blurred Backdrop) 1080x1920 cho media ngang 16:9 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              filter: 'blur(30px) brightness(0.6)',
              transform: `scale(${1.2 * (isImage ? 1.0 + 0.04 * progress : 1.0)})`,
              transformOrigin: 'center center',
            }}
          >
            {isImage ? (
              <Img
                src={mediaSrc}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <OffthreadVideo
                src={mediaSrc}
                startFrom={startFromFrame}
                volume={0}
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
          </div>

          {/* Media chính rõ nét ở giữa khung hình 9:16 */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) scale(${zoomScale})`,
              transformOrigin: 'center center',
              width: '100%',
              maxHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 40px rgba(0,0,0,0.8)',
            }}
          >
            {isImage ? (
              <Img
                src={mediaSrc}
                style={{
                  width: '100%',
                  objectFit: 'contain',
                }}
              />
            ) : (
              <OffthreadVideo
                src={mediaSrc}
                startFrom={startFromFrame}
                volume={0}
                muted
                style={{
                  width: '100%',
                  objectFit: 'contain',
                }}
              />
            )}
          </div>
        </>
      ) : (
        /* Media dọc 9:16 - Scale Fill sắc nét kèm Ken Burns zoom nhẹ nếu là ảnh */
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${zoomScale})`,
            transformOrigin: 'center center',
            overflow: 'hidden',
          }}
        >
          {isImage ? (
            <Img
              src={mediaSrc}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <OffthreadVideo
              src={mediaSrc}
              startFrom={startFromFrame}
              volume={0}
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export const VideoLayer: React.FC<VideoLayerProps> = ({ clips }) => {
  const { fps, width, height } = useVideoConfig();

  if (!clips || clips.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#0B0F19',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F59E0B',
          fontSize: 32,
          fontFamily: 'Be Vietnam Pro',
        }}
      >
        Tâm Đức - Không Gian Thờ Phật
      </div>
    );
  }

  // Cross Dissolve overlap duration (0.5s = 15 frames tại 30fps)
  const overlapSec = 0.5;

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', backgroundColor: '#000000' }}>
      {clips.map((clip, index) => {
        const isFirst = index === 0;
        const isLast = index === clips.length - 1;

        // Clip bắt đầu chính xác tại timelineStart
        const fromSec = clip.timelineStart;
        // Mở rộng thời lượng clip thêm overlapSec để clip sau có thể fade-in chồng lên cuối clip này
        // Clip cuối cùng không cần mở rộng
        const extraOverlap = isLast ? 0 : overlapSec;
        const durationSec = Math.max(0.1, (clip.timelineEnd - clip.timelineStart) + extraOverlap);

        const fromFrame = Math.round(fromSec * fps);
        const durationFrames = Math.max(1, Math.round(durationSec * fps));

        return (
          <Sequence
            key={clip.id || `clip_${index}`}
            from={fromFrame}
            durationInFrames={durationFrames}
            layout="none"
          >
            <SingleClipView
              clip={clip}
              durationFrames={durationFrames}
              isFirst={isFirst}
              width={width}
              height={height}
              fps={fps}
            />
          </Sequence>
        );
      })}
    </div>
  );
};
