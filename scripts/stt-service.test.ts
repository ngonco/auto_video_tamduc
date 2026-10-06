import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { transcribeAudio } from '../server/services/stt-service.js';

// Chỉ dùng phản hồi giả lập: không gửi voice hoặc API key ra mạng.
const originalFetch = globalThis.fetch;
const originalProbe = ffmpeg.ffprobe;
const originalAppend = fs.appendFileSync;
const envKeys = ['GROQ_API_KEY', 'GROQ_STT_MODEL', 'STT_MODEL', 'STT_FALLBACK_MODELS', 'STT_REQUEST_TIMEOUT_MS', 'VILAO_STT_KEY', 'VILAO_API_KEY'];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let testDir: string;
let audioPath: string;
let attemptedModels: string[];
const speech = { text: 'Nam mô', duration: 2, words: [{ word: 'Nam', start: 0, end: 1 }, { word: 'mô', start: 1, end: 2 }] };

before(() => {
  testDir = fs.mkdtempSync(path.resolve('.cache', 'stt-test-'));
  audioPath = path.join(testDir, 'voice.wav');
  fs.writeFileSync(audioPath, 'fixture');
  // Không trộn kết quả giả lập vào log chẩn đoán thật của ứng dụng.
  fs.appendFileSync = ((...args: Parameters<typeof fs.appendFileSync>) => {
    if (String(args[0]) === path.resolve('.cache', 'stt.log')) return;
    return originalAppend(...args);
  }) as typeof fs.appendFileSync;
  // Metadata được giả lập độc lập để kiểm thử không cần chạy FFprobe.
  ffmpeg.ffprobe = ((_file: string, callback: any) => {
    callback(null, { streams: [], format: { duration: 2 } });
  }) as typeof ffmpeg.ffprobe;
});

beforeEach(() => {
  attemptedModels = [];
  process.env.GROQ_API_KEY = '';
  process.env.GROQ_STT_MODEL = 'whisper-large-v3-turbo';
  process.env.STT_MODEL = 'tsa/groq/whisper-large-v3';
  process.env.STT_FALLBACK_MODELS = 'tsa/groq/whisper-large-v3-turbo,bh2/faster-whisper-chat';
  process.env.VILAO_STT_KEY = 'test-key';
  process.env.VILAO_API_KEY = '';
  process.env.STT_REQUEST_TIMEOUT_MS = '60000';
});

afterEach(() => { globalThis.fetch = originalFetch; });
after(() => {
  globalThis.fetch = originalFetch;
  ffmpeg.ffprobe = originalProbe;
  fs.appendFileSync = originalAppend;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.unlinkSync(audioPath);
  fs.rmdirSync(testDir);
});

function mockResponses(responses: Array<Response | Error>) {
  globalThis.fetch = (async (_url: any, init: any) => {
    const isGroq = String(_url) === 'https://api.groq.com/openai/v1/audio/transcriptions';
    if (!isGroq) assert.match(String(_url), /\/audio\/transcriptions$/);
    const form = init.body as FormData;
    attemptedModels.push(String(form.get('model')));
    assert.equal(form.get('language'), 'vi');
    assert.equal(init.headers.Authorization, `Bearer ${isGroq ? 'test-groq-key' : 'test-key'}`);
    assert.equal(form.get('response_format'), 'verbose_json');
    assert.equal(form.get('timestamp_granularities[]'), 'word');
    assert.equal([...form.keys()].at(-1), 'file');
    assert.equal((form.get('file') as File).type, 'audio/wav');
    const response = responses.shift();
    assert.ok(response, 'Unexpected extra model attempt');
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('primary success preserves genuine word timestamps without fallback', async () => {
  mockResponses([json(speech)]);
  const result = await transcribeAudio(audioPath);
  assert.deepEqual(result.words, speech.words);
  assert.equal(result.isMusic, false);
  assert.deepEqual(attemptedModels, ['tsa/groq/whisper-large-v3']);
});

test('503 and 429 advance in order to a working fallback', async () => {
  mockResponses([json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503), json({ error: { code: 'RATE_LIMIT' } }, 429), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).text, speech.text);
  assert.deepEqual(attemptedModels, ['tsa/groq/whisper-large-v3', 'tsa/groq/whisper-large-v3-turbo', 'bh2/faster-whisper-chat']);
});

test('network failure advances to fallback', async () => {
  mockResponses([new TypeError('fetch failed'), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).words.length, 2);
  assert.equal(attemptedModels.length, 2);
});

for (const status of [401, 402]) {
  test(`${status} stops immediately and keeps the account error`, async () => {
    mockResponses([json({ error: { message: 'Account error' } }, status)]);
    await assert.rejects(transcribeAudio(audioPath), (error: any) => error.status === status);
    assert.equal(attemptedModels.length, 1);
  });
}

test('missing API key stops before making any request', async () => {
  process.env.VILAO_STT_KEY = '';
  mockResponses([]);
  await assert.rejects(transcribeAudio(audioPath), (error: any) => error.code === 'UNAUTHORIZED');
  assert.equal(attemptedModels.length, 0);
});

test('file-size restriction is model-specific and allows fallback', async () => {
  mockResponses([json({ error: { message: 'File too large' } }, 413), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).isMusic, false);
  assert.equal(attemptedModels.length, 2);
});

test('empty result retries instead of prematurely classifying music', async () => {
  mockResponses([json({ text: '', words: [] }), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).isMusic, false);
  assert.equal(attemptedModels.length, 2);
});

test('all valid empty results permit music mode', async () => {
  mockResponses([json({ text: '' }), json({ text: '' }), json({ text: '' })]);
  const result = await transcribeAudio(audioPath);
  assert.equal(result.isMusic, true);
  assert.equal(result.duration, 2);
});

test('empty results mixed with provider failure do not hide the outage', async () => {
  mockResponses([json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503), json({ text: '' }), json({ text: '' })]);
  await assert.rejects(transcribeAudio(audioPath), (error: any) => error.code === 'STT_ALL_MODELS_FAILED' && error.status === 503);
});

test('malformed JSON and unexpected successful payloads retry', async () => {
  mockResponses([new Response('<html>Bad gateway</html>'), json({ error: { message: 'Provider error' } }), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).text, speech.text);
  assert.equal(attemptedModels.length, 3);
});

test('text-only model uses probed duration instead of arbitrary 30 seconds', async () => {
  mockResponses([json({ text: 'Nam mô', duration: 999 })]);
  const result = await transcribeAudio(audioPath);
  assert.equal(result.duration, 2);
  assert.deepEqual(result.words, speech.words);
});

test('words-only and segments-only transcripts are retained', async () => {
  mockResponses([json({ words: speech.words })]);
  assert.equal((await transcribeAudio(audioPath)).text, speech.text);
  mockResponses([json({ segments: [{ text: 'Nam mô', start: 0, end: 2 }] })]);
  assert.deepEqual((await transcribeAudio(audioPath)).words, speech.words);
});

test('duplicate models are attempted once and all-failed lists their codes', async () => {
  process.env.STT_FALLBACK_MODELS = 'tsa/groq/whisper-large-v3, tsa/groq/whisper-large-v3-turbo,tsa/groq/whisper-large-v3-turbo';
  mockResponses([json({}, 503), json({}, 503)]);
  await assert.rejects(transcribeAudio(audioPath), (error: any) => error.code === 'STT_ALL_MODELS_FAILED' && error.message.includes('HTTP_503'));
  assert.equal(attemptedModels.length, 2);
});

test('explicit empty fallback configuration disables extra attempts', async () => {
  process.env.STT_FALLBACK_MODELS = '';
  mockResponses([json({}, 503)]);
  await assert.rejects(transcribeAudio(audioPath), (error: any) => error.code === 'STT_ALL_MODELS_FAILED');
  assert.equal(attemptedModels.length, 1);
});

test('default chain includes all five supplied model names with exact prefixes', async () => {
  delete process.env.STT_FALLBACK_MODELS;
  mockResponses([json({}, 503), json({}, 503), json({}, 503), json({}, 503), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).text, speech.text);
  assert.deepEqual(attemptedModels, [
    'tsa/groq/whisper-large-v3', 'tsa/groq/whisper-large-v3-turbo',
    'bh2/faster-whisper-chat', 'tsa/gemini/gemini-2.5-flash', 'tsa/gemini/gemini-2.5-flash-lite',
  ]);
});

test('timeout aborts a pending request then tries fallback', async () => {
  process.env.STT_REQUEST_TIMEOUT_MS = '15';
  let attempts = 0;
  const keepAlive = setInterval(() => {}, 1000);
  globalThis.fetch = (async (_url: any, init: any) => {
    attempts++;
    if (attempts > 1) return json(speech);
    return new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  }) as typeof fetch;
  try {
    assert.equal((await transcribeAudio(audioPath)).isMusic, false);
    assert.equal(attempts, 2);
  } finally {
    clearInterval(keepAlive);
  }
});

const groqSpeech = {
  text: 'Nam mô', duration: 999,
  words: [{ word: 'Nam', start: 0.12, end: 0.8 }, { word: 'mô', start: 1.05, end: 1.75 }],
};

test('Groq is first, uses native endpoint and retains exact text word timestamps', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  mockResponses([json(groqSpeech)]);
  const result = await transcribeAudio(audioPath);
  assert.deepEqual(attemptedModels, ['whisper-large-v3-turbo']);
  assert.equal(result.duration, 2);
  assert.equal(result.isMusic, false);
  assert.deepEqual(result.words, [
    { word: 'Nam', start: 0.12, end: 0.8 }, { word: 'mô', start: 1.05, end: 1.75 },
  ]);
});

for (const status of [401, 402, 403, 429, 503]) {
  test(`Groq ${status} falls back to Vilao with its independent key`, async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    mockResponses([json({ error: { message: 'Provider error' } }, status), json(speech)]);
    assert.equal((await transcribeAudio(audioPath)).text, speech.text);
    assert.deepEqual(attemptedModels, ['whisper-large-v3-turbo', 'tsa/groq/whisper-large-v3']);
  });
}

test('Groq empty, malformed JSON and network failures all allow Vilao fallback', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  for (const response of [json({ text: '', words: [] }), new Response('invalid JSON'), new TypeError('fetch failed')]) {
    attemptedModels = [];
    mockResponses([response, json(speech)]);
    assert.equal((await transcribeAudio(audioPath)).isMusic, false);
    assert.deepEqual(attemptedModels, ['whisper-large-v3-turbo', 'tsa/groq/whisper-large-v3']);
  }
});

test('default chain tries Groq then all five original Vilao models', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  delete process.env.STT_FALLBACK_MODELS;
  mockResponses([json({}, 503), json({}, 503), json({}, 503), json({}, 503), json({}, 503), json(speech)]);
  assert.equal((await transcribeAudio(audioPath)).text, speech.text);
  assert.deepEqual(attemptedModels, [
    'whisper-large-v3-turbo', 'tsa/groq/whisper-large-v3', 'tsa/groq/whisper-large-v3-turbo',
    'bh2/faster-whisper-chat', 'tsa/gemini/gemini-2.5-flash', 'tsa/gemini/gemini-2.5-flash-lite',
  ]);
});

test('Groq alone works without a Vilao key; error never sends an empty Vilao key', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.VILAO_STT_KEY = '';
  mockResponses([json(groqSpeech)]);
  assert.equal((await transcribeAudio(audioPath)).text, speech.text);
  attemptedModels = [];
  mockResponses([json({}, 503)]);
  await assert.rejects(transcribeAudio(audioPath), (error: any) => error.code === 'STT_ALL_MODELS_FAILED');
  assert.deepEqual(attemptedModels, ['whisper-large-v3-turbo']);
});

test('Groq failure mixed with empty Vilao responses does not become music', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  mockResponses([json({}, 503), json({ text: '' }), json({ text: '' }), json({ text: '' })]);
  await assert.rejects(transcribeAudio(audioPath), (error: any) => error.code === 'STT_ALL_MODELS_FAILED');
});

test('all six empty successful responses permit music mode', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  delete process.env.STT_FALLBACK_MODELS;
  mockResponses(Array.from({ length: 6 }, () => json({ text: '', words: [] })));
  assert.equal((await transcribeAudio(audioPath)).isMusic, true);
  assert.equal(attemptedModels.length, 6);
});

test('Groq timeout aborts then advances to Vilao', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.STT_REQUEST_TIMEOUT_MS = '15';
  const keepAlive = setInterval(() => {}, 1000);
  const urls: string[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    urls.push(String(url));
    if (urls.length > 1) return json(speech);
    return new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  }) as typeof fetch;
  try {
    assert.equal((await transcribeAudio(audioPath)).isMusic, false);
    assert.equal(urls[0], 'https://api.groq.com/openai/v1/audio/transcriptions');
    assert.match(urls[1], /\/audio\/transcriptions$/);
  } finally {
    clearInterval(keepAlive);
  }
});
