import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { SubtitleLine } from './subtitle-fixer.js';
import { TimelineClipItem } from './storyline-engine.js';
import { getVideoMetadata } from './ffmpeg.js';

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface RenderRequest {
  videoId: string;
  projectName: string;
  voicePath: string;
  bgmPath?: string;
  bgmVolume?: number;
  voiceVolume?: number;
  duckingVolume?: number;
  clips: TimelineClipItem[];
  subtitles: SubtitleLine[];
  outputDir: string;
}

/**
 * Sinh file phụ đề Advanced SubStation Alpha (.ass) hỗ trợ Karaoke và viền đổ bóng sắc nét không lỗi font
 */
export function generateAssKaraokeSubtitleFile(
  subtitles: SubtitleLine[],
  outAssPath: string,
  fontFamily: string = 'Be Vietnam Pro'
) {
  let assContent = `[Script Info]
Title: Auto Video Tam Duc Karaoke
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${fontFamily},52,&H00FFFFFF,&H0000D7FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,4,2,40,40,480,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  subtitles.forEach((line) => {
    const startStr = formatAssTime(line.start);
    const endStr = formatAssTime(line.end);

    // Xây dựng chuỗi Karaoke tag {\kf<centiseconds>} cho từng từ
    let karaokeText = '';
    line.words.forEach((w) => {
      const durationCenti = Math.max(1, Math.round((w.end - w.start) * 100));
      karaokeText += `{\\kf${durationCenti}}${w.word} `;
    });

    assContent += `Dialogue: 0,${startStr},${endStr},Karaoke,,0,0,0,,${karaokeText.trim()}\n`;
  });

  fs.writeFileSync(outAssPath, assContent, 'utf-8');
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath || '').toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

/**
 * Render Video Hoàn Chỉnh chuẩn 9:16 (1080x1920) với FFmpeg
 * Tích hợp: Hiệu ứng chuyển cảnh Cross Dissolve giữa các video và Zoom nhẹ (Ken Burns) cho ảnh
 */
export async function renderFinalVideo(
  req: RenderRequest,
  onProgress?: (percent: number, message: string) => void
): Promise<string> {
  const finalFileName = `Video_TamDuc_${Date.now()}.mp4`;
  const finalOutputPath = path.join(req.outputDir, finalFileName);

  const tempDir = path.join(process.cwd(), '.cache', 'render', `job_${Date.now()}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 1. Sinh file phụ đề ASS Karaoke
  if (onProgress) {
    onProgress(5, 'Đang chuẩn bị file phụ đề Karaoke tiếng Việt...');
  }
  const assPath = path.join(tempDir, 'subtitles.ass');
  generateAssKaraokeSubtitleFile(req.subtitles, assPath);

  // 2. Lấy thời lượng Voice chính xác
  let exactVoiceDuration = 60;
  try {
    const voiceMeta = await getVideoMetadata(req.voicePath);
    if (voiceMeta.duration && voiceMeta.duration > 0) {
      exactVoiceDuration = voiceMeta.duration;
    }
  } catch (_) {}

  // 3. Cắt và chuẩn hóa từng clip song song (Parallel Worker Pool)
  const transDur = 0.5; // 0.5s chuyển cảnh hòa tan
  let completedClips = 0;

  const normalizedClips = await runWithConcurrency(req.clips, 4, async (clip, clipIdx) => {
    const isImage = clip.mediaType === 'image' || isImageFile(clip.filePath);
    const outClip = path.join(tempDir, `norm_clip_${clipIdx}.mp4`);
    const isLast = clipIdx === req.clips.length - 1;
    const duration = Math.max(1.0, (clip.sourceDuration || 5.0) + (isLast ? 0 : transDur));

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();

      if (isImage) {
        // Xử lý Ảnh tĩnh: Lặp ảnh và phóng to nhẹ Ken Burns
        command
          .input(clip.filePath)
          .inputOptions(['-loop 1', `-t ${duration}`]);

        const filterString = clip.aspectRatioType === '16:9' 
          ? `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5,scale=w='1080*(1+0.06*t/${duration})':h='1920*(1+0.06*t/${duration})':eval=frame,crop=1080:1920:(iw-1080)/2:(ih-1920)/2[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,scale=in_range=full:out_range=tv,format=yuv420p[outv]`
          : `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=w='1080*(1+0.10*t/${duration})':h='1920*(1+0.10*t/${duration})':eval=frame,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,fps=30,scale=in_range=full:out_range=tv,format=yuv420p[outv]`;

        command
          .complexFilter(filterString)
          .noAudio()
          .outputOptions(['-map [outv]', '-c:v libx264', '-preset ultrafast', '-threads 0', '-tune fastdecode', '-crf 22', '-pix_fmt yuv420p', `-t ${duration}`])
          .output(outClip)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      } else {
        // Xử lý Video clip: Sử dụng -stream_loop -1 để đảm bảo clip ngắn không bị thiếu frame
        command
          .inputOptions(['-stream_loop -1'])
          .input(clip.filePath)
          .setStartTime(clip.sourceStart || 0)
          .setDuration(duration);

        const filterString = clip.aspectRatioType === '16:9'
          ? `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[outv]`
          : `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[outv]`;

        command
          .complexFilter(filterString)
          .noAudio()
          .outputOptions(['-map [outv]', '-c:v libx264', '-preset ultrafast', '-threads 0', '-tune fastdecode', '-crf 22', '-pix_fmt yuv420p', `-t ${duration}`])
          .output(outClip)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      }
    });

    completedClips++;
    if (onProgress) {
      const pct = 5 + Math.round((completedClips / req.clips.length) * 45);
      onProgress(pct, `Đang xử lý song song chuẩn hóa clip ${completedClips}/${req.clips.length}...`);
    }

    return { path: outClip, duration };
  });

  const normalizedClipPaths = normalizedClips.map((c) => c.path);
  const clipDurations = normalizedClips.map((c) => c.duration);

  if (onProgress) {
    onProgress(55, 'Đang hòa trộn chuyển cảnh Cross Dissolve giữa các clip...');
  }

  const stitchedVideoPath = path.join(tempDir, 'stitched.mp4');

  if (normalizedClipPaths.length === 1) {
    fs.copyFileSync(normalizedClipPaths[0], stitchedVideoPath);
  } else {
    let concatCommand = ffmpeg();
    normalizedClipPaths.forEach((p) => concatCommand.input(p));

    const filterChains: string[] = [];
    let currentAccumulated = clipDurations[0];

    for (let i = 1; i < normalizedClipPaths.length; i++) {
      const prevLabel = i === 1 ? '[0:v]' : `[v${i - 1}]`;
      const nextLabel = `[${i}:v]`;
      const isLast = i === normalizedClipPaths.length - 1;
      const outLabel = isLast ? '[v_xfade_end]' : `[v${i}]`;
      const actualTrans = Math.min(transDur, clipDurations[i - 1] * 0.4, clipDurations[i] * 0.4);
      const offset = Math.max(0.1, currentAccumulated - actualTrans);

      filterChains.push(`${prevLabel}${nextLabel}xfade=transition=fade:duration=${actualTrans.toFixed(2)}:offset=${offset.toFixed(2)}${outLabel}`);
      currentAccumulated = currentAccumulated + clipDurations[i] - actualTrans;
    }

    // Thêm tpad để đảm bảo khung hình cuối cùng giữ nguyên, không bao giờ bị cắt đen trước khi tiếng dứt
    filterChains.push(`[v_xfade_end]tpad=stop_mode=clone:stop_duration=5,format=yuv420p[outv]`);

    await new Promise<void>((resolve, reject) => {
      concatCommand
        .complexFilter(filterChains.join('; '))
        .outputOptions(['-map [outv]', '-c:v libx264', '-preset ultrafast', '-threads 0', '-crf 20', '-pix_fmt yuv420p'])
        .output(stitchedVideoPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  if (onProgress) {
    onProgress(75, 'Đang hòa âm Voice, Nhạc Thiền BGM và ép phụ đề Karaoke 9:16...');
  }

  const normalizedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg().input(stitchedVideoPath).input(req.voicePath);

    const hasBgm = req.bgmPath && fs.existsSync(req.bgmPath);
    if (hasBgm) {
      command = command.input(req.bgmPath!);
    }

    const voiceVol = req.voiceVolume || 1.0;
    const bgmVol = req.bgmVolume || 0.15;

    let complexFilter = `[0:v]subtitles=filename='${normalizedAssPath}',format=yuv420p[outv];`;

    if (hasBgm) {
      complexFilter += `[1:a]volume=${voiceVol}[voice];[2:a]volume=${bgmVol},aloop=loop=-1:size=2e+09[bgm];[voice][bgm]amix=inputs=2:duration=first[outa]`;
    } else {
      complexFilter += `[1:a]volume=${voiceVol}[outa]`;
    }

    command
      .complexFilter(complexFilter)
      .outputOptions([
        '-map [outv]',
        '-map [outa]',
        '-c:v libx264',
        '-preset faster',
        '-threads 0',
        '-crf 18',
        '-profile:v high',
        '-level 4.1',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 192k',
        '-ar 44100',
        `-t ${exactVoiceDuration.toFixed(2)}`,
      ])
      .output(finalOutputPath)
      .on('progress', (progress) => {
        if (onProgress && progress.percent) {
          const currentPct = 75 + Math.round((progress.percent / 100) * 24);
          onProgress(Math.min(99, currentPct), `Đang xuất video MP4: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  if (onProgress) {
    onProgress(100, 'Đã xuất video hoàn tất!');
  }

  return finalOutputPath;
}
