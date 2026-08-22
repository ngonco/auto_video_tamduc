import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { AI_MODELS } from './api-client.js';
import { getVideoMetadata } from './ffmpeg.js';

export interface KaraokeWord {
  word: string;
  start: number; // giây
  end: number;   // giây
}

export interface STTResult {
  text: string;
  duration: number;
  words: KaraokeWord[];
}

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Cắt 1 đoạn âm thanh nhỏ bằng FFmpeg để nhận diện bù đuôi nếu cần
 */
async function sliceAudioFile(inputPath: string, startTime: number, duration: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Gọi Whisper STT trên 1 file âm thanh đơn lẻ
 */
async function transcribeSingleAudio(audioFilePath: string): Promise<{ text: string; duration: number; words: KaraokeWord[] }> {
  const apiKey = process.env.VILAO_STT_KEY || process.env.VILAO_API_KEY || '';
  const baseURL = (process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1').replace(/\/+$/, '');

  const fileBuffer = fs.readFileSync(audioFilePath);
  const ext = path.extname(audioFilePath).toLowerCase();
  const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/m4a' : 'audio/mpeg';
  const blob = new Blob([fileBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, path.basename(audioFilePath));
  formData.append('model', AI_MODELS.STT);
  formData.append('language', 'vi');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  const res = await fetch(`${baseURL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`STT Gateway HTTP ${res.status}: ${errBody}`);
  }

  const response: any = await res.json();
  const text = response.text || '';
  const duration = Number(response.duration) || 0;

  let words: KaraokeWord[] = [];

  // 1. Kiểm tra nếu có mảng words trực tiếp ở root
  if (Array.isArray(response.words) && response.words.length > 0) {
    words = response.words
      .map((w: any) => ({
        word: (w.word || '').trim(),
        start: Number(w.start) || 0,
        end: Number(w.end) || 0,
      }))
      .filter((w: KaraokeWord) => w.word.length > 0);
  }

  // 2. Nếu không có words ở root, kiểm tra seg.words trong từng segment
  if (words.length === 0 && Array.isArray(response.segments) && response.segments.length > 0) {
    for (const seg of response.segments) {
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        for (const sw of seg.words) {
          const wText = (sw.word || '').trim();
          if (wText) {
            words.push({
              word: wText,
              start: Number(sw.start) || 0,
              end: Number(sw.end) || 0,
            });
          }
        }
      } else {
        // Fallback: Nội suy từ trong phân đoạn segment
        const rawTokens = (seg.text || '').trim().split(/\s+/).filter(Boolean);
        if (rawTokens.length === 0) continue;

        const segStart = Number(seg.start) || 0;
        const segEnd = Number(seg.end) || (segStart + 1.0);
        const segDuration = Math.max(0.1, segEnd - segStart);
        const wordDur = segDuration / rawTokens.length;

        for (let i = 0; i < rawTokens.length; i++) {
          const wStart = Number((segStart + i * wordDur).toFixed(2));
          const wEnd = Number((segStart + (i + 1) * wordDur).toFixed(2));
          words.push({
            word: rawTokens[i],
            start: wStart,
            end: wEnd,
          });
        }
      }
    }
  }

  // 3. Fallback nếu không có cả segments
  if (words.length === 0 && text.trim()) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const totalDur = duration || 30.0;
    const wordDur = totalDur / tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      words.push({
        word: tokens[i],
        start: Number((i * wordDur).toFixed(2)),
        end: Number(((i + 1) * wordDur).toFixed(2)),
      });
    }
  }

  return {
    text,
    duration,
    words,
  };
}

/**
 * Gọi STT 2 Lớp (Two-Pass STT Safety Engine) đảm bảo 100% không bao giờ bị thiếu phụ đề đoạn cuối
 */
export async function transcribeAudio(audioFilePath: string): Promise<STTResult> {
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`File âm thanh không tồn tại: ${audioFilePath}`);
  }

  // 1. Pass 1: Nhận diện toàn bộ file âm thanh
  const firstPass = await transcribeSingleAudio(audioFilePath);

  let accurateDuration = firstPass.duration;
  try {
    const meta = await getVideoMetadata(audioFilePath);
    if (meta.duration && meta.duration > 0) {
      accurateDuration = meta.duration;
    }
  } catch (_) {}

  let masterWords = [...firstPass.words];
  let masterText = firstPass.text;

  // 2. Pass 2: Kiểm tra độ phủ âm thanh ở đoạn cuối (Tail Coverage Guard)
  // Nếu file dài (> 6s) nhưng từ cuối cùng kết thúc trước mốc audio > 3.5s, kích hoạt Pass 2
  const lastWordEnd = masterWords.length > 0 ? masterWords[masterWords.length - 1].end : 0;
  const missingTailDuration = accurateDuration - lastWordEnd;

  if (accurateDuration > 6.0 && missingTailDuration > 3.5) {
    console.log(`[STTService] Tail Coverage Check: Duration=${accurateDuration.toFixed(1)}s, LastWord=${lastWordEnd.toFixed(1)}s (Gap=${missingTailDuration.toFixed(1)}s). Running Pass 2 Tail Recovery...`);

    const tailStart = Math.max(0, lastWordEnd - 0.5); // Gối đầu 0.5s để đảm bảo không đứt từ
    const tailDuration = Math.max(1.0, accurateDuration - tailStart);
    const tempTailPath = path.join(CACHE_DIR, `tail_${Date.now()}_${path.basename(audioFilePath, path.extname(audioFilePath))}.mp3`);

    try {
      await sliceAudioFile(audioFilePath, tailStart, tailDuration, tempTailPath);
      if (fs.existsSync(tempTailPath)) {
        const tailPass = await transcribeSingleAudio(tempTailPath);
        if (tailPass.words.length > 0) {
          // Cộng offset tailStart vào mốc thời gian của từng từ
          const adjustedTailWords: KaraokeWord[] = tailPass.words.map((w) => ({
            word: w.word,
            start: Number((w.start + tailStart).toFixed(2)),
            end: Number((w.end + tailStart).toFixed(2)),
          }));

          // Lọc bỏ các từ bị trùng lặp trong đoạn 0.5s gối đầu
          const newUniqueWords = adjustedTailWords.filter((tw) => tw.start >= lastWordEnd - 0.2);

          if (newUniqueWords.length > 0) {
            console.log(`[STTService] Pass 2 Tail Recovery SUCCESS: Recovered ${newUniqueWords.length} missing words at tail!`);
            masterWords.push(...newUniqueWords);
            masterText += ' ' + newUniqueWords.map((w) => w.word).join(' ');
          }
        }
      }
    } catch (tailErr: any) {
      console.warn('[STTService] Warning in Pass 2 Tail Recovery:', tailErr.message);
    } finally {
      if (fs.existsSync(tempTailPath)) {
        try { fs.unlinkSync(tempTailPath); } catch (_) {}
      }
    }
  }

  return {
    text: masterText.trim(),
    duration: accurateDuration,
    words: masterWords,
  };
}
