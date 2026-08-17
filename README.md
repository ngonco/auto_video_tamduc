# Auto Video Tâm Đức 🪷

> **Hệ Thống Tự Động Dựng Video 9:16 (TikTok/Reels/Shorts) Cho Không Gian Thờ Phật & Bàn Thờ Phật**

---

## 🌟 Tính Năng Nổi Bật

1. **Nhận diện giọng nói STT tiếng Việt**: Tích hợp model `tsa/groq/whisper-large-v3` bóc tách từng từ với mốc thời gian (word timestamps) chính xác tuyệt đối.
2. **Chuẩn hóa phụ đề Phật học & Ngữ pháp 2 lớp**:
   - Model `ts/gemini-3.1-flash-lite` sửa chính tả từ ngữ chuyên ngành (Tam Bảo, Bổn Sư, Thích Ca, Quán Thế Âm, trang nghiêm, thanh tịnh...).
   - Bộ lọc Rule-based hậu kỳ chuẩn hóa chữ hoa/chữ thường: chỉ viết hoa chữ đầu câu và danh từ tôn kính, toàn bộ câu nối tiếp viết thường, không dấu câu cuối dòng giúp video 9:16 thoáng mắt.
3. **Phân loại 4 giai đoạn tiến trình bàn thờ**:
   - Giai đoạn 1: Thi công thô (`STAGE_1_RAW_CARPENTRY`).
   - Giai đoạn 2: Lắp ráp hoàn thiện tủ (`STAGE_2_ASSEMBLY_FINISHING`).
   - Giai đoạn 3: Cắm hoa & trang trí (`STAGE_3_DECOR_FLOWERS`).
   - Giai đoạn 4: Đèn hào quang & lễ Phật trang nghiêm (`STAGE_4_WORSHIP_ALTAR`).
4. **Ghi nhớ lịch sử Voice đã nạp**: Tự động lưu cache SQLite cục bộ, nạp lại tức thì trong 0.01s mà không tốn chi phí gọi lại AI.
5. **Trình phát & Dựng Timeline tương tác Remotion Player 9:16**:
   - Xem trước trực tiếp độ nét cao 1080x1920 30fps.
   - Phụ đề Karaoke đổi màu chữ vàng kim từng từ theo nhịp đọc.
   - Hòa âm Voice & Nhạc thiền BGM tự động hạ âm (Audio Ducking).
   - Đổi thứ tự clip và sửa trực tiếp chữ phụ đề.
6. **Khởi động 1-Click & Sao Lưu Dễ Dàng**: Hỗ trợ file `.exe` ghim Taskbar và file `backup.bat` sao lưu lên GitHub chỉ với 1 cú click.

---

## 🚀 Cài Đặt & Khởi Động

### Yêu cầu:
- Node.js >= 18
- FFmpeg đã cài đặt trên máy

### Các bước cài đặt:
```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Cấu hình biến môi trường trong file .env (sao chép từ .env.example)
cp .env.example .env

# 3. Khởi động ứng dụng (chạy đồng thời Frontend & Backend)
npm run dev
```

Truy cập giao diện: `http://localhost:5173/`

---

## 💾 Hướng Dẫn Sao Lưu Lên GitHub (1-Click Backup)

Bạn có thể dùng 1 trong 3 cách sau:
1. **Cách 1 (Nhanh nhất)**: Nhấp đúp chuột vào file `backup.bat` tại thư mục gốc.
2. **Cách 2**: Chạy lệnh `npm run backup` trong terminal.
3. **Cách 3**: Chạy script PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ./backup.ps1 "Nội dung ghi chú commit"
   ```

---

## 🗺️ Kiến Trúc Hệ Thống

Chi tiết toàn bộ kiến trúc, API Gateway, model và database schema xem tại [system_map.md](system_map.md).
