import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { SubtitleLine } from './subtitle-fixer.js';
import { TimelineClipItem } from './storyline-engine.js';

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

    // Xây dựng chuỗi Karaoke tag {\k<centiseconds>} cho từng từ
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

/**
 * Render Video Hoàn Chỉnh chuẩn 9:16 (1080x1920) với FFmpeg
 */
export async function renderFinalVideo(
  req: RenderRequest,
  onProgress?: (percent: number, message: string) => void
): Promise<string> {
  const tempDir = path.resolve(process.cwd(), '.cache', 'render_temp', req.videoId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  if (!fs.existsSync(req.outputDir)) {
    fs.mkdirSync(req.outputDir, { recursive: true });
  }

  const outFileName = `Video_TamDuc_${Date.now()}.mp4`;
  const finalOutputPath = path.join(req.outputDir, outFileName);

  // 1. Sinh file phụ đề .ass
  const assPath = path.join(tempDir, 'subtitles.ass');
  generateAssKaraokeSubtitleFile(req.subtitles, assPath);

  // 2. Cắt và chuẩn hóa từng clip thành 1080x1920 (xử lý clip ngang làm mờ nền)
  const normalizedClipPaths: string[] = [];
  let clipIdx = 0;

  for (const clip of req.clips) {
    if (onProgress) {
      const pct = Math.round((clipIdx / req.clips.length) * 40);
      onProgress(pct, `Đang xử lý chuẩn hóa clip ${clipIdx + 1}/${req.clips.length}...`);
    }

    const outClip = path.join(tempDir, `norm_clip_${clipIdx}.mp4`);

    await new Promise<void>((resolve, reject) => {
      let filterString = '';

      if (clip.aspectRatioType === '16:9') {
        // Clip ngang: Làm mờ nền 1080x1920 + Đặt clip nét ở giữa
        filterString = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30`;
      } else {
        // Clip dọc: Scale fill 1080x1920
        filterString = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30`;
      }

      ffmpeg(clip.filePath)
        .setStartTime(clip.sourceStart)
        .setDuration(clip.sourceDuration)
        .videoFilters(filterString)
        .noAudio()
        .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 20', '-pix_fmt yuv420p'])
        .output(outClip)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    normalizedClipPaths.push(outClip);
    clipIdx++;
  }

  // 3. Nối các clip video lại thành 1 chuỗi liên tục
  if (onProgress) {
    onProgress(50, 'Đang ghép nối toàn bộ các đoạn video...');
  }

  const concatListFile = path.join(tempDir, 'concat_list.txt');
  const fileContent = normalizedClipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(concatListFile, fileContent, 'utf-8');

  const stitchedVideoPath = path.join(tempDir, 'stitched.mp4');
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatListFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(stitchedVideoPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  // 4. Ghép Âm thanh (Voice + BGM Ducking) và Burn Subtitle Karaoke
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

    // Bộ lọc âm thanh và phụ đề
    const voiceVol = req.voiceVolume || 1.0;
    const bgmVol = req.bgmVolume || 0.15;

    let complexFilter = `[0:v]subtitles=filename='${normalizedAssPath}'[outv];`;

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
        '-preset medium',
        '-crf 18',
        '-c:a aac',
        '-b:a 192k',
        '-shortest',
        '-pix_fmt yuv420p',
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

  // Dọn dẹp temp
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  if (onProgress) {
    onProgress(100, 'Đã xuất video hoàn tất!');
  }

  return finalOutputPath;
}
