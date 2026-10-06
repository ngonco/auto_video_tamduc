import type { SubtitleLine } from '../remotion/types.js';

// Bộ viết hoa dùng chung cho STT, video nháp và video xuất, không phụ thuộc Node/API.
// Dùng cả cụm để tránh viết hoa nhầm "tăng giá", "kinh doanh", "pháp luật".
const BUDDHIST_PHRASES = [
  'Phật', 'Đức Phật', 'Chư Phật', 'Phật Đà', 'Phật Giáo', 'Phật Pháp',
  'Phật Tử', 'Phật Tánh', 'Phật Tính', 'Phật Quả', 'Phật Hiệu', 'Phật Học',
  'A La Hán', 'A La Hán Quả', 'Bồ Tát', 'Chư Bồ Tát', 'Bồ Tát Đạo',
  'Cao Tăng', 'Bậc Cao Tăng', 'Thánh', 'Bậc Thánh', 'Thần Thánh',
  'Bích Chi Phật', 'Duyên Giác', 'Độc Giác', 'Thanh Văn',
  'Thế Tôn', 'Như Lai', 'Bổn Sư', 'Bản Sư', 'Thích Ca', 'Thích Ca Mâu Ni',
  'A Di Đà', 'A Di Đà Phật', 'Di Lặc', 'Dược Sư', 'Dược Sư Lưu Ly Quang Vương Phật',
  'Quán Thế Âm', 'Quan Thế Âm', 'Quán Âm', 'Quan Âm', 'Địa Tạng',
  'Địa Tạng Vương', 'Văn Thù', 'Văn Thù Sư Lợi', 'Phổ Hiền', 'Đại Thế Chí',
  'Đại Hạnh Phổ Hiền', 'Đại Trí Văn Thù', 'Đại Bi Quán Thế Âm',
  'Đại Nguyện Địa Tạng', 'Nam Mô', 'Hộ Pháp', 'Thiện Thần', 'Chư Thiên',
  'Xá Lợi Phất', 'Mục Kiền Liên', 'A Nan', 'A Nan Đà', 'Ca Diếp',
  'Đại Ca Diếp', 'Tu Bồ Đề', 'La Hầu La', 'Ưu Ba Ly', 'A Nậu Lâu Đà',
  'Bồ Đề Đạt Ma', 'Huệ Năng', 'Huyền Trang',
  'Long Thiên Hộ Pháp', 'Thiên Long Bát Bộ', 'Đế Thích', 'Phạm Thiên',
  'Tam Bảo', 'Quy Y', 'Quy Y Tam Bảo', 'Tăng Đoàn', 'Chư Tăng', 'Tăng Ni',
  'Tỳ Kheo', 'Tỳ Kheo Ni', 'Tì Kheo', 'Tì Kheo Ni', 'Tỷ Kheo', 'Tỷ Kheo Ni',
  'Sa Di', 'Sa Di Ni', 'Ưu Bà Tắc', 'Ưu Bà Di', 'Hòa Thượng', 'Hoà Thượng',
  'Thượng Tọa', 'Đại Đức', 'Ni Trưởng', 'Ni Sư', 'Sư Cô', 'Thiền Sư',
  'Tổ Sư', 'Pháp Sư', 'Cư Sĩ', 'Đạo Tràng',
  'Tứ Diệu Đế', 'Tứ Thánh Đế', 'Khổ Đế', 'Tập Đế', 'Diệt Đế', 'Đạo Đế',
  'Bát Chánh Đạo', 'Bát Chính Đạo', 'Chánh Kiến', 'Chánh Tư Duy',
  'Chánh Ngữ', 'Chánh Nghiệp', 'Chánh Mạng', 'Chánh Tinh Tấn', 'Chánh Niệm',
  'Chánh Định', 'Chính Kiến', 'Chính Tư Duy', 'Chính Ngữ', 'Chính Nghiệp',
  'Chính Mạng', 'Chính Tinh Tấn', 'Chính Niệm', 'Chính Định',
  'Thập Nhị Nhân Duyên', 'Mười Hai Nhân Duyên', 'Duyên Khởi', 'Nhân Duyên',
  'Nhân Quả', 'Nghiệp Báo', 'Nghiệp Lực', 'Luân Hồi', 'Sinh Tử', 'Sanh Tử',
  'Vô Thường', 'Vô Ngã', 'Vô Minh', 'Ngũ Uẩn', 'Ngũ Ấm', 'Sắc Uẩn',
  'Thọ Uẩn', 'Tưởng Uẩn', 'Hành Uẩn', 'Thức Uẩn', 'Lục Căn', 'Lục Trần',
  'Lục Thức', 'Lục Đạo', 'Lục Đạo Luân Hồi', 'Tam Giới', 'Dục Giới',
  'Sắc Giới', 'Vô Sắc Giới', 'Tứ Đại', 'Thập Thiện', 'Ngũ Giới',
  'Bát Quan Trai', 'Bát Quan Trai Giới', 'Giới Định Tuệ', 'Tam Vô Lậu Học',
  'Tứ Niệm Xứ', 'Tứ Chánh Cần', 'Tứ Như Ý Túc', 'Ngũ Căn', 'Ngũ Lực',
  'Thất Giác Chi', 'Thất Bồ Đề Phần', 'Ba Mươi Bảy Phẩm Trợ Đạo',
  'Lục Độ', 'Lục Độ Ba La Mật', 'Ba La Mật', 'Ba La Mật Đa',
  'Tứ Vô Lượng Tâm', 'Từ Bi', 'Hỷ Xả', 'Trí Tuệ', 'Bát Nhã',
  'Bát Nhã Ba La Mật Đa', 'Bồ Đề', 'Tâm Bồ Đề', 'Bồ Đề Tâm',
  'Vô Thượng Bồ Đề', 'Vô Thượng Chánh Đẳng Chánh Giác', 'Chánh Pháp',
  'Chính Pháp', 'Mạt Pháp', 'Chân Như', 'Pháp Thân', 'Báo Thân', 'Ứng Thân',
  'Tam Thân', 'Niết Bàn', 'Đại Bát Niết Bàn', 'Giác Ngộ', 'Giải Thoát',
  'Tu Đà Hoàn', 'Tư Đà Hàm', 'A Na Hàm', 'Sơ Quả', 'Nhị Quả', 'Tam Quả',
  'Tứ Quả', 'Tịnh Độ', 'Tây Phương Cực Lạc', 'Cực Lạc', 'Ta Bà',
  'Tịnh Độ Tông', 'Thiền Tông', 'Mật Tông', 'Đại Thừa', 'Tiểu Thừa',
  'Nguyên Thủy', 'Nguyên Thuỷ', 'Nam Tông', 'Bắc Tông',
  'Công Đức', 'Phước Đức', 'Phúc Đức', 'Phước Báu', 'Phúc Báu', 'Hồi Hướng',
  'Cúng Dường', 'Bố Thí', 'Trì Giới', 'Nhẫn Nhục', 'Tinh Tấn', 'Thiền Định',
  'Thiền Quán', 'Niệm Phật', 'Tụng Kinh', 'Trì Chú', 'Sám Hối', 'Vãng Sinh',
  'Vãng Sanh', 'Gia Hộ', 'Phụng Sự', 'Trang Nghiêm',
  'Kinh Pháp Hoa', 'Kinh Diệu Pháp Liên Hoa', 'Kinh Kim Cang', 'Kinh Kim Cương',
  'Kinh A Di Đà', 'Kinh Vô Lượng Thọ', 'Kinh Quán Vô Lượng Thọ', 'Kinh Địa Tạng',
  'Kinh Địa Tạng Bồ Tát Bổn Nguyện', 'Kinh Dược Sư', 'Kinh Hoa Nghiêm',
  'Kinh Lăng Nghiêm', 'Kinh Lăng Già', 'Kinh Pháp Cú', 'Kinh A Hàm',
  'Kinh Bát Nhã', 'Kinh Bát Nhã Ba La Mật Đa', 'Bát Nhã Tâm Kinh',
  'Tâm Kinh', 'Kinh Đại Bát Niết Bàn', 'Kinh Vu Lan', 'Kinh Vu Lan Bồn',
  'Chú Đại Bi', 'Chú Lăng Nghiêm', 'Chú Vãng Sinh', 'Chú Vãng Sanh',
  'Vu Lan', 'Phật Đản', 'Tam Tạng', 'Kinh Tạng', 'Luật Tạng', 'Luận Tạng',
];

interface PhraseNode {
  children: Map<string, PhraseNode>;
  canonical?: string[];
}

const phraseRoot: PhraseNode = { children: new Map() };
const lookupKey = (word: string) => word.normalize('NFC').toLocaleLowerCase('vi');

for (const phrase of BUDDHIST_PHRASES) {
  const canonical = phrase.split(' ');
  let node = phraseRoot;
  for (const word of canonical) {
    const key = lookupKey(word);
    if (!node.children.has(key)) node.children.set(key, { children: new Map() });
    node = node.children.get(key)!;
  }
  node.canonical = canonical;
}

// Các fragment là từ karaoke hoặc text của dòng. Cho phép cụm chạy qua dòng,
// nhưng không chạy qua dấu câu; giữ nguyên dấu câu, khoảng trắng và dấu nối.
function capitalizeFragments(fragments: string[]): string[] {
  const tokens: { fragment: number; start: number; end: number; key: string; connects: boolean }[] = [];
  const replacements = fragments.map(() => new Map<number, { end: number; text: string }>());
  let gap = '';
  fragments.forEach((fragment, fragmentIndex) => {
    let cursor = 0;
    for (const match of fragment.matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
      const start = match.index!;
      gap += fragment.slice(cursor, start);
      tokens.push({
        fragment: fragmentIndex, start, end: start + match[0].length,
        key: lookupKey(match[0]), connects: /^[\s-]*$/u.test(gap),
      });
      cursor = start + match[0].length;
      gap = '';
    }
    gap += fragment.slice(cursor) + '\n';
  });

  for (let index = 0; index < tokens.length;) {
    let node = phraseRoot;
    let best: string[] | undefined;
    for (let next = index; next < tokens.length; next++) {
      if (next > index && !tokens[next].connects) break;
      const child = node.children.get(tokens[next].key);
      if (!child) break;
      node = child;
      if (node.canonical) best = node.canonical;
    }
    if (!best) { index++; continue; }
    best.forEach((word, offset) => {
      const token = tokens[index + offset];
      replacements[token.fragment].set(token.start, { end: token.end, text: word });
    });
    index += best.length;
  }

  return fragments.map((fragment, index) => {
    let cursor = 0;
    let result = '';
    for (const [start, replacement] of replacements[index]) {
      result += fragment.slice(cursor, start) + replacement.text;
      cursor = replacement.end;
    }
    return result + fragment.slice(cursor);
  });
}

/** Chỉ đổi chữ hoa/thường: không sửa nội dung, số từ, phân dòng hay timestamps. */
export function capitalizeBuddhistSubtitles(lines: SubtitleLine[]): SubtitleLine[] {
  const texts = capitalizeFragments(lines.map((line) => line.text));
  const words = capitalizeFragments(lines.flatMap((line) => (line.words ?? []).map((word) => word.word)));
  let wordIndex = 0;
  return lines.map((line, index) => ({
    ...line,
    text: texts[index],
    words: (line.words ?? []).map((word) => ({ ...word, word: words[wordIndex++] })),
  }));
}

/** Chuẩn bị mọi phụ đề để hiển thị, kể cả bản cũ/thủ công không có từ karaoke. */
export function prepareSubtitlesForDisplay(lines: SubtitleLine[]): SubtitleLine[] {
  const resolved = lines.map((line) => {
    if (line.words?.length) return line;
    const tokens = (line.text || '').trim().split(/\s+/).filter(Boolean);
    const wordDuration = Math.max(0.2, line.end - line.start) / Math.max(1, tokens.length);
    return {
      ...line,
      words: tokens.map((word, index) => ({
        word,
        start: Number((line.start + index * wordDuration).toFixed(2)),
        end: Number((line.start + (index + 1) * wordDuration).toFixed(2)),
      })),
    };
  });
  return capitalizeBuddhistSubtitles(resolved);
}
