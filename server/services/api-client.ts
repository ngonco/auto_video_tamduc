import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

export type AIServiceType = 'STT' | 'SUBTITLE' | 'EMBEDDING';

export const AI_MODELS = {
  STT: process.env.STT_MODEL || 'tsa/groq/whisper-large-v3',
  SUBTITLE_FIX: process.env.SUBTITLE_FIX_MODEL || 'ts/gemini-3.1-flash-lite',
  VISION: process.env.VISION_MODEL || 'ts/gemini-3.1-flash-lite',
  EMBEDDING: process.env.EMBEDDING_MODEL || 'emb/text-embedding-3-large',
};

/**
 * Khởi tạo OpenAI Client tương thích với Gateway https://api.vilao.ai/v1
 */
export function getApiClient(serviceType?: AIServiceType | string, customApiKey?: string): OpenAI {
  let apiKey = customApiKey || '';

  if (!apiKey) {
    if (serviceType === 'STT') {
      apiKey = process.env.VILAO_STT_KEY || process.env.VILAO_API_KEY || '';
    } else if (serviceType === 'SUBTITLE') {
      apiKey = process.env.VILAO_SUBTITLE_KEY || process.env.VILAO_API_KEY || '';
    } else if (serviceType === 'EMBEDDING') {
      apiKey = process.env.VILAO_SUBTITLE_KEY || process.env.VILAO_EMBEDDING_KEY || process.env.VILAO_API_KEY || '';
    } else {
      apiKey = process.env.VILAO_SUBTITLE_KEY || process.env.VILAO_API_KEY || '';
    }
  }

  const baseURL = process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1';

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });
}

/**
 * Gọi Chat Completion tương thích với mọi Header Content-Type và SSE stream trả về từ Vilao Gateway
 */
export async function callVilaoChatCompletion(params: {
  messages: any[];
  model?: string;
  serviceType?: AIServiceType;
  temperature?: number;
}): Promise<string> {
  const serviceType = params.serviceType || 'SUBTITLE';
  let apiKey = '';
  if (serviceType === 'STT') {
    apiKey = process.env.VILAO_STT_KEY || process.env.VILAO_API_KEY || '';
  } else if (serviceType === 'EMBEDDING') {
    apiKey = process.env.VILAO_SUBTITLE_KEY || process.env.VILAO_EMBEDDING_KEY || process.env.VILAO_API_KEY || '';
  } else {
    apiKey = process.env.VILAO_SUBTITLE_KEY || process.env.VILAO_API_KEY || '';
  }

  const baseURL = (process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1').replace(/\/+$/, '');
  const model = params.model || AI_MODELS.SUBTITLE_FIX;

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      stream: false,
      temperature: params.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vilao Gateway HTTP ${res.status}: ${errText}`);
  }

  const rawText = await res.text();

  // 1. Tìm và parse các block JSON xuất hiện trong response (kể cả khi bọc trong "data: {...}")
  const clean = rawText.replace(/^[ \t]*data:[ \t]*/gm, '').replace(/^[ \t]*\[DONE\]/gm, '').trim();

  try {
    const obj = JSON.parse(clean);
    if (obj.choices?.[0]?.message?.content) {
      return obj.choices[0].message.content;
    }
  } catch (_) {}

  // 2. Tách từng dòng SSE
  const lines = rawText.split(/\r?\n/);
  let accumulated = '';
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[ \t]*data:[ \t]*/, '');
    if (!trimmed || trimmed === '[DONE]' || trimmed.startsWith(':')) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.choices?.[0]?.message?.content) {
        return obj.choices[0].message.content;
      }
      if (obj.choices?.[0]?.delta?.content) {
        accumulated += obj.choices[0].delta.content;
      }
    } catch (_) {}
  }

  if (accumulated) return accumulated;

  // 3. Fallback regex tìm JSON object
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.choices?.[0]?.message?.content) return obj.choices[0].message.content;
    } catch (_) {}
  }

  return clean;
}
