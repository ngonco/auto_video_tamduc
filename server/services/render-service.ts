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
  subtitleFontSize?: number;
  subtitleBottomPercent?: number;
  fontFamily?: string;
  outroPath?: string;
  outroEnabled?: boolean;
  outroDuration?: number;
}

/**
 * Kiểm tra xem file media có audio stream hay không
 */
async function checkHasAudio(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        resolve(false);
      } else {
        const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
        resolve(hasAudio);
      }
    });
  });
}

/**
 * Sinh file phụ đề Advanced SubStation Alpha (.ass) hỗ trợ Karaoke và viền đổ bóng sắc nét không lỗi font
 */
export function generateAssKaraokeSubtitleFile(
  subtitles: SubtitleLine[],
  outAssPath: string,
  fontFamily: string = 'Be Vietnam Pro',
  fontSize: number = 65,
  bottomPercent: number = 22
) {
  const marginV = Math.round(1920 * (bottomPercent / 100));
  const outlineWidth = Math.max(3, Math.round(fontSize * 0.07 * 10) / 10);

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
Style: Karaoke,${fontFamily},${fontSize},&H0000D7FF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outlineWidth},2,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  subtitles.forEach((line) => {
    const startStr = formatAssTime(line.start);
    const endStr = formatAssTime(line.end);

    // Xây dựng chuỗi Karaoke tag {\kf<centiseconds>} cho từng từ kèm thẻ {\k<gap>} cho khoảng lặng
    let karaokeText = '';
    let lastTime = line.start;

    line.words.forEach((w) => {
      const gapSec = w.start - lastTime;
      if (gapSec > 0.04) {
        const gapCenti = Math.max(1, Math.round(gapSec * 100));
        karaokeText += `{\\k${gapCenti}}`;
      }
      const durationCenti = Math.max(1, Math.round((w.end - w.start) * 100));
      karaokeText += `{\\kf${durationCenti}}${w.word.toUpperCase()} `;
      lastTime = w.end;
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
 * Tích hợp: Hiệu ứng chuyển cảnh Cross Dissolve giữa các video, Zoom nhẹ (Ken Burns) cho ảnh,
 * và ghép nối Outro cố định giữ nguyên 100% âm thanh gốc ở cuối video.
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
  const subFontSize = req.subtitleFontSize || 65;
  const subBottomPct = req.subtitleBottomPercent || 22;
  const subFontFamily = req.fontFamily || 'Be Vietnam Pro';
  generateAssKaraokeSubtitleFile(req.subtitles, assPath, subFontFamily, subFontSize, subBottomPct);

  // 2. Lấy thời lượng Voice chính xác
  let exactVoiceDuration = 60;
  try {
    const voiceMeta = await getVideoMetadata(req.voicePath);
    if (voiceMeta.duration && voiceMeta.duration > 0) {
      exactVoiceDuration = voiceMeta.duration;
    }
  } catch (_) {}

  // Kiểm tra Outro
  const hasOutro = Boolean(req.outroEnabled && req.outroPath && fs.existsSync(req.outroPath));
  let exactOutroDuration = 0;
  if (hasOutro && req.outroPath) {
    try {
      const outroMeta = await getVideoMetadata(req.outroPath);
      if (outroMeta.duration && outroMeta.duration > 0) {
        exactOutroDuration = outroMeta.duration;
      }
    } catch (_) {
      exactOutroDuration = req.outroDuration || 5.0;
    }
  }

  // 3. Cắt và chuẩn hóa từng clip thân video song song (Parallel Worker Pool)
  const transDur = 0.5; // 0.5s chuyển cảnh hòa tan
  let completedClips = 0;

  const normalizedClips = await runWithConcurrency(req.clips, 4, async (clip, clipIdx) => {
    const isImage = clip.mediaType === 'image' || isImageFile(clip.filePath);
    const outClip = path.join(tempDir, `norm_clip_${clipIdx}.mp4`);
    const isLast = clipIdx === req.clips.length - 1;
    const duration = Math.max(1.0, (clip.sourceDuration || 5.0) + (isLast ? (hasOutro ? transDur : 0) : transDur));

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();

      if (isImage) {
        // Xử lý Ảnh tĩnh: Lặp ảnh và phóng to nhẹ Ken Burns
        command
          .input(clip.filePath)
          .inputOptions(['-loop 1', `-t ${duration}`]);

        const filterString = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[outv]`;

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
          .input(clip.filePath)
          .inputOptions(['-stream_loop -1'])
          .setStartTime(clip.sourceStart || 0)
          .setDuration(duration);

        const filterString = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[outv]`;

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
      const pct = 5 + Math.round((completedClips / req.clips.length) * 40);
      onProgress(pct, `Đang xử lý song song chuẩn hóa clip ${completedClips}/${req.clips.length}...`);
    }

    return { path: outClip, duration };
  });

  const normalizedClipPaths = normalizedClips.map((c) => c.path);
  const clipDurations = normalizedClips.map((c) => c.duration);

  if (onProgress) {
    onProgress(50, 'Đang hòa trộn chuyển cảnh Cross Dissolve giữa các clip...');
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

    // Thêm tpad để đảm bảo khung hình cuối cùng giữ nguyên
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
    onProgress(65, 'Đang hòa âm Voice, Nhạc Thiền BGM và ép phụ đề Karaoke 9:16...');
  }

  const fontsDir = path.resolve(process.cwd(), 'assets', 'fonts').split(path.sep).join('/').replace(/:/g, '\\:');
  const normalizedAssPath = assPath.split(path.sep).join('/').replace(/:/g, '\\:');
  const mainVideoPath = hasOutro ? path.join(tempDir, 'main_with_subs.mp4') : finalOutputPath;

  // Render phần thân video (Video + Subtitles + Voice + Fading BGM)
  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg().input(stitchedVideoPath).input(req.voicePath);

    const hasBgm = Boolean(req.bgmPath && req.bgmPath.trim() !== '' && fs.existsSync(req.bgmPath));
    if (hasBgm) {
      command = command.input(req.bgmPath!).inputOptions(['-stream_loop -1']);
    }

    const voiceVol = req.voiceVolume || 1.0;
    const bgmVol = req.bgmVolume || 0.15;

    let complexFilter = `[0:v]subtitles=filename='${normalizedAssPath}':fontsdir='${fontsDir}',format=yuv420p[outv];`;

    if (hasBgm) {
      // BGM Fade-out ở 1.0s cuối của phần Voice
      const fadeStart = Math.max(0, exactVoiceDuration - 1.0);
      complexFilter += `[1:a]volume=${voiceVol}[voice];[2:a]volume=${bgmVol},afade=t=out:st=${fadeStart.toFixed(2)}:d=1.0[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]`;
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
      .output(mainVideoPath)
      .on('progress', (progress) => {
        if (onProgress && progress.percent) {
          const currentPct = 65 + Math.round((progress.percent / 100) * (hasOutro ? 20 : 34));
          onProgress(Math.min(99, currentPct), `Đang xuất video phần thân: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  // 4. Nếu có Outro: Chuẩn hóa Outro và ghép nối vào cuối video với âm thanh gốc 100%
  if (hasOutro && req.outroPath) {
    if (onProgress) {
      onProgress(88, 'Đang chuẩn hóa Video Outro và giữ nguyên 100% âm thanh gốc...');
    }

    const normOutroPath = path.join(tempDir, 'norm_outro.mp4');
    const outroHasAudio = await checkHasAudio(req.outroPath);

    await new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg().input(req.outroPath!);

      if (outroHasAudio) {
        cmd
          .complexFilter([
            `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[outv]`,
            `[0:a]volume=1.0,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outa]`,
          ])
          .outputOptions([
            '-map [outv]',
            '-map [outa]',
            '-c:v libx264',
            '-preset ultrafast',
            '-threads 0',
            '-crf 20',
            '-c:a aac',
            '-b:a 192k',
            '-ar 44100',
            `-t ${exactOutroDuration.toFixed(2)}`,
          ]);
      } else {
        cmd
          .input('anullsrc=channel_layout=stereo:sample_rate=44100')
          .inputOptions(['-f lavfi'])
          .complexFilter([
            `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[outv]`,
            `[1:a]atrim=duration=${exactOutroDuration.toFixed(2)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outa]`,
          ])
          .outputOptions([
            '-map [outv]',
            '-map [outa]',
            '-c:v libx264',
            '-preset ultrafast',
            '-threads 0',
            '-crf 20',
            '-c:a aac',
            '-b:a 192k',
            '-ar 44100',
            `-t ${exactOutroDuration.toFixed(2)}`,
          ]);
      }

      cmd
        .output(normOutroPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    if (onProgress) {
      onProgress(94, 'Đang nối Video Outro âm thanh nguyên bản vào cuối video...');
    }

    // Nối Video thân + Outro qua xfade & acrossfade
    const xfadeDur = Math.min(0.5, exactVoiceDuration * 0.1, exactOutroDuration * 0.1);
    const xfadeOffset = Math.max(0.1, exactVoiceDuration - xfadeDur);
    const totalOutDuration = exactVoiceDuration + exactOutroDuration - xfadeDur;

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(mainVideoPath)
        .input(normOutroPath)
        .complexFilter([
          `[0:v][1:v]xfade=transition=fade:duration=${xfadeDur.toFixed(2)}:offset=${xfadeOffset.toFixed(2)},format=yuv420p[outv]`,
          `[0:a][1:a]acrossfade=d=${xfadeDur.toFixed(2)}[outa]`,
        ])
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
          `-t ${totalOutDuration.toFixed(2)}`,
        ])
        .output(finalOutputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  if (onProgress) {
    onProgress(100, 'Đã xuất video hoàn tất!');
  }

  return finalOutputPath;
}
