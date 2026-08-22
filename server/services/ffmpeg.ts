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

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  aspectRatioType: '9:16' | '16:9' | 'other';
  mediaType: 'video' | 'image';
}

/**
 * Lấy thông tin kỹ thuật của video hoặc ảnh (duration, resolution, aspect ratio)
 */
export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const isImage = isImageFile(filePath);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const duration = isImage ? 5.0 : (Number(metadata.format.duration) || 5.0);
      const width = videoStream?.width || 1080;
      const height = videoStream?.height || 1920;

      // Tính toán FPS
      let fps = 30;
      if (!isImage && videoStream?.r_frame_rate) {
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
        mediaType: isImage ? 'image' : 'video',
      });
    });
  });
}

/**
 * Trích xuất 2-3 Frame ảnh đại diện JPEG (nén 720p nhẹ)
 * Đối với ảnh tĩnh: nén chuẩn 720p và làm thumbnail trực tiếp
 */
export async function extractKeyframes(
  filePath: string,
  videoId: string,
  duration: number
): Promise<{ framePaths: string[]; thumbnailPath: string }> {
  const isImage = isImageFile(filePath);

  // Nếu là file ảnh: tạo keyframe bằng cách resize ảnh nhẹ 720p
  if (isImage) {
    const frameFilename = `${videoId}_frame_1.jpg`;
    const frameOutPath = path.join(FRAMES_DIR, frameFilename);
    const thumbnailFilename = `${videoId}_thumb.jpg`;
    const thumbnailPath = path.join(THUMBS_DIR, thumbnailFilename);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .videoFilters('scale=-1:720')
        .output(frameOutPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    if (fs.existsSync(frameOutPath)) {
      fs.copyFileSync(frameOutPath, thumbnailPath);
      return { framePaths: [frameOutPath], thumbnailPath };
    }
  }

  // Nếu là file video: tính các mốc thời gian lấy frame
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

/**
 * Cắt video từ startTime đến endTime bằng FFmpeg, ghi đè an toàn file gốc và tạo thumbnail mới
 */
export async function trimVideoFile(
  filePath: string,
  startTime: number,
  endTime: number,
  videoId: string
): Promise<{ duration: number; thumbnailPath: string }> {
  const duration = Math.max(0.1, endTime - startTime);
  const ext = path.extname(filePath);
  const tempOutPath = path.join(CACHE_DIR, `temp_trim_${Date.now()}_${videoId}${ext}`);

  // Thực hiện cắt video chính xác từng khung hình với FFmpeg
  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '18',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(tempOutPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  if (!fs.existsSync(tempOutPath)) {
    throw new Error('Không thể tạo file video sau khi cắt');
  }

  // Ghi đè file gốc an toàn
  try {
    fs.copyFileSync(tempOutPath, filePath);
    fs.unlinkSync(tempOutPath);
  } catch (fsErr) {
    try {
      fs.unlinkSync(filePath);
      fs.renameSync(tempOutPath, filePath);
    } catch (renameErr) {
      throw new Error(`Lỗi ghi đè file gốc: ${(fsErr as any).message}`);
    }
  }

  // Trích xuất lại thumbnail mới cho video đã cắt
  const { thumbnailPath } = await extractKeyframes(filePath, videoId, duration);

  return {
    duration,
    thumbnailPath,
  };
}


