import React from 'react';
import { useCurrentFrame, useVideoConfig, OffthreadVideo, Img } from 'remotion';
import { TimelineClipItem } from '../types.js';

interface VideoLayerProps {
  clips: TimelineClipItem[];
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

function isImageFile(filePath: string): boolean {
  const ext = (filePath || '').toLowerCase().split('?')[0].split('.').pop();
  return ext ? IMAGE_EXTS.some((e) => e.endsWith(ext)) : false;
}

interface SingleClipMediaProps {
  clip: TimelineClipItem;
  currentTime: number;
  opacity: number;
  width: number;
  height: number;
}

const SingleClipMedia: React.FC<SingleClipMediaProps> = ({
  clip,
  currentTime,
  opacity,
  width,
  height,
}) => {
  const isImage = clip.mediaType === 'image' || isImageFile(clip.filePath);
  const isHorizontal = clip.aspectRatioType === '16:9';
  const mediaSrc = `/media/stream?path=${encodeURIComponent(clip.filePath)}`;

  // Tính toán tiến độ thời gian trong clip để làm hiệu ứng Zoom Ken Burns nhẹ cho ảnh (1.0x -> 1.10x)
  const clipDuration = Math.max(0.1, clip.timelineEnd - clip.timelineStart);
  const progress = Math.max(0, Math.min(1, (currentTime - clip.timelineStart) / clipDuration));
  const zoomScale = isImage ? 1.0 + 0.10 * progress : 1.0;

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
        transition: 'opacity 0.05s ease-out',
      }}
    >
      {isHorizontal ? (
        <>
          {/* Nền mờ (Blurred Backdrop) cho media ngang */}
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
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
          </div>

          {/* Media chính rõ nét ở giữa khung hình */}
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
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTime = frame / fps;
  const TRANSITION_SEC = 0.5; // Thời lượng chuyển cảnh hòa tan Cross Dissolve

  if (!clips || clips.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F59E0B',
          fontSize: 32,
        }}
      >
        Tâm Đức - Không gian Thờ Phật
      </div>
    );
  }

  // Tìm vị trí clip đang phát tại currentTime
  let currentIndex = clips.findIndex(
    (c) => currentTime >= c.timelineStart && currentTime < c.timelineEnd
  );

  if (currentIndex === -1) {
    currentIndex = currentTime >= clips[clips.length - 1].timelineEnd
      ? clips.length - 1
      : 0;
  }

  const currentClip = clips[currentIndex];

  // Kiểm tra trạng thái chuyển cảnh Cross Dissolve
  let prevClip: TimelineClipItem | null = null;
  let nextClip: TimelineClipItem | null = null;
  let currentOpacity = 1.0;
  let nextOpacity = 0.0;

  // Trường hợp 1: Đang ở đầu clip hiện tại và có clip trước đó (chuyển cảnh từ clip trước sang clip này)
  if (currentIndex > 0 && currentTime - currentClip.timelineStart < TRANSITION_SEC) {
    prevClip = clips[currentIndex - 1];
    currentOpacity = Math.max(0, Math.min(1, (currentTime - currentClip.timelineStart) / TRANSITION_SEC));
  }
  // Trường hợp 2: Đang ở cuối clip hiện tại và có clip tiếp theo (chuyển cảnh từ clip này sang clip sau)
  else if (
    currentIndex < clips.length - 1 &&
    currentClip.timelineEnd - currentTime < TRANSITION_SEC
  ) {
    nextClip = clips[currentIndex + 1];
    nextOpacity = Math.max(0, Math.min(1, (TRANSITION_SEC - (currentClip.timelineEnd - currentTime)) / TRANSITION_SEC));
  }

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', backgroundColor: '#000000' }}>
      {/* 1. Lớp Clip Trước (nếu đang trong giai đoạn đầu chuyển cảnh) */}
      {prevClip && (
        <SingleClipMedia
          key={`prev_${prevClip.id}`}
          clip={prevClip}
          currentTime={currentTime}
          opacity={1.0}
          width={width}
          height={height}
        />
      )}

      {/* 2. Lớp Clip Hiện Tại */}
      <SingleClipMedia
        key={`curr_${currentClip.id}`}
        clip={currentClip}
        currentTime={currentTime}
        opacity={currentOpacity}
        width={width}
        height={height}
      />

      {/* 3. Lớp Clip Kế Tiếp (nếu đang trong giai đoạn cuối chuyển cảnh) */}
      {nextClip && (
        <SingleClipMedia
          key={`next_${nextClip.id}`}
          clip={nextClip}
          currentTime={currentTime}
          opacity={nextOpacity}
          width={width}
          height={height}
        />
      )}
    </div>
  );
};

