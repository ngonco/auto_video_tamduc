import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { AI_MODELS, STT_FALLBACK_MODELS } from './api-client.js';
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
  isMusic?: boolean;
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

function sttError(message: string, status: number, code: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}

// Chỉ ghi metadata chẩn đoán, không lưu token, payload âm thanh hay transcript.
function logSTTAttempt(info: Record<string, unknown>): void {
  const entry = { time: new Date().toISOString(), ...info };
  console.log('[STTService]', JSON.stringify(entry));
  try {
    fs.appendFileSync(path.join(CACHE_DIR, 'stt.log'), JSON.stringify(entry) + '\n', 'utf8');
  } catch (_) {
    // Lỗi ghi log không được làm hỏng kết quả STT.
  }
}

async function transcribeSingleAudio(audioFilePath: string, accurateDuration = 0): Promise<{ text: string; duration: number; words: KaraokeWord[] }> {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const vilaoKey = (process.env.VILAO_STT_KEY || process.env.VILAO_API_KEY || '').trim();
  if (!groqKey && !vilaoKey) {
    throw sttError('Chưa cấu hình API Key STT. Vui lòng nhập token trong Cài Đặt Hệ Thống.', 401, 'UNAUTHORIZED');
  }

  const configuredFallbacks = process.env.STT_FALLBACK_MODELS;
  const fallbacks = configuredFallbacks === undefined
    ? STT_FALLBACK_MODELS
    : configuredFallbacks.split(',').map((model) => model.trim()).filter(Boolean);
  const models = [...new Set([process.env.STT_MODEL?.trim() || AI_MODELS.STT, ...fallbacks])];
  const attempts: STTAttempt[] = [];
  if (groqKey) {
    attempts.push({ provider: 'groq', model: process.env.GROQ_STT_MODEL?.trim() || AI_MODELS.GROQ_STT, apiKey: groqKey });
  }
  if (vilaoKey) {
    attempts.push(...models.map((model): STTAttempt => ({ provider: 'vilao', model, apiKey: vilaoKey })));
  }
  const failures: string[] = [];
  let lastError: any;
  let emptyResult: { text: string; duration: number; words: KaraokeWord[] } | undefined;

  for (const attempt of attempts) {
    const { provider, model } = attempt;
    const started = Date.now();
    logSTTAttempt({ provider, model, event: 'start', file: path.basename(audioFilePath) });
    try {
      const result = await transcribeWithModel(audioFilePath, attempt, accurateDuration);
      if (!result.text.trim() || result.words.length === 0) {
        emptyResult = result;
        failures.push(`${provider}/${model}: EMPTY_TRANSCRIPT`);
        logSTTAttempt({ provider, model, event: 'empty', elapsedMs: Date.now() - started });
        continue;
      }
      logSTTAttempt({ provider, model, event: 'success', words: result.words.length, elapsedMs: Date.now() - started });
      return result;
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        err = sttError('API STT phản hồi quá chậm, đã hết thời gian chờ.', 504, 'STT_TIMEOUT');
      } else if (err instanceof SyntaxError) {
        err = sttError('Gateway STT trả về JSON không hợp lệ.', 502, 'INVALID_STT_RESPONSE');
      } else if (err instanceof TypeError) {
        err = sttError('Không thể kết nối tới Gateway STT.', 502, 'STT_NETWORK_ERROR');
      }
      logSTTAttempt({ provider, model, event: 'failed', status: err.status || 500, code: err.code || 'STT_FAILED', elapsedMs: Date.now() - started });
      // Token/số dư Groq độc lập: vẫn thử Vilao. Các model Vilao dùng chung tài khoản.
      if (provider === 'vilao' && [401, 402].includes(err.status)) throw err;
      failures.push(`${provider}/${model}: ${err.code || 'STT_FAILED'}`);
      lastError = err;
    }
  }

  // Chỉ kết luận không có lời khi mọi model đều phản hồi hợp lệ nhưng rỗng.
  // Không biến lỗi nhà cung cấp thành chế độ nhạc rồi lưu cache rỗng.
  if (emptyResult && !lastError) return emptyResult;
  throw sttError(
    `Không nhận diện được giọng nói sau khi thử ${attempts.length} model STT. ${lastError?.message || ''} (${failures.join('; ')})`,
    lastError?.status || 502,
    'STT_ALL_MODELS_FAILED'
  );
}

interface STTAttempt {
  provider: 'groq' | 'vilao';
  model: string;
  apiKey: string;
}

async function transcribeWithModel(audioFilePath: string, attempt: STTAttempt, accurateDuration: number): Promise<{ text: string; duration: number; words: KaraokeWord[] }> {
  const { provider, model, apiKey } = attempt;
  const isGroq = provider === 'groq';
  const providerName = isGroq ? 'Groq' : 'Vilao.ai';
  const baseURL = isGroq ? 'https://api.groq.com/openai/v1' : (process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1').replace(/\/+$/, '');

  const fileBuffer = fs.readFileSync(audioFilePath);
  const ext = path.extname(audioFilePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
    '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.webm': 'audio/webm',
  };
  const mimeType = mimeTypes[ext] || 'audio/mpeg';
  const blob = new Blob([fileBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('model', model);
  formData.append('language', 'vi');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('file', blob, path.basename(audioFilePath));

  const configuredTimeout = Number(process.env.STT_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0 && configuredTimeout <= 2147483647 ? configuredTimeout : 60000;
  const res = await fetch(`${baseURL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let parsedErr: any = null;
    try {
      parsedErr = JSON.parse(errBody);
    } catch (_) {}

    const errCode = parsedErr?.error?.code || '';
    const errMsg = String(parsedErr?.error?.message || errBody);

    if (res.status === 402 || errCode === 'INSUFFICIENT_BALANCE' || errMsg.includes('Insufficient balance') || errMsg.includes('insufficient_quota')) {
      const error: any = new Error(
        `Tài khoản API ${providerName} đã hết số dư / hạn mức. Vui lòng kiểm tra tài khoản hoặc cập nhật API Key trong Cài Đặt Hệ Thống.`
      );
      error.status = 402;
      error.code = 'INSUFFICIENT_BALANCE';
      throw error;
    }

    if (res.status === 401 || errCode === 'invalid_api_key' || errMsg.includes('Incorrect API key')) {
      const error: any = new Error(
        `API Key STT ${providerName} (${isGroq ? 'GROQ_API_KEY' : 'VILAO_STT_KEY'}) không hợp lệ hoặc đã hết hạn (401 Unauthorized). Vui lòng kiểm tra lại trong Cài Đặt Hệ Thống.`
      );
      error.status = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    if (res.status === 429) {
      const error: any = new Error(
        'Hạn mức gọi API STT đã vượt quá giới hạn (429 Too Many Requests). Vui lòng đợi trong giây lát rồi thử lại.'
      );
      error.status = 429;
      error.code = 'RATE_LIMIT';
      throw error;
    }

    const error: any = new Error(`Lỗi STT ${providerName} (HTTP ${res.status}): ${errMsg}`);
    error.status = res.status;
    error.code = errCode || `HTTP_${res.status}`;
    throw error;
  }

  const response: any = await res.json();
  if (!response || typeof response !== 'object' || response.error ||
      (typeof response.text !== 'string' && !Array.isArray(response.words) && !Array.isArray(response.segments))) {
    throw sttError('Gateway STT trả về dữ liệu không đúng định dạng transcript.', 502, 'INVALID_STT_RESPONSE');
  }
  let text = typeof response.text === 'string' ? response.text : '';
  const duration = accurateDuration || Number(response.duration) || 0;

  let words: KaraokeWord[] = [];

  // 1. Kiểm tra nếu có mảng words trực tiếp ở root
  if (Array.isArray(response.words) && response.words.length > 0) {
    words = response.words
      .map((w: any) => ({
        word: typeof w?.word === 'string' ? w.word.trim() : '',
        start: Number(w?.start),
        end: Number(w?.end),
      }))
      .filter((w: KaraokeWord) => w.word.length > 0 && Number.isFinite(w.start) && Number.isFinite(w.end) && w.start >= 0 && w.end >= w.start);
  }

  // 2. Nếu không có words ở root, kiểm tra seg.words trong từng segment
  if (words.length === 0 && Array.isArray(response.segments) && response.segments.length > 0) {
    for (const seg of response.segments) {
      if (!seg || typeof seg !== 'object') continue;
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        for (const sw of seg.words) {
          const wText = typeof sw?.word === 'string' ? sw.word.trim() : '';
          if (wText && Number.isFinite(Number(sw.start)) && Number.isFinite(Number(sw.end)) && Number(sw.start) >= 0 && Number(sw.end) >= Number(sw.start)) {
            words.push({
              word: wText,
              start: Number(sw.start) || 0,
              end: Number(sw.end) || 0,
            });
          }
        }
      } else {
        // Fallback: Nội suy từ trong phân đoạn segment
        const rawTokens = (typeof seg.text === 'string' ? seg.text : '').trim().split(/\s+/).filter(Boolean);
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
    if (duration <= 0) {
      throw sttError('Không xác định được thời lượng âm thanh để tạo mốc phụ đề.', 502, 'INVALID_STT_RESPONSE');
    }
    const totalDur = duration;
    const wordDur = totalDur / tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      words.push({
        word: tokens[i],
        start: Number((i * wordDur).toFixed(2)),
        end: Number(((i + 1) * wordDur).toFixed(2)),
      });
    }
  }

  if (!text.trim() && words.length > 0) text = words.map((word) => word.word).join(' ');

  return {
    text,
    duration,
    words,
  };
}

/**
 * Gọi STT 2 Lớp (Two-Pass STT Safety Engine) kết hợp cơ chế phòng thủ âm nhạc (Music / Non-vocal Safe Fallback)
 */
export async function transcribeAudio(audioFilePath: string): Promise<STTResult> {
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`File âm thanh không tồn tại: ${audioFilePath}`);
  }

  // 1. Luôn đo thời lượng chính xác bằng ffprobe độc lập với STT
  let accurateDuration = 0;
  try {
    const meta = await getVideoMetadata(audioFilePath);
    if (meta.duration && meta.duration > 0) {
      accurateDuration = meta.duration;
    }
  } catch (mErr: any) {
    console.warn('[STTService] Could not probe audio metadata:', mErr.message);
  }

  // 2. Pass 1: Nhận diện toàn bộ file âm thanh
  // BẮT BUỘC KHÔNG BỌC CATCH NUỐT LỖI API:
  // Groq lỗi thì thử Vilao; 401/402 của Vilao trả ngay vì các model dùng chung token.
  const firstPass = await transcribeSingleAudio(audioFilePath, accurateDuration);
  if (!accurateDuration && firstPass.duration > 0) {
    accurateDuration = firstPass.duration;
  }

  // Chỉ khi API trả về 200 OK nhưng văn bản rỗng hoặc không có từ nào -> Đây mới thực sự là âm thanh thuần nhạc / không lời
  if (!firstPass.text.trim() || firstPass.words.length === 0) {
    console.log('[STTService] STT returned 200 OK with empty words/text. Flagging as genuine Music / Non-speech audio.');
    return {
      text: '',
      duration: accurateDuration,
      words: [],
      isMusic: true,
    };
  }

  let masterWords = [...firstPass.words];
  let masterText = firstPass.text;

  // 3. Pass 2: Kiểm tra độ phủ âm thanh ở đoạn cuối (Tail Coverage Guard)
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
        const tailPass = await transcribeSingleAudio(tempTailPath, tailDuration);
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
    isMusic: false,
  };
}
