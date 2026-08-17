# SYSTEM MAP & KIẾN TRÚC TOÀN DIỆN: AUTO VIDEO TÂM ĐỨC

> [!IMPORTANT]
> **QUY TẮC BẮT BUỘC DÀNH CHO AGENT / DEVELOPER (MANDATORY RULE)**:
> 1. **LUÔN ĐỌC FILE NÀY TRƯỚC KHI LÀM TÁC VỤ**: Để nắm toàn bộ kiến trúc, API Gateway, Model, DB Schema mà không làm sai lệch thiết kế.
> 2. **LUÔN CẬP NHẬT LẠI FILE NÀY KHI SỬA CODE**: Bất kỳ thay đổi nào về file, endpoint, model AI, cấu hình, logic hoặc database schema **BẮT BUỘC PHẢI ĐƯỢC CẬP NHẬT NGAY VÀO FILE NÀY** để đảm bảo đồng bộ tuyệt đối qua mọi phiên làm việc.

---

## 1. TỔNG QUAN HỆ THỐNG (SYSTEM OVERVIEW)

- **Tên dự án**: Auto Video Tâm Đức (`Auto_Video_TamDuc`)
- **Mục tiêu**: Tự động dựng video định dạng dọc **9:16** (1080x1920) cho chủ đề **Không Gian Thờ Phật / Bàn Thờ Phật** từ:
  1. File âm thanh Voice đọc tiếng Việt (phật pháp, đạo lý, tu tập, phước báu...).
  2. Thư mục Source lớn chứa các Folder con (mỗi folder con là 1 công trình thi công / bài trí bàn thờ Phật).
- **Output**: Video 9:16 hoàn chỉnh với Voice, phụ đề Karaoke tiếng Việt đổi màu từng từ theo thời gian thực (chuẩn mốc thời gian, không lỗi font), nhạc thiền BGM tự hạ âm (Audio Ducking), và Timeline tương tác trực quan cho phép xem trước, kéo thả đổi clip và sửa chữ phụ đề.

---

## 2. BẢN ĐỒ THÀNH PHẦN HỆ THỐNG (SYSTEM COMPONENT MAP)

```
=======================================================================================================
                                          AUTO VIDEO TÂM ĐỨC
=======================================================================================================
[ TẦNG GIAO DIỆN (React 18 + Vite + Remotion Player + Tailwind CSS) ]
  ├── 1. Thư Viện Source     (src/components/LibraryView/)      : Grid danh sách công trình, trạng thái nhúng
  ├── 2. Tạo Video Nhanh     (src/components/GeneratorView/)    : Wizard nạp Voice -> STT -> Sửa phụ đề -> Sinh timeline
  ├── 3. Trình Dựng Timeline (src/components/EditorView/)       : Preview 9:16 Remotion Player, Multi-track clips/subs
  └── 4. Cài Đặt Hệ Thống    (src/components/SettingsView/)     : Quản lý API Key, Base URL, thư mục Source & Exports
-------------------------------------------------------------------------------------------------------
[ TẦNG ENGINE & BACKEND (Node.js Express + SQLite + FFmpeg + OpenAI SDK) ]
  ├── Watcher Module         (server/watcher.ts)                : Chokidar theo dõi Folder Source (Chế độ Hybrid)
  ├── Frame Extractor        (server/services/ffmpeg.ts)        : Trích 2-3 frame JPEG 720p đại diện (SIÊU TIẾT KIỆM)
  ├── Vision Analyzer        (server/services/vision-analyzer.ts): Phân loại 4 giai đoạn bằng ts/gemini-3.1-flash-lite
  ├── STT Whisper Engine     (server/services/stt-service.ts)   : Nhận diện tiếng Việt bóc word timestamps
  ├── Subtitle Fixer LLM     (server/services/subtitle-fixer.ts): Chuẩn hóa từ ngữ Phật học & ngắt nhịp 9:16
  ├── Storyline Engine       (server/services/storyline-engine.ts): Phân bổ clip 4 giai đoạn theo thời lượng Voice
  └── Render Service         (server/services/render-service.ts): Render MP4 1080x1920 với phụ đề ASS Karaoke
-------------------------------------------------------------------------------------------------------
[ TẦNG LƯU TRỮ CỤC BỘ (Local Storage) ]
  ├── database/library.db    : SQLite Single-file (Bảng projects, video_sources, generated_videos, settings)
  ├── .cache/                : Cache frames trích xuất (.cache/frames), thumbnails, uploads, render temp
  ├── assets/fonts/          : Thư viện font tiếng Việt chuẩn (Be Vietnam Pro, Montserrat, Lexend)
  ├── assets/bgm/            : Kho nhạc thiền Phật giáo không lời
  ├── .env                   : VILAO_STT_KEY, VILAO_SUBTITLE_KEY, VILAO_EMBEDDING_KEY, VILAO_BASE_URL, ROOT_SOURCE_DIR, EXPORT_DIR
  └── config.json            : Cấu hình mặc định (font size, ducking volume, clip duration, stages ratio)
=======================================================================================================
```

---

## 3. CẤU HÌNH API VÀ MODEL (API GATEWAY & MODELS MAP)

Tất cả các dịch vụ AI kết nối qua API Gateway chuẩn OpenAI SDK (`https://api.vilao.ai/v1`) với **3 Token API độc lập**:
- **Base URL**: `https://api.vilao.ai/v1` (`VILAO_BASE_URL`)
- **Key 1 (STT)**: `VILAO_STT_KEY` (Token `VideoTamDuc_STT`)
- **Key 2 (Sửa Phụ Đề)**: `VILAO_SUBTITLE_KEY` (Token `VideoTamDuc_sửa phụ đề`)
- **Key 3 (EMBLED / Vision)**: `VILAO_EMBEDDING_KEY` (Token `VideoTamDuc_EMBLED`)

| Phân Hệ / Token | Biến Môi Trường | Endpoint | Model Sử Dụng | Nhiệm Vụ Cụ Thể |
| :--- | :--- | :--- | :--- | :--- |
| **STT (Voice to Text)** | `VILAO_STT_KEY` | `/audio/transcriptions` | `tsa/groq/whisper-large-v3` | Bóc tách giọng nói tiếng Việt siêu tốc, xuất word timestamps chi tiết từng từ cho Karaoke. |
| **Sửa Phụ Đề Phật Học** | `VILAO_SUBTITLE_KEY` | `/chat/completions` | `ts/gemini-3.1-flash-lite` | Chuẩn hóa chính tả Phật học (Tam Bảo, Bổn Sư, Quán Âm, trang nghiêm...), ngắt dòng 3-6 từ cho khung dọc 9:16. |
| **Phân Tích Cảnh (Vision)** | `VILAO_EMBEDDING_KEY` | `/chat/completions` | `ts/gemini-3.1-flash-lite` | Nhận diện 4 giai đoạn thi công bàn thờ từ 2 frame ảnh đại diện JPEG (KHÔNG GỬI VIDEO). |
| **Vector Embedding** | `VILAO_EMBEDDING_KEY` | `/embeddings` | `emb/text-embedding-3-large` | Nhúng vector mô tả cảnh khi cần tìm kiếm ngữ nghĩa. |

---

## 4. QUY TRÌNH 4 GIAI ĐOẠN (STORYLINE 4-STAGE ALLOCATION)

Mỗi clip được cắt ngắn **3.0s - 4.5s** và phân bổ theo tiến trình thời gian thi công bàn thờ:

```
Tổng thời lượng Video = Thời lượng Voice (T giây)

[GIAI ĐOẠN 1: THI CÔNG THÔ] (15% - 20% đầu)
- Tag: STAGE_1_RAW_CARPENTRY
- Nội dung: Thợ mộc làm gỗ, cắt xẻ, đánh nhám ráp, dựng khung tủ thờ thô.

[GIAI ĐOẠN 2: LẮP RÁP HOÀN THIỆN] (25% - 30% tiếp theo)
- Tag: STAGE_2_ASSEMBLY_FINISHING
- Nội dung: Lắp ráp tủ thờ vào không gian phòng thờ, gắn vách ngăn CNC, lau dọn.

[GIAI ĐOẠN 3: CẮM HOA & TRANG TRÍ] (25% - 30% tiếp theo)
- Tag: STAGE_3_DECOR_FLOWERS
- Nội dung: Cắm hoa sen, hoa huệ, bày biện lư hương đồng, mâm bồng, chỉnh trang tượng Phật.

[GIAI ĐOẠN 4: ĐÈN HÀO QUANG & LỄ PHẬT TRANG NGHIÊM] (25% - 30% cuối)
- Tag: STAGE_4_WORSHIP_ALTAR
- Nội dung: Bật đèn hào quang sáng rực, toàn cảnh không gian thờ thanh tịnh, chắp tay lễ Phật.

* Quy tắc Thích Ứng: Nếu folder chỉ có cảnh cắm hoa & lễ Phật (không có thợ làm tủ thô), hệ thống tự co giãn: 40% đầu là Cắm hoa/Trang trí -> 60% sau là Lễ Phật trang nghiêm.
* Quy tắc 9:16: Clip ngang 16:9 tự động làm mờ nền (Blurred Backdrop) + clip chính nét ở giữa, GIỮ NGUYÊN chuyển động gốc (không zoom/pan).
```

---

## 5. LƯỢC ĐỒ CƠ SỞ DỮ LIỆU SQLITE (`database/library.db`)

```sql
-- 1. Quản lý Folder Công trình
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    folder_name TEXT NOT NULL UNIQUE,
    folder_path TEXT NOT NULL,
    total_videos INTEGER DEFAULT 0,
    is_embedded INTEGER DEFAULT 0,
    stage_summary TEXT, -- JSON summary of stages
    last_scanned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Quản lý từng Clip Video
CREATE TABLE video_sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    duration REAL DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    aspect_ratio_type TEXT DEFAULT '9:16', -- '9:16', '16:9', 'other'
    stage TEXT DEFAULT 'STAGE_2_ASSEMBLY_FINISHING',
    aesthetic_score REAL DEFAULT 7.5,
    scene_description TEXT,
    thumbnail_path TEXT,
    is_analyzed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 3. Quản lý Video Đã Dựng & Timeline State
CREATE TABLE generated_videos (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    project_name TEXT,
    voice_path TEXT,
    voice_duration REAL DEFAULT 0,
    output_path TEXT,
-- 4. Bảng ghi nhớ danh sách Voice đã nạp (Lịch sử Voice)
CREATE TABLE voices (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    duration REAL DEFAULT 0,
    stt_text TEXT,
    raw_words_json TEXT,
    subtitles_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. DANH MỤC API ROUTES (BACKEND ENDPOINTS)

| Method | Endpoint | Mô Tả |
| :--- | :--- | :--- |
| `GET` | `/api/library/projects` | Lấy danh sách tất cả các công trình và tổng số video |
| `GET` | `/api/library/projects/:id/videos` | Lấy danh sách clip chi tiết của 1 công trình |
| `POST` | `/api/library/pick-and-import` | Mở hộp thoại chọn thư mục công trình Windows & tự động phân tích AI |
| `POST` | `/api/library/import-path` | Nhập thư mục công trình từ đường dẫn & tự động phân tích AI |
| `POST` | `/api/library/projects/:id/scan` | Kích hoạt quét và nhúng AI cho 1 công trình |
| `DELETE`| `/api/library/projects/:id` | Xóa 1 công trình và các video liên quan khỏi thư viện |
| `GET` | `/api/generator/voices` | Lấy danh sách voice đã nạp và lưu trong lịch sử SQLite |
| `POST` | `/api/generator/pick-voice` | Mở hộp thoại Windows chọn file Voice âm thanh (.mp3, .wav, .m4a) |
| `DELETE`| `/api/generator/voices/:id` | Xóa voice khỏi danh sách lịch sử |
| `POST` | `/api/generator/upload-voice` | Tải lên file Voice (.mp3, .wav, .m4a) qua web |
| `POST` | `/api/generator/process-voice` | Nhận diện STT Whisper + Gemini sửa phụ đề Phật học & tự động lưu lịch sử |
| `POST` | `/api/generator/assemble-storyline`| Tự động phân bổ clip 4 giai đoạn khớp thời lượng Voice |
| `GET` | `/api/generator/bgm-list` | Lấy danh sách nhạc thiền BGM |
| `POST` | `/api/render/start` | Bắt đầu Render video MP4 1080x1920 qua FFmpeg |
| `GET` | `/api/render/status/:jobId` | Lấy tiến độ % render (0 - 100%) |
| `POST` | `/api/render/open-folder` | Mở thư mục chứa video trên Windows Explorer |
| `GET` | `/api/settings` | Đọc cấu hình 3 API Key .env / config.json |
| `POST` | `/api/settings` | Lưu cấu hình 3 API Key .env / config.json |
| `POST` | `/api/settings/browse-folder` | Mở hộp thoại FolderBrowserDialog của Windows |
| `GET` | `/media/stream?path=...` | Stream video & audio hỗ trợ HTTP Range header cho Preview Player |

---

## 7. CẤU TRÚC THƯ MỤC MÃ NGUỒN (DIRECTORY TREE)

```
Auto_Video_TamDuc/
├── .env                        # Chứa VILAO_STT_KEY, VILAO_SUBTITLE_KEY, VILAO_EMBEDDING_KEY, VILAO_BASE_URL, ROOT_SOURCE_DIR, EXPORT_DIR
├── config.json                 # Cấu hình app (default font, ducking volume, clip duration)
├── package.json                # Dependencies React, Remotion, Express, SQLite, FFmpeg
├── vite.config.ts              # Proxy port 5173 -> backend 3001
├── tsconfig.json
├── Auto_Video_TamDuc.exe       # Launcher khởi động 1-click gắn Taskbar
├── system_map.md               # File này (Bản đồ hệ thống)
│
├── server/                     # Backend Express & Workers
│   ├── index.ts                # Server entry point (port 3001)
│   ├── db.ts                   # SQLite wrapper
│   ├── watcher.ts              # Chokidar watcher (Hybrid mode)
│   ├── routes/
│   │   ├── library.routes.ts   # Quản lý công trình & scan
│   │   ├── generator.routes.ts # STT, Sửa phụ đề, Sinh kịch bản
│   │   ├── render.routes.ts    # Render MP4 1080x1920
│   ├── utils/
│   │   └── picker.ps1          # Script mở hộp thoại chọn thư mục Windows hỗ trợ Quick Access & Pinned
│   └── services/
│       ├── api-client.ts       # OpenAI SDK trỏ https://api.vilao.ai/v1
│       ├── ffmpeg.ts           # Trích 2-3 frame JPEG, lấy metadata
│       ├── stt-service.ts      # tsa/groq/whisper-large-v3
│       ├── subtitle-fixer.ts   # ts/gemini-3.1-flash-lite
│       ├── vision-analyzer.ts  # Phân tích 4 giai đoạn bằng Gemini
│       ├── storyline-engine.ts # Thuật toán xếp clip 4 giai đoạn
│       └── render-service.ts   # FFmpeg render video & ASS karaoke
│
├── src/                        # Frontend React 18 + Remotion
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/index.css        # Giao diện tối, hiệu ứng Karaoke Phật giáo
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── LibraryView/        # Thư viện công trình
│   │   ├── GeneratorView/      # Wizard tạo video 1-Click
│   │   ├── EditorView/         # Trình dựng Timeline & Remotion Player 9:16
│   │   └── SettingsView/       # Cài đặt hệ thống
│   └── remotion/               # Composition Remotion 9:16
│       ├── Root.tsx
│       ├── MainVideo.tsx       # Master 1080x1920 30fps
│       ├── types.ts
│       └── layers/
│           ├── VideoLayer.tsx  # Render video clips + Blurred Backdrop
│           ├── KaraokeLayer.tsx# Phụ đề đổi màu vàng kim từng từ
│           └── AudioLayer.tsx  # Voice + BGM Ducking
│
├── assets/                     # Tài nguyên nội bộ
│   ├── fonts/                  # Fonts Be Vietnam Pro, Montserrat
│   └── bgm/                    # Nhạc thiền Phật giáo
├── sample_sources/             # Thư mục mẫu các công trình
└── exports/                    # Thư mục xuất video MP4
```

---

## 8. HƯỚNG DẪN KHỞI ĐỘNG NHANH CHO AGENT/DEVELOPER

1. **Khởi động Server & Frontend**:
   ```bash
   npm run dev
   ```
2. **Khởi động qua file `.exe`**:
   - Nhấp đúp vào `Auto_Video_TamDuc.exe` (hoặc ghim vào Taskbar Windows).
3. **Địa chỉ truy cập**:
   - Giao diện: `http://localhost:5173/`
   - Backend API: `http://localhost:3001/`
