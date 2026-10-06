import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Internals } from 'remotion';
import { capitalizeBuddhistSubtitles, prepareSubtitlesForDisplay } from '../src/shared/buddhist-capitalization.js';
import { segmentAndPolishSubtitles } from '../server/services/subtitle-fixer.js';
import type { SubtitleLine } from '../server/services/subtitle-fixer.js';
import { generateAssKaraokeSubtitleFile } from '../server/services/render-service.js';
import { KaraokeLayer } from '../src/remotion/layers/KaraokeLayer.js';

function linesFrom(...texts: string[]): SubtitleLine[] {
  let offset = 0;
  return texts.map((text, index) => {
    const words = text.split(' ').map((word) => {
      const start = offset;
      offset += 0.25;
      return { word, start, end: offset };
    });
    return { id: `line_${index}`, start: words[0].start, end: offset, text, words };
  });
}

function check(input: string, expected: string) {
  const [result] = capitalizeBuddhistSubtitles(linesFrom(input));
  assert.equal(result.text, expected);
  assert.equal(result.words.map((word) => word.word).join(' '), expected);
}

// Render component thật trong context Remotion, không cần browser, voice hay API.
function previewMarkup(subtitles: SubtitleLine[], frame = 6, allCaps = false) {
  return renderToStaticMarkup(React.createElement(Internals.CanUseRemotionHooksProvider, null,
    React.createElement(Internals.CompositionManager.Provider, { value: {
      compositions: [{ id: 'subtitle-test', component: KaraokeLayer, width: 1080,
        height: 1920, fps: 30, durationInFrames: 300, defaultProps: {}, nonce: 'test' }],
      folders: [], currentCompositionMetadata: null,
      canvasContent: { type: 'composition', compositionId: 'subtitle-test' },
    } }, React.createElement(Internals.TimelineContext.Provider, { value: {
      frame: { 'subtitle-test': frame }, playing: false, imperativePlaying: { current: false },
      rootId: 'subtitle-test',
    } }, React.createElement(KaraokeLayer, { subtitles, allCaps })))));
}

function previewWords(markup: string): string[] {
  return [...markup.matchAll(/<span\b[^>]*>(.*?)<\/span>/gs)].map((match) => match[1]);
}

function assContent(subtitles: SubtitleLine[], allCaps = false): string {
  const testDir = fs.mkdtempSync(path.resolve('.cache', 'subtitle-test-'));
  const assPath = path.join(testDir, 'subtitles.ass');
  try {
    generateAssKaraokeSubtitleFile(subtitles, assPath, 'Lexend', 'bold', allCaps);
    return fs.readFileSync(assPath, 'utf8');
  } finally {
    if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
    fs.rmdirSync(testDir);
  }
}

function assTexts(content: string): string[] {
  return content.split('\n').filter((line) => line.startsWith('Dialogue:'))
    .map((line) => line.split(',').slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' '));
}

test('viết hoa danh hiệu, tên Phật và Bồ Tát nhiều từ', () => {
  check('đức phật, a la hán, bồ tát quán thế âm và thích ca mâu ni.',
    'Đức Phật, A La Hán, Bồ Tát Quán Thế Âm và Thích Ca Mâu Ni.');
});

test('viết hoa cả giáo lý và thuật ngữ theo quy ước được chọn', () => {
  check('học tứ diệu đế, bát chánh đạo, nhân quả, luân hồi, công đức và niết bàn.',
    'học Tứ Diệu Đế, Bát Chánh Đạo, Nhân Quả, Luân Hồi, Công Đức và Niết Bàn.');
});

test('ưu tiên cụm dài nhất và tên kinh, chú', () => {
  check('kinh địa tạng bồ tát bổn nguyện và bát nhã ba la mật đa, chú đại bi.',
    'Kinh Địa Tạng Bồ Tát Bổn Nguyện và Bát Nhã Ba La Mật Đa, Chú Đại Bi.');
});

test('cụm danh hiệu chạy qua nhiều dòng phụ đề', () => {
  const result = capitalizeBuddhistSubtitles(linesFrom('kính lễ a', 'la', 'hán và bồ', 'tát'));
  assert.deepEqual(result.map((line) => line.text), ['kính lễ A', 'La', 'Hán và Bồ', 'Tát']);
  assert.deepEqual(result.map((line) => line.words.map((word) => word.word).join(' ')),
    result.map((line) => line.text));
});

test('giữ nguyên ID, mốc thời gian, số từ và dữ liệu đầu vào', () => {
  const original = linesFrom('a la hán', 'bát chánh đạo');
  const snapshot = structuredClone(original);
  const result = capitalizeBuddhistSubtitles(original);
  assert.deepEqual(original, snapshot);
  assert.notEqual(result[0], original[0]);
  assert.notEqual(result[0].words[0], original[0].words[0]);
  const timing = (lines: SubtitleLine[]) => lines.map(({ id, start, end, words }) => ({
    id, start, end, words: words.map(({ start, end }) => ({ start, end })),
  }));
  assert.deepEqual(timing(result), timing(original));
});

test('không viết hoa từ thường hay một phần của từ', () => {
  check('tăng giá và kinh doanh, pháp luật, la bàn, hán tự, phậtson, siêuphật.',
    'tăng giá và kinh doanh, pháp luật, la bàn, hán tự, phậtson, siêuphật.');
});

test('không ghép thuật ngữ qua dấu ngắt câu hoặc con số', () => {
  check('a. la hán; bồ, tát; tam 2 bảo; công / đức.',
    'a. la hán; bồ, tát; tam 2 bảo; công / đức.');
  const result = capitalizeBuddhistSubtitles(linesFrom('a.', 'la hán'));
  assert.deepEqual(result.map((line) => line.text), ['a.', 'la hán']);
});

test('giữ nguyên dấu câu, dấu nối, dấu ngoặc và khoảng trắng', () => {
  check('“a-la-hán”  (bồ tát),\tniết bàn!', '“A-La-Hán”  (Bồ Tát),\tNiết Bàn!');
});

test('hỗ trợ chữ hoa sẵn có và Unicode tiếng Việt dạng tổ hợp', () => {
  check('A LA HÁN và BỒ TÁT', 'A La Hán và Bồ Tát');
  // Từ thường giữ nguyên biểu diễn Unicode; chỉ cụm được nhận diện dùng cách viết chuẩn.
  check('đức phật và tứ diệu đế'.normalize('NFD'), `Đức Phật ${'và'.normalize('NFD')} Tứ Diệu Đế`);
});

test('hỗ trợ một mục karaoke chứa cả cụm', () => {
  const input: SubtitleLine[] = [{ id: 'one', start: 1, end: 3,
    text: 'a la hán và niết bàn',
    words: [{ word: 'a la hán', start: 1, end: 2 }, { word: 'và niết bàn', start: 2, end: 3 }],
  }];
  const [result] = capitalizeBuddhistSubtitles(input);
  assert.equal(result.text, 'A La Hán và Niết Bàn');
  assert.deepEqual(result.words, [
    { word: 'A La Hán', start: 1, end: 2 }, { word: 'và Niết Bàn', start: 2, end: 3 },
  ]);
});

test('không đổi kết quả khi chạy lại và xử lý được phụ đề rỗng', () => {
  const once = capitalizeBuddhistSubtitles(linesFrom('nam mô a di đà phật'));
  assert.deepEqual(capitalizeBuddhistSubtitles(once), once);
  assert.deepEqual(capitalizeBuddhistSubtitles([]), []);
  assert.deepEqual(capitalizeBuddhistSubtitles([{ id: 'empty', start: 0, end: 1, text: '', words: [] }]),
    [{ id: 'empty', start: 0, end: 1, text: '', words: [] }]);
});

test('áp dụng sau phân dòng STT và không thay đổi hành vi của bộ phân dòng dùng chung', () => {
  const raw = linesFrom('kính lễ a la hán và bồ tát quán thế âm')[0].words;
  const segmented = segmentAndPolishSubtitles(raw);
  const snapshot = structuredClone(segmented);
  const result = capitalizeBuddhistSubtitles(segmented);
  const allWords = result.flatMap((line) => line.words.map((word) => word.word)).join(' ');
  assert.match(allWords, /A La Hán và Bồ Tát Quán Thế Âm/);
  assert.deepEqual(segmented, snapshot);
  assert.deepEqual(segmentAndPolishSubtitles(raw), snapshot);
});

test('bổ sung Cao Tăng, Bậc Cao Tăng, Thần Thánh, Bậc Thánh và Thánh riêng', () => {
  check('cao tăng, bậc cao tăng, thần thánh, bậc thánh và thánh.',
    'Cao Tăng, Bậc Cao Tăng, Thần Thánh, Bậc Thánh và Thánh.');
  check('thánhtâm và tăng giá', 'thánhtâm và tăng giá');
});

test('chuẩn bị hiển thị mọi phụ đề cũ/thủ công mà không sửa dữ liệu gốc', () => {
  const input = linesFrom('bậc cao tăng và thần thánh');
  const original = structuredClone(input);
  const [display] = prepareSubtitlesForDisplay(input);
  assert.equal(display.text, 'Bậc Cao Tăng và Thần Thánh');
  assert.equal(display.words.map((word) => word.word).join(' '), display.text);
  assert.deepEqual(display.words.map(({ start, end }) => ({ start, end })),
    original[0].words.map(({ start, end }) => ({ start, end })));
  assert.deepEqual(input, original);
});

test('nội suy thống nhất cho phụ đề nhập thủ công không có words', () => {
  const input = [{ id: 'manual', start: 1, end: 3, text: 'bậc thánh', words: [] }];
  const [display] = prepareSubtitlesForDisplay(input);
  assert.deepEqual(display.words, [
    { word: 'Bậc', start: 1, end: 2 }, { word: 'Thánh', start: 2, end: 3 },
  ]);
  // Các dự án cũ có thể thiếu hẳn thuộc tính words khi đọc JSON.
  const legacy = [{ id: 'legacy', start: 1, end: 3, text: 'thần thánh' }] as SubtitleLine[];
  assert.deepEqual(prepareSubtitlesForDisplay(legacy)[0].words, [
    { word: 'Thần', start: 1, end: 2 }, { word: 'Thánh', start: 2, end: 3 },
  ]);
  assert.equal(input[0].words.length, 0);
  assert.equal('words' in legacy[0], false);
});

test('cụm qua dòng hoạt động với cả words có sẵn và dòng thủ công', () => {
  const input = linesFrom('bậc cao', 'tăng và thần', 'thánh');
  input[1].words = [];
  const display = prepareSubtitlesForDisplay(input);
  assert.deepEqual(display.map((line) => line.text), ['Bậc Cao', 'Tăng và Thần', 'Thánh']);
  assert.deepEqual(display.map((line) => line.words.map((word) => word.word).join(' ')),
    display.map((line) => line.text));
});

test('video nháp thật viết hoa bản cũ và cập nhật sau chỉnh sửa thủ công', () => {
  const input = linesFrom('bậc cao tăng');
  const snapshot = structuredClone(input);
  assert.deepEqual(previewWords(previewMarkup(input)), ['Bậc', 'Cao', 'Tăng']);
  assert.deepEqual(input, snapshot);
  const edited = [{ ...input[0], text: 'thần thánh và thánh', words: [] }];
  assert.deepEqual(previewWords(previewMarkup(edited)), ['Thần', 'Thánh', 'và', 'Thánh']);
});

test('video nháp nhận diện cụm trước khi chọn dòng đang phát', () => {
  const input = linesFrom('bậc cao', 'tăng và thần', 'thánh');
  assert.deepEqual(previewWords(previewMarkup(input, 6)), ['Bậc', 'Cao']);
  assert.deepEqual(previewWords(previewMarkup(input, 22)), ['Tăng', 'và', 'Thần']);
  assert.deepEqual(previewWords(previewMarkup(input, 42)), ['Thánh']);
  assert.equal(previewMarkup(input, 90), '');
});

test('ASS và video nháp hiển thị cùng chữ hoa, bảo toàn tags karaoke', () => {
  const input = linesFrom('bậc cao tăng', 'thần thánh và thánh');
  input[1].words = [];
  const snapshot = structuredClone(input);
  const content = assContent(input);
  assert.deepEqual(assTexts(content), ['Bậc Cao Tăng', 'Thần Thánh và Thánh']);
  assert.equal(assTexts(content)[0], previewWords(previewMarkup(input, 6)).join(' '));
  assert.equal(assTexts(content)[1], previewWords(previewMarkup(input, 30)).join(' '));
  assert.match(content, /\{\\kf25\}Bậc \{\\kf25\}Cao \{\\kf25\}Tăng/);
  assert.deepEqual(input, snapshot);
});

test('bật allCaps vẫn viết hoa toàn bộ ở cả preview và ASS', () => {
  const input = linesFrom('bậc cao tăng');
  assert.match(previewMarkup(input, 6, true), /text-transform:uppercase/);
  assert.match(previewMarkup(input, 6, false), /text-transform:none/);
  assert.deepEqual(assTexts(assContent(input, true)), ['BẬC CAO TĂNG']);
  assert.deepEqual(assTexts(assContent(input, false)), ['Bậc Cao Tăng']);
});

test('phụ đề rỗng an toàn ở bộ chuẩn bị, preview và ASS', () => {
  const input = [{ id: 'empty', start: 0, end: 1, text: '', words: [] }];
  assert.deepEqual(prepareSubtitlesForDisplay([]), []);
  assert.equal(previewMarkup([]), '');
  assert.equal(previewMarkup(input), '');
  assert.deepEqual(assTexts(assContent([])), []);
});
