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
  ['dân', 'dâng'],      // dân lên -> dâng lên
  ['lật đặt', 'lật đật'], // lật đặt -> lật đật
]);

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

function formatWord(rawWord: string, isStartOfSentence: boolean, isFirstWordInLine: boolean): string {
  let cleanWord = rawWord.replace(/[,.;:!?]+$/, '');
  let lower = cleanWord.toLowerCase();

  // Sửa lỗi chính tả âm
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

  // Chuẩn hóa ngữ pháp & chính tả Phật giáo cho từng dòng
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
 * Xử lý chuẩn hóa và ngắt dòng phụ đề chuẩn cho toàn hệ thống
 */
export async function polishAndSegmentSubtitles(
  _rawText: string,
  rawWords: KaraokeWord[]
): Promise<SubtitleLine[]> {
  if (!rawWords || rawWords.length === 0) {
    return [];
  }

  // Sử dụng thuật toán phân đoạn trực tiếp từ rawWords để đảm bảo 100% mốc thời gian và không mất từ
  return segmentAndPolishSubtitles(rawWords);
}
