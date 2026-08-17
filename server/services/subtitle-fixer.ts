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
 * Danh từ riêng và danh xưng tôn kính trong Phật giáo bắt buộc viết hoa
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
]);

/**
 * Các từ liên từ, trợ từ, động từ thường ở giữa câu bắt buộc viết thường nếu không phải đầu câu mới
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
 * Bộ lọc Rule-based hậu kỳ: Chuẩn hóa chữ hoa / chữ thường theo đúng ngữ pháp tiếng Việt & Phật học
 */
function sanitizeSubtitleGrammar(lines: SubtitleLine[]): SubtitleLine[] {
  let isStartOfSentence = true;

  return lines.map((line, lineIdx) => {
    let rawText = (line.text || '').trim().replace(/[,.;:!?]+$/, '');
    let tokens = rawText.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) return line;

    const firstWordLower = tokens[0].toLowerCase();
    
    // Nếu dòng bắt đầu bằng liên từ nối hoặc trợ từ nối tiếp, chắc chắn không phải mở đầu câu mới
    let lineStartsNewSentence = isStartOfSentence;
    if (lineIdx > 0 && CONTINUATION_WORDS.has(firstWordLower)) {
      lineStartsNewSentence = false;
    }

    const formattedTokens = tokens.map((token, idx) => {
      const lower = token.toLowerCase();

      // 1. Luôn viết hoa danh từ tôn kính Phật giáo
      if (BUDDHIST_TERMS_MAP.has(lower)) {
        return BUDDHIST_TERMS_MAP.get(lower)!;
      }

      // 2. Viết hoa chữ cái đầu tiên nếu là từ mở đầu câu mới
      if (idx === 0 && lineStartsNewSentence) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }

      // 3. Toàn bộ các từ còn lại trong câu đều viết thường
      return lower;
    });

    // Xác định trạng thái cho dòng tiếp theo
    const originalEndsWithPunctuation = /[.!?]$/.test(line.text.trim());
    if (originalEndsWithPunctuation) {
      isStartOfSentence = true;
    } else {
      isStartOfSentence = false;
    }

    const cleanText = formattedTokens.join(' ');

    // Đồng bộ lại từng từ đơn lẻ trong words array để làm hiệu ứng Karaoke
    const originalWords = line.words || [];
    const updatedWords = originalWords.map((w, idx) => {
      const formattedWord = formattedTokens[idx] || w.word;
      return {
        ...w,
        word: formattedWord,
      };
    });

    return {
      ...line,
      text: cleanText,
      words: updatedWords,
    };
  });
}

/**
 * Căn chỉnh mảng dòng chuỗi phân đoạn từ AI với mốc thời gian chi tiết từng từ từ Whisper
 */
function alignLinesWithTimestamps(formattedLines: string[], rawWords: KaraokeWord[]): SubtitleLine[] {
  let wordPointer = 0;
  const result: SubtitleLine[] = [];

  for (let lIdx = 0; lIdx < formattedLines.length; lIdx++) {
    const lineText = formattedLines[lIdx].trim().replace(/[,.;:!?]+$/, '');
    const tokens = lineText.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const lineWords: KaraokeWord[] = [];
    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      let rawW = rawWords[wordPointer];
      if (!rawW) {
        const prevW = rawWords[rawWords.length - 1];
        rawW = {
          word: tokens[tIdx],
          start: prevW ? prevW.end : 0,
          end: prevW ? prevW.end + 0.3 : 0.3,
        };
      } else {
        wordPointer++;
      }

      lineWords.push({
        word: tokens[tIdx],
        start: rawW.start,
        end: rawW.end,
      });
    }

    const start = lineWords[0].start;
    const end = lineWords[lineWords.length - 1].end;

    result.push({
      id: `line_${lIdx + 1}`,
      text: lineText,
      start,
      end,
      words: lineWords,
    });
  }

  return sanitizeSubtitleGrammar(result);
}

/**
 * Sử dụng LLM ts/gemini-3.1-flash-lite + Bộ lọc Rule-based để ngắt dòng và chuẩn hóa chính tả Phật học
 */
export async function polishAndSegmentSubtitles(
  rawText: string,
  rawWords: KaraokeWord[]
): Promise<SubtitleLine[]> {
  if (!rawWords || rawWords.length === 0) {
    return [];
  }

  if (rawWords.length <= 5) {
    const singleLine: SubtitleLine = {
      id: 'sub_1',
      start: rawWords[0].start,
      end: rawWords[rawWords.length - 1].end,
      text: rawWords.map((w) => w.word).join(' '),
      words: rawWords,
    };
    return sanitizeSubtitleGrammar([singleLine]);
  }

  const prompt = `
Bạn là chuyên gia ngôn ngữ tiếng Việt và Phật học.
Nhiệm vụ: Hãy chia đoạn văn bản sau thành các câu phụ đề ngắn (3 đến 6 từ mỗi dòng) để hiển thị trên video dọc 9:16 (TikTok/Reels).

QUY TẮC BẮT BUỘC:
1. CHỈ VIẾT HOA chữ cái đầu tiên của câu mới hoàn chỉnh.
2. Các dòng phụ đề là phần nối tiếp của câu BẮT BUỘC viết thường chữ cái đầu dòng (ví dụ: dòng 1 "Trước khi ngồi thiền", dòng 2 "cứ nên đến lễ Phật", dòng 3 "tùy thời gian của mình có").
3. TUYỆT ĐỐI KHÔNG viết hoa các liên từ/từ thường ở giữa câu: nhưng, để, mà, thì, là, của, cái, cho, với, và, trong, ở, từ, nếu, khi, sau, tùy, có, không, được, điều, gì, ít, nhiều, thời, gian, ta, mình...
4. LUÔN VIẾT HOA các danh từ tôn kính Phật giáo: Phật, Đức Phật, Bồ Tát, Tam Bảo, Thế Tôn, Như Lai, Bổn Sư, Thích Ca, Quán Thế Âm, A Di Đà, Chư Phật...
5. KHÔNG để dấu chấm (.) hoặc phẩy (,) ở cuối dòng phụ đề.

ĐOẠN VĂN BẢN ĐẦU VÀO:
"${rawText}"

YÊU CẦU ĐẦU RA:
Trả về DUY NHẤT một mảng JSON các chuỗi:
[
  "Trước khi ngồi thiền",
  "cứ nên đến lễ Phật",
  "lễ ít hay lễ nhiều",
  "tùy thời gian của mình có",
  "nhưng phải lễ Phật",
  "để cầu Phật gia hộ"
]
`;

  try {
    const rawRes = await callVilaoChatCompletion({
      model: AI_MODELS.SUBTITLE_FIX,
      serviceType: 'SUBTITLE',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    let jsonStr = rawRes.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
    }

    let parsed = JSON.parse(jsonStr);
    let lineStrings: string[] = [];

    if (Array.isArray(parsed)) {
      if (typeof parsed[0] === 'string') {
        lineStrings = parsed;
      } else if (typeof parsed[0] === 'object' && parsed[0].text) {
        lineStrings = parsed.map((item: any) => item.text);
      }
    } else if (parsed && Array.isArray(parsed.lines)) {
      lineStrings = parsed.lines.map((item: any) => typeof item === 'string' ? item : item.text);
    }

    if (lineStrings.length > 0) {
      return alignLinesWithTimestamps(lineStrings, rawWords);
    }

    return fallbackGrouping(rawWords);
  } catch (error) {
    console.error('[SubtitleFixer] Error polishing subtitles with LLM, fallbacking:', error);
    return fallbackGrouping(rawWords);
  }
}

/**
 * Thuật toán gom dòng phụ đề dự phòng (Fallback) khi không gọi được LLM
 */
function fallbackGrouping(rawWords: KaraokeWord[]): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  const WORDS_PER_LINE = 5;

  for (let i = 0; i < rawWords.length; i += WORDS_PER_LINE) {
    const chunk = rawWords.slice(i, i + WORDS_PER_LINE);
    if (chunk.length === 0) continue;

    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;
    const text = chunk.map((w) => w.word).join(' ');

    lines.push({
      id: `line_${Math.floor(i / WORDS_PER_LINE) + 1}`,
      start,
      end,
      text,
      words: chunk,
    });
  }

  return sanitizeSubtitleGrammar(lines);
}
