import React from 'react';
import { useCurrentFrame, useVideoConfig, OffthreadVideo } from 'remotion';
import { TimelineClipItem } from '../types.js';

interface VideoLayerProps {
  clips: TimelineClipItem[];
}

export const VideoLayer: React.FC<VideoLayerProps> = ({ clips }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTime = frame / fps;

  // Tìm clip đang phát tại thời điểm currentTime
  const currentClip = clips.find(
    (c) => currentTime >= c.timelineStart && currentTime < c.timelineEnd
  ) || clips[clips.length - 1];

  if (!currentClip) {
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

  // URL stream video từ server
  const videoSrc = `/media/stream?path=${encodeURIComponent(currentClip.filePath)}`;
  const isHorizontal = currentClip.aspectRatioType === '16:9';

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', backgroundColor: '#000000' }}>
      {isHorizontal ? (
        <>
          {/* Nền mờ (Blurred Backdrop) cho video ngang */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              filter: 'blur(30px) brightness(0.6)',
              transform: 'scale(1.2)',
            }}
          >
            <OffthreadVideo
              src={videoSrc}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>

          {/* Video chính rõ nét ở giữa khung hình */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              maxHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 40px rgba(0,0,0,0.8)',
            }}
          >
            <OffthreadVideo
              src={videoSrc}
              style={{
                width: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        </>
      ) : (
        /* Video dọc 9:16 - Scale Fill sắc nét */
        <OffthreadVideo
          src={videoSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
    </div>
  );
};
