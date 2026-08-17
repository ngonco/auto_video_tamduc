import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const FRAMES_DIR = path.join(CACHE_DIR, 'frames');
const THUMBS_DIR = path.join(CACHE_DIR, 'thumbnails');

// Đảm bảo các thư mục cache tồn tại
[CACHE_DIR, FRAMES_DIR, THUMBS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  aspectRatioType: '9:16' | '16:9' | 'other';
}

/**
 * Lấy thông tin kỹ thuật của video (duration, resolution, aspect ratio)
 */
export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const duration = Number(metadata.format.duration) || 0;
      const width = videoStream?.width || 1080;
      const height = videoStream?.height || 1920;

      // Tính toán FPS
      let fps = 30;
      if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (den) fps = Math.round(num / den);
      }

      // Xác định tỉ lệ
      let aspectRatioType: '9:16' | '16:9' | 'other' = 'other';
      const ratio = width / height;
      if (ratio <= 0.65) {
        aspectRatioType = '9:16';
      } else if (ratio >= 1.6) {
        aspectRatioType = '16:9';
      }

      resolve({
        duration,
        width,
        height,
        fps,
        aspectRatioType,
      });
    });
  });
}

/**
 * Trích xuất 2-3 Frame ảnh đại diện JPEG (nén 720p nhẹ) tại các mốc 10%, 50%, 90%
 * TUYỆT ĐỐI KHÔNG GỬI FILE VIDEO LÊN API - CHỈ GỬI 2-3 FRAME NÀY ĐỂ TIẾT KIỆM
 */
export async function extractKeyframes(
  filePath: string,
  videoId: string,
  duration: number
): Promise<{ framePaths: string[]; thumbnailPath: string }> {
  // Tính các mốc thời gian lấy frame
  const safeDuration = Math.max(duration, 1.0);
  const timestamps = [
    Math.min(safeDuration * 0.15, safeDuration - 0.5),
    Math.min(safeDuration * 0.50, safeDuration - 0.5),
    Math.min(safeDuration * 0.85, safeDuration - 0.5),
  ].map((t) => Math.max(0.1, t));

  const framePaths: string[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const frameFilename = `${videoId}_frame_${i + 1}.jpg`;
    const frameOutPath = path.join(FRAMES_DIR, frameFilename);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .screenshots({
          timestamps: [time],
          filename: frameFilename,
          folder: FRAMES_DIR,
          size: '?x720', // Giữ tỷ lệ, nén chiều cao 720p nhẹ
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    if (fs.existsSync(frameOutPath)) {
      framePaths.push(frameOutPath);
    }
  }

  // Tạo thumbnail chính (lấy frame giữa)
  const thumbnailFilename = `${videoId}_thumb.jpg`;
  const thumbnailPath = path.join(THUMBS_DIR, thumbnailFilename);
  if (framePaths.length > 1 && fs.existsSync(framePaths[1])) {
    fs.copyFileSync(framePaths[1], thumbnailPath);
  } else if (framePaths.length > 0 && fs.existsSync(framePaths[0])) {
    fs.copyFileSync(framePaths[0], thumbnailPath);
  }

  return { framePaths, thumbnailPath };
}
