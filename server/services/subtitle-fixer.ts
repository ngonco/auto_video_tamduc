import { callVilaoChatCompletion, AI_MODELS } from './api-client.js';
import { KaraokeWord } from './stt-service.js';

export interface SubtitleLine {
  id: string;
  start: number; // giây
  end: number;   // giây
  text: string;
  words: KaraokeWord[];
}

/**
 * Danh từ riêng, danh xưng tôn kính và thuật ngữ Phật giáo bắt buộc viết hoa chuẩn mực
 */
const BUDDHIST_TERMS_MAP = new Map<string, string>([
  ['phật', 'Phật'],
  ['đức phật', 'Đức Phật'],
  ['bồ tát', 'Bồ Tát'],
  ['tam bảo', 'Tam Bảo'],
  ['thế tôn', 'Thế Tôn'],
  ['như lai', 'Như Lai'],
  ['bổn sư', 'Bổn Sư'],
  ['thích ca', 'Thích Ca'],
  ['thích ca mâu ni', 'Thích Ca Mâu Ni'],
  ['quán thế âm', 'Quán Thế Âm'],
  ['quán âm', 'Quán Âm'],
  ['a di đà', 'A Di Đà'],
  ['địa tạng', 'Địa Tạng'],
  ['văn thù', 'Văn Thù'],
  ['phổ hiền', 'Phổ Hiền'],
  ['đại thế chí', 'Đại Thế Chí'],
  ['chư phật', 'Chư Phật'],
  ['chư bồ tát', 'Chư Bồ Tát'],
  ['tăng đoàn', 'Tăng Đoàn'],
  ['niết bàn', 'Niết Bàn'],
  ['tịnh độ', 'Tịnh Độ'],
  ['hộ pháp', 'Hộ Pháp'],
  ['thiện thần', 'Thiện Thần'],
  ['gia hộ', 'Gia Hộ'],
  ['cúng dường', 'Cúng Dường'],
  ['phụng sự', 'Phụng Sự'],
  ['công đức', 'Công Đức'],
  ['phước báu', 'Phước Báu'],
  ['trang nghiêm', 'Trang Nghiêm'],
]);

/**
 * Sửa lỗi chính tả / nhận diện sai âm thường gặp trong khẩu ngữ tiếng Việt
 */
const SPELLING_CORRECTIONS = new Map<string, string>([
  ['dân lên', 'dâng lên'],
  ['lật đặt', 'lật đật'],
  ['mũa vây', 'bủa vây'],
  ['dâng tộc', 'dân tộc'],
]);

/**
 * Danh sách mẫu câu ảo giác (Hallucinations) phổ biến từ Whisper khi gặp khoảng lặng/nhạc đệm
 */
const HALLUCINATION_REGEXES: RegExp[] = [
  /(hãy\s+)?(đăng\s*ký|subscribe|subcribe|sub|like|share|chia\s*sẻ)\s+(kênh|cho\s+kênh|ủng\s+hộ)/i,
  /ghiền\s+mì\s+gõ/i,
  /mì\s+gõ/i,
  /(để\s+)?không\s+bỏ\s+lỡ(\s+những)?\s+(video|clip|tập|phần)/i,
  /lỡ\s+những\s+video(\s+hấp\s+dẫn)?/i,
  /video\s+hấp\s+dẫn/i,
  /(đón\s+xem|theo\s+dõi|xem\s+tiếp)\s+(video|tập|kênh|nội\s+dung)/i,
  /nhấn\s+(chuông|vào\s+chuông|nút\s+đăng\s+ký|theo\s+dõi)/i,
  /chúc\s+các\s+bạn\s+(xem\s+video\s+vui\s+vẻ|có\s+những\s+giây\s+phút|thư\s+giãn)/i,
  /cảm\s+ơn\s+các\s+bạn\s+đã\s+(theo\s+dõi|xem\s+video|ủng\s+hộ|lắng\s+nghe)/i,
  /(hãy\s+)?like\s+và\s+(subscribe|đăng\s*ký|chia\s*sẻ)/i,
  /hẹn\s+gặp\s+lại\s+các\s+bạn\s+trong\s+(những\s+)?video/i,
  /sub\s+kênh/i,
  /đăng\s+ký\s+kênh/i,
];

/**
 * Lọc bỏ các từ/câu ảo giác (Lớp 1: Deterministic Pattern & Anomaly Filter)
 */
export function filterHallucinatedWords(words: KaraokeWord[]): KaraokeWord[] {
  if (!words || words.length === 0) return [];

  // Xây dựng chuỗi toàn văn bản kèm vị trí ký tự của từng từ
  let fullText = '';
  const wordRanges: Array<{ startChar: number; endChar: number; index: number }> = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i].word;
    const prefix = i === 0 ? '' : ' ';
    const actualStart = fullText.length + prefix.length;
    fullText += prefix + w;
    const endChar = fullText.length;
    wordRanges.push({ startChar: actualStart, endChar, index: i });
  }

  const toRemoveIndices = new Set<number>();

  // 1. Quét toàn bộ regex trên chuỗi fullText và xác định chính xác phạm vi từ bị ảnh hưởng
  for (const regex of HALLUCINATION_REGEXES) {
    const globalRegex = new RegExp(regex.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = globalRegex.exec(fullText)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      for (const range of wordRanges) {
        // Kiểm tra overlap giữa range từ và range match
        if (range.startChar < matchEnd && range.endChar > matchStart) {
          toRemoveIndices.add(range.index);
        }
      }
    }
  }

  // 2. Quét các từ đơn lẻ chứa từ khóa ảo giác đặc trưng
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const clean = cleanWordForCompare(w.word);
    if (['subscribe', 'subcribe'].includes(clean)) {
      toRemoveIndices.add(i);
    }
    // Anomaly: 1 từ kéo dài bất thường (> 5.0s) chứa từ khóa nghi vấn
    if (w.end - w.start > 5.0 && ['mì', 'gõ', 'kênh', 'video', 'bỏ', 'lỡ', 'hấp', 'dẫn'].includes(clean)) {
      toRemoveIndices.add(i);
    }
  }

  const filtered = words.filter((_, idx) => !toRemoveIndices.has(idx));
  if (toRemoveIndices.size > 0) {
    console.log(`[SubtitleFixer] Anti-Hallucination Purged ${toRemoveIndices.size} hallucinated words.`);
  }

  return filtered;
}

/**
 * Các liên từ, trợ từ, động từ thường ở giữa câu bắt buộc viết thường nếu không phải mở đầu câu mới
 */
const CONTINUATION_WORDS = new Set<string>([
  'nhưng', 'để', 'mà', 'thì', 'là', 'của', 'cái', 'cho', 'với', 'và', 'hoặc',
  'trong', 'ở', 'từ', 'nếu', 'khi', 'sau', 'trước', 'tùy', 'có', 'không',
  'thế', 'này', 'được', 'điều', 'gì', 'ít', 'nhiều', 'thời', 'gian', 'cứ',
  'nên', 'đến', 'lễ', 'ngồi', 'thiền', 'ra', 'vào', 'lại', 'đã', 'đang',
  'sẽ', 'rồi', 'bởi', 'vì', 'do', 'hết', 'mọi', 'mỗi', 'người', 'ai',
  'chúng', 'ta', 'mình', 'rất', 'quá', 'lắm', 'thành', 'tựu', 'thánh', 'đạo'
]);

/**
 * Các từ thường mở đầu vế câu mới trong khẩu ngữ tiếng Việt
 */
const CLAUSE_STARTER_WORDS = new Set<string>([
  'thì', 'nhưng', 'và', 'hoặc', 'để', 'mà', 'cho', 'với', 'khi', 'nếu',
  'bởi', 'vì', 'do', 'tuy', 'nên', 'rồi', 'nhớ', 'tự', 'hãy', 'chúng', 'mình'
]);

/**
 * Các từ không nên đứng trơ trọi ở cuối dòng nếu dòng đã đủ dài
 */
const HANGING_END_WORDS = new Set<string>([
  'thì', 'là', 'và', 'hoặc', 'của', 'để', 'mà', 'với', 'trong', 'ở', 'từ', 'có', 'cho'
]);

function cleanWordForCompare(w: string): string {
  return (w || '').trim().toLowerCase().replace(/[,.;:!?…""''“”‘’()\[\]]+$/, '').replace(/^[,.;:!?…""''“”‘’()\[\]]+/, '');
}

function formatWord(rawWord: string, isStartOfSentence: boolean, isFirstWordInLine: boolean): string {
  let cleanWord = rawWord.replace(/[,.;:!?]+$/, '');
  let lower = cleanWord.toLowerCase();

  // Sửa lỗi chính tả âm tĩnh
  if (SPELLING_CORRECTIONS.has(lower)) {
    lower = SPELLING_CORRECTIONS.get(lower)!;
  }

  // Danh từ tôn kính Phật giáo
  if (BUDDHIST_TERMS_MAP.has(lower)) {
    return BUDDHIST_TERMS_MAP.get(lower)!;
  }

  // Viết hoa đầu câu
  if (isStartOfSentence && isFirstWordInLine) {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  return lower;
}

/**
 * Gọi Gemini 3.1 Flash Lite để sửa lỗi chính tả ngữ cảnh tiếng Việt và loại bỏ ảo giác (Lớp 2)
 */
async function fixVietnameseSpellingWithAI(
  rawText: string,
  rawWords: KaraokeWord[]
): Promise<{ correctedWords: KaraokeWord[]; correctedText: string }> {
  if (!rawWords || rawWords.length === 0) {
    return { correctedWords: rawWords || [], correctedText: rawText || '' };
  }

  const promptText = rawText || rawWords.map((w) => w.word).join(' ');

  const systemPrompt = `Bạn là chuyên gia ngôn ngữ học tiếng Việt và biên tập ngữ pháp, chính tả văn phong truyền cảm, thơ ca, triết lý nhân sinh.
Nhiệm vụ của bạn:
1. Kiểm tra văn bản tiếng Việt được bóc tách từ giọng nói (Speech-to-Text) và SỬA CÁC LỖI SAI CHÍNH TẢ, SAI THANH ĐIỆU (hỏi/ngã, sắc/huyền/nặng), NHẦM LẪN PHỤ ÂM ĐẦU HOẶC VẦN (như b/m, d/gi/r, s/x, tr/ch, iêm/im, an/ang, dâng/dân, đừng/đứng, mũa/bủa, tìm tàn/tiềm tàng, dũ/dù/dẫu...) theo đúng ngữ nghĩa tự nhiên của câu văn.
2. PHÁT HIỆN VÀ LOẠI BỎ TRIỆT ĐỂ CÁC CÂU ẢO GIÁC (Whisper Hallucinations): Nếu trong văn bản xuất hiện các câu kêu gọi YouTube/TikTok outro như "Hãy subscribe cho kênh", "Ghiền mì gõ", "để không bỏ lỡ video", "like và share", "bấm chuông", "cảm ơn đã theo dõi", "hẹn gặp lại"... mà không thuộc nội dung chính của bài đọc, BẮT BUỘC LOẠI BỎ HOÀN TOÀN khỏi corrected_text và đưa vào danh sách hallucinated_phrases.

CÁC QUY TẮC BẮT BUỘC:
1. CHỈ sửa những từ bị sai âm, sai nghĩa hoặc sai chính tả trong ngữ cảnh. TUYỆT ĐỐI KHÔNG viết lại văn phong, KHÔNG thêm bớt ý nghĩa, KHÔNG thay đổi cấu trúc câu nếu từ gốc đã có nghĩa đúng.
2. Giữ nguyên tối đa số lượng từ (1 từ thay bằng 1 từ, 2 từ thay bằng 2 từ) đối với các câu chính để không làm lệch mốc thời gian giọng đọc.
3. Trả về DUY NHẤT một khối JSON hợp lệ theo cấu trúc sau (không kèm lời giải thích nào khác):
{
  "corrected_text": "Toàn bộ văn bản đã sửa đúng chính tả (đã loại bỏ hết câu ảo giác)",
  "corrections": [
    {"original": "từ_hoặc_cụm_sai", "corrected": "từ_hoặc_cụm_đúng"}
  ],
  "hallucinated_phrases": [
    "cụm từ hoặc câu ảo giác cần xóa bỏ nếu có"
  ]
}`;

  try {
    const aiResponse = await callVilaoChatCompletion({
      model: AI_MODELS.SUBTITLE_FIX,
      serviceType: 'SUBTITLE',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Văn bản cần kiểm tra và sửa lỗi chính tả:\n"${promptText}"` },
      ],
    });

    let parsedResult: {
      corrected_text?: string;
      corrections?: Array<{ original: string; corrected: string }>;
      hallucinated_phrases?: string[];
    } = {};

    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('[SubtitleFixer] Could not parse AI JSON response, falling back:', parseErr);
    }

    const corrections = Array.isArray(parsedResult.corrections) ? parsedResult.corrections : [];
    const hallucinatedPhrases = Array.isArray(parsedResult.hallucinated_phrases) ? parsedResult.hallucinated_phrases : [];
    const correctedText = parsedResult.corrected_text || '';

    // Nếu AI phát hiện câu ảo giác, loại bỏ khỏi rawWords trước
    let workingWords = [...rawWords];
    for (const hPhrase of hallucinatedPhrases) {
      const hTokens = cleanWordForCompare(hPhrase).split(/\s+/).filter(Boolean);
      if (hTokens.length === 0) continue;

      for (let i = 0; i <= workingWords.length - hTokens.length; i++) {
        let match = true;
        for (let j = 0; j < hTokens.length; j++) {
          if (cleanWordForCompare(workingWords[i + j].word) !== hTokens[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          workingWords.splice(i, hTokens.length);
          i--;
        }
      }
    }

    // Áp dụng thuật toán Word-Alignment & Time Interpolation
    const alignedWords = alignCorrectedWordsWithTimestamps(workingWords, corrections, correctedText);

    return {
      correctedWords: alignedWords,
      correctedText: correctedText || alignedWords.map((w) => w.word).join(' '),
    };
  } catch (error: any) {
    console.error('[SubtitleFixer] Error calling AI spell-check:', error.message);
    // Fallback an toàn: giữ nguyên từ gốc
    return { correctedWords: rawWords, correctedText: promptText };
  }
}

/**
 * Thuật toán Word-Alignment & Time Interpolation:
 * Ánh xạ các từ/cụm từ đã sửa vào mảng KaraokeWord[] gốc để bảo toàn 100% mốc thời gian start & end
 */
export function alignCorrectedWordsWithTimestamps(
  rawWords: KaraokeWord[],
  corrections: Array<{ original: string; corrected: string }>,
  correctedText?: string
): KaraokeWord[] {
  if (!rawWords || rawWords.length === 0) return [];

  // Tạo bản sao làm việc
  let workingWords: KaraokeWord[] = rawWords.map((w) => ({ ...w }));

  // Bước 1: Áp dụng danh sách corrections [original -> corrected]
  for (const corr of corrections) {
    const origPhrase = cleanWordForCompare(corr.original);
    const corrPhrase = (corr.corrected || '').trim();
    if (!origPhrase || !corrPhrase) continue;

    const origTokens = origPhrase.split(/\s+/).filter(Boolean);
    const corrTokens = corrPhrase.split(/\s+/).filter(Boolean);
    if (origTokens.length === 0 || corrTokens.length === 0) continue;

    // Tìm vị trí xuất hiện của origTokens trong workingWords
    for (let i = 0; i <= workingWords.length - origTokens.length; i++) {
      let match = true;
      for (let j = 0; j < origTokens.length; j++) {
        if (cleanWordForCompare(workingWords[i + j].word) !== origTokens[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        const start = workingWords[i].start;
        const end = workingWords[i + origTokens.length - 1].end;
        const totalDur = Math.max(0.05, end - start);

        // Tạo mảng từ mới thay thế kèm nội suy thời gian
        const replacementWords: KaraokeWord[] = corrTokens.map((token, k) => {
          const tokenDur = totalDur / corrTokens.length;
          return {
            word: token,
            start: Number((start + k * tokenDur).toFixed(2)),
            end: Number((start + (k + 1) * tokenDur).toFixed(2)),
          };
        });

        // Thay thế đoạn từ trong workingWords
        workingWords.splice(i, origTokens.length, ...replacementWords);
        i += replacementWords.length - 1; // Nhảy qua các từ vừa chèn
      }
    }
  }

  // Bước 2: Đối soát với correctedText nếu số lượng từ bằng nhau (1-to-1 matching)
  if (correctedText) {
    const fullCorrTokens = correctedText.trim().split(/\s+/).filter(Boolean);
    if (fullCorrTokens.length === workingWords.length) {
      for (let i = 0; i < workingWords.length; i++) {
        const rawClean = cleanWordForCompare(workingWords[i].word);
        const corrClean = cleanWordForCompare(fullCorrTokens[i]);
        // Nếu khác nhau nhưng độ dài tương đồng hoặc là lỗi âm -> áp dụng từ đã sửa
        if (rawClean !== corrClean && corrClean.length > 0) {
          workingWords[i].word = fullCorrTokens[i];
        }
      }
    }
  }

  return workingWords;
}

/**
 * Phân đoạn phụ đề 9:16 thông minh & bảo toàn 100% từ ngữ và mốc thời gian của Voice
 * Đảm bảo:
 * 1. Không bị mất từ, không bị rút ngắn, không kết thúc trước Voice
 * 2. Ngắt dòng 3-6 từ tối ưu cho khung hình dọc 9:16
 * 3. Đồng bộ chuẩn xác tuyệt đối từng từ (Karaoke Word Timestamps)
 */
export function segmentAndPolishSubtitles(rawWords: KaraokeWord[]): SubtitleLine[] {
  if (!rawWords || rawWords.length === 0) {
    return [];
  }

  const rawChunks: KaraokeWord[][] = [];
  let currentChunk: KaraokeWord[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const wordObj = rawWords[i];
    currentChunk.push(wordObj);

    const isLastWord = i === rawWords.length - 1;
    if (isLastWord) {
      rawChunks.push(currentChunk);
      break;
    }

    const nextWordObj = rawWords[i + 1];
    const nextWordClean = nextWordObj.word.trim().toLowerCase().replace(/[,.;:!?]+$/, '');
    const pauseGap = nextWordObj.start - wordObj.end;
    const rawWordText = wordObj.word.trim();
    const cleanWordText = rawWordText.toLowerCase().replace(/[,.;:!?]+$/, '');
    const hasComma = /[,;:]$/.test(rawWordText);
    const hasSentenceEnd = /[.!?]$/.test(rawWordText);

    // Tiêu chí 1: Dấu kết thúc câu (. ! ?) -> ngắt dòng nếu dòng >= 2 từ
    if (hasSentenceEnd && currentChunk.length >= 2) {
      rawChunks.push(currentChunk);
      currentChunk = [];
      continue;
    }

    // Tiêu chí 2: Khoảng lặng âm thanh rõ rệt (pauseGap >= 0.30s) -> ngắt dòng nếu dòng >= 2 từ
    if (pauseGap >= 0.30 && currentChunk.length >= 2) {
      rawChunks.push(currentChunk);
      currentChunk = [];
      continue;
    }

    // Tiêu chí 3: Dấu phẩy -> ngắt dòng nếu đã có ít nhất 3 từ
    if (hasComma && currentChunk.length >= 3) {
      rawChunks.push(currentChunk);
      currentChunk = [];
      continue;
    }

    // Tiêu chí 4: Từ kế tiếp là từ mở đầu vế câu mới (thì, nhưng, để, và...) và dòng hiện tại đã đủ 3-4 từ
    if (currentChunk.length >= 3 && CLAUSE_STARTER_WORDS.has(nextWordClean) && !HANGING_END_WORDS.has(cleanWordText)) {
      rawChunks.push(currentChunk);
      currentChunk = [];
      continue;
    }

    // Tiêu chí 5: Dòng đã đạt 5 từ và không kết thúc bằng từ treo
    if (currentChunk.length >= 5 && !HANGING_END_WORDS.has(cleanWordText)) {
      rawChunks.push(currentChunk);
      currentChunk = [];
      continue;
    }

    // Tiêu chí 6: Giới hạn tối đa 6 từ để không bị tràn dòng 9:16
    if (currentChunk.length >= 6) {
      rawChunks.push(currentChunk);
      currentChunk = [];
      continue;
    }
  }

  // Xử lý dòng cuối cùng nếu bị quá ngắn (1-2 từ) -> gộp vào dòng trước để tránh cụt câu
  if (rawChunks.length > 1) {
    const lastChunk = rawChunks[rawChunks.length - 1];
    if (lastChunk.length <= 2) {
      const prevChunk = rawChunks[rawChunks.length - 2];
      if (prevChunk.length + lastChunk.length <= 7) {
        rawChunks[rawChunks.length - 2] = [...prevChunk, ...lastChunk];
        rawChunks.pop();
      }
    }
  }

  // Chuẩn hóa ngữ pháp & chính tả cho từng dòng
  let isStartOfSentence = true;
  const lines: SubtitleLine[] = rawChunks.map((chunk, lineIdx) => {
    const firstWordClean = chunk[0].word.replace(/[,.;:!?]+$/, '').toLowerCase();
    let lineStartsNewSentence = isStartOfSentence;
    if (lineIdx > 0 && CONTINUATION_WORDS.has(firstWordClean)) {
      lineStartsNewSentence = false;
    }

    const formattedWords: KaraokeWord[] = chunk.map((w, idx) => {
      const formatted = formatWord(w.word, lineStartsNewSentence, idx === 0);
      return {
        word: formatted,
        start: w.start,
        end: w.end,
      };
    });

    const lineText = formattedWords.map((w) => w.word).join(' ');
    const lineStart = formattedWords[0].start;
    const lineEnd = formattedWords[formattedWords.length - 1].end;

    const lastRawWord = chunk[chunk.length - 1].word;
    const endsWithSentencePunct = /[.!?]$/.test(lastRawWord.trim());
    if (endsWithSentencePunct) {
      isStartOfSentence = true;
    } else {
      isStartOfSentence = false;
    }

    return {
      id: `line_${lineIdx + 1}`,
      start: lineStart,
      end: lineEnd,
      text: lineText,
      words: formattedWords,
    };
  });

  return lines;
}

/**
 * Tự động phân bổ lại mốc thời gian và chia dòng phụ đề khi người dùng sửa toàn bộ văn bản (Bulk Edit)
 */
export async function realignAndSegmentFromCustomText(
  customText: string,
  rawWords: KaraokeWord[],
  totalDuration: number
): Promise<SubtitleLine[]> {
  if (!customText || !customText.trim()) {
    return [];
  }

  const cleanText = customText.trim();
  const tokens = cleanText.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  let alignedWords: KaraokeWord[] = [];

  if (rawWords && rawWords.length > 0) {
    const rawStart = rawWords[0].start;
    const rawEnd = Math.max(rawWords[rawWords.length - 1].end, totalDuration || rawWords[rawWords.length - 1].end);
    const totalSpan = Math.max(0.5, rawEnd - rawStart);

    if (tokens.length === rawWords.length) {
      // 1-to-1 matching: giữ nguyên mốc thời gian của từng từ gốc
      alignedWords = tokens.map((token, idx) => ({
        word: token,
        start: rawWords[idx].start,
        end: rawWords[idx].end,
      }));
    } else {
      // Số lượng từ thay đổi: nội suy đều thời gian theo tỷ lệ
      const wordDur = totalSpan / tokens.length;
      alignedWords = tokens.map((token, idx) => ({
        word: token,
        start: Number((rawStart + idx * wordDur).toFixed(2)),
        end: Number((rawStart + (idx + 1) * wordDur).toFixed(2)),
      }));
    }
  } else {
    // Không có rawWords: nội suy đều trên toàn bộ totalDuration
    const validDur = totalDuration > 0 ? totalDuration : 30.0;
    const wordDur = validDur / tokens.length;
    alignedWords = tokens.map((token, idx) => ({
      word: token,
      start: Number((idx * wordDur).toFixed(2)),
      end: Number(((idx + 1) * wordDur).toFixed(2)),
    }));
  }

  // Lọc bỏ ảo giác nếu còn sót lại và phân đoạn dòng 3-6 từ
  const filteredWords = filterHallucinatedWords(alignedWords);
  return segmentAndPolishSubtitles(filteredWords);
}

/**
 * Xử lý chuẩn hóa, sửa lỗi chính tả ngữ cảnh bằng AI, lọc ảo giác 2 lớp và ngắt dòng phụ đề chuẩn cho toàn hệ thống
 */
export async function polishAndSegmentSubtitles(
  rawText: string,
  rawWords: KaraokeWord[]
): Promise<SubtitleLine[]> {
  if (!rawWords || rawWords.length === 0) {
    return [];
  }

  // Lớp 1: Lọc bỏ các từ/mẫu câu ảo giác từ Whisper
  const preFilteredWords = filterHallucinatedWords(rawWords);
  if (preFilteredWords.length === 0) {
    return [];
  }

  console.log('[SubtitleFixer] Running Gemini contextual spell-check & anti-hallucination on', preFilteredWords.length, 'words...');
  
  // Lớp 2: Gemini Contextual Spell-Check & Hallucination Purge
  const { correctedWords } = await fixVietnameseSpellingWithAI(rawText, preFilteredWords);

  // Hậu kiểm: Quét lại mẫu câu ảo giác sau khi sửa
  const postFilteredWords = filterHallucinatedWords(correctedWords);

  // Phân đoạn dòng phụ đề 3-6 từ cho 9:16
  return segmentAndPolishSubtitles(postFilteredWords);
}

