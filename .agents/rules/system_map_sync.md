# Rule: Bắt Buộc Đọc và Cập Nhật system_map.md

## Áp dụng cho mọi Agent / Assistant:
1. **Trước khi thực hiện tác vụ / sửa code**:
   - Đọc nội dung file `system_map.md` ở thư mục gốc để nắm kiến trúc, stack, model AI, và schema.
2. **Sau khi thực hiện sửa code / thay đổi hệ thống**:
   - Bắt buộc kiểm tra và cập nhật lại file `system_map.md` nếu có bất kỳ thay đổi nào liên quan đến:
     - Cấu trúc thư mục / danh sách file mới.
     - Thay đổi model AI (`tsa/groq/whisper-large-v3`, `ts/gemini-3.1-flash-lite`, `emb/text-embedding-3-large`,...).
     - Thay đổi API endpoint hoặc luồng xử lý.
     - Thay đổi cấu trúc bảng trong SQLite `library.db`.
     - Thay đổi tham số mặc định trong `config.json` hoặc `.env`.
