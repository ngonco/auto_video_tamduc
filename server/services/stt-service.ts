import fs from 'fs';
import path from 'path';
import { AI_MODELS } from './api-client.js';

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

/**
 * Gọi STT qua tsa/groq/whisper-large-v3 để nhận diện tiếng Việt và lấy word-level timestamps
 */
export async function transcribeAudio(audioFilePath: string): Promise<STTResult> {
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`File âm thanh không tồn tại: ${audioFilePath}`);
  }

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

  try {
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
      duration: duration || (words.length > 0 ? words[words.length - 1].end : 0),
      words,
    };
  } catch (error: any) {
    console.error('[STTService] Error transcribing audio:', error);
    throw new Error(`Lỗi nhận diện âm thanh STT: ${error.message}`);
  }
}
