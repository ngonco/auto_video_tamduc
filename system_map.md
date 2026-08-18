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
  2. Thư mục Source chứa các Folder công trình bao gồm cả **Video** (.mp4, .mov, .mkv, .avi, .webm) và **Ảnh** (.jpg, .jpeg, .png, .webp, .bmp).
- **Output**: Video 9:16 hoàn chỉnh với:
  - Voice + Nhạc thiền BGM tự động hạ âm (Audio Ducking) và **tự động Fade-out khi chuyển sang Outro**.
  - Phụ đề Karaoke tiếng Việt đổi màu vàng kim từng từ theo thời gian thực (chuẩn mốc thời gian, không lỗi font), giới hạn trong phạm vi Voice đọc để không đè lên Outro.
  - **Video Outro Cố Định Cuối Video (Giữ 100% Âm Thanh Gốc)**: Cấu hình file Outro mặc định trong Cài Đặt Hệ Thống, hiển thị trực quan ở cuối Video track trên Timeline, cho phép Bật/Tắt và đổi file linh hoạt; âm thanh Outro nguyên bản vang to rõ ràng.
  - **Hiệu ứng chuyển cảnh Cross Dissolve (0.5s)** hòa tan mượt mà giữa các clip và giữa clip cuối với Outro.
  - **Hiệu ứng Zoom nhẹ (Ken Burns scale 1.0x -> 1.10x)** tạo chuyển động sống động cho media là ảnh tĩnh.
  - **Quy chuẩn thời lượng Clip 4.0s - 5.5s**: Mọi video nguồn dài tự động được cắt thành các đoạn ngắn 4-6s với góc quay tịnh tiến; khi xóa clip trên timeline hệ thống tự bù footage giữ nhịp điệu hoàn hảo.
  - **Timeline tương tác trực quan Remotion Player**:
    + **Phím tắt Spacebar Dừng/Phát**: Nhấn phím `Space` tại Timeline/Player để dừng/phát nhanh (tự động bỏ qua khi đang gõ text/phụ đề) kèm nút Play/Pause trên thanh công cụ.
    + **Chọn Clip & Đổi Nguồn Trực Tiếp (1-Click Replace)**: Chọn bất kỳ clip nào trên timeline để đổi video/ảnh mới từ **Windows Explorer** hoặc từ **Thư viện công trình**, bảo toàn 100% thời lượng slot và vị trí trên timeline.
    + **Quản lý Khối Outro Cuối Video**: Khối Outro màu tím nổi bật với nhãn `🔊 Gốc`, có nút đổi file trực tiếp trên timeline và nút Bật/Tắt Outro nhanh trên thanh công cụ.
    + Nút **Fit Toàn Bộ (1-Click Zoom-to-Fit)**: Tự động đo chiều rộng màn hình và thu phóng vừa khít 100% timeline (dải zoom 0.05x -> 6.0x), xem trọn vẹn video từ 30s đến 5 phút mà không cần cuộn ngang.
    + Thước đo Ruler thông minh: Tự động giãn cách vạch thời gian (0.5s, 1s, 5s, 10s, 15s, 30s) tùy mức zoom.
    + Nút **Cắt Chuẩn 4-6s**: Tự động cân bằng và phân bổ lại toàn bộ clip về dải vàng 4.0s - 5.5s.
    + Drag-and-drop kéo thả đổi vị trí clip siêu nhạy (@dnd-kit MouseSensor + DragOverlay), Pan (Shift+Drag / middle click), Playhead đỏ đồng bộ Player, Click ruler seek.

## 2. BẢN ĐỒ THÀNH PHẦN HỆ THỐNG (SYSTEM COMPONENT MAP)

```
=======================================================================================================
                                          AUTO VIDEO TÂM ĐỨC
=======================================================================================================
[ TẦNG GIAO DIỆN (React 18 + Vite + Remotion Player + Tailwind CSS) ]
  ├── 1. Thư Viện Source     (src/components/LibraryView/)      : Grid danh sách công trình, trạng thái nhúng
  ├── 2. Tạo Video Nhanh     (src/components/GeneratorView/)    : Wizard nạp Voice -> STT -> Sửa phụ đề -> Sinh timeline
  ├── 3. Trình Dựng Timeline (src/components/EditorView/)       : Preview 9:16 Remotion Player, Multi-track clips/subs
  └── 4. Cài Đặt Hệ Thống    (src/components/SettingsView/)     : Quản lý API Key, Base URL, thư mục Source & Exports, Outro
-------------------------------------------------------------------------------------------------------
[ TẦNG ENGINE & BACKEND (Node.js Express + SQLite + FFmpeg + OpenAI SDK) ]
  ├── Watcher Module         (server/watcher.ts)                : Chokidar theo dõi Folder Source (Video + Ảnh)
  ├── Frame Extractor        (server/services/ffmpeg.ts)        : Trích frame JPEG 720p / thumbnail từ video và ảnh
  ├── Vision Analyzer        (server/services/vision-analyzer.ts): Phân loại 4 giai đoạn bằng ts/gemini-3.1-flash-lite
  ├── STT Whisper Engine     (server/services/stt-service.ts)   : Nhận diện tiếng Việt bóc word timestamps (response.words + seg.words)
  ├── Subtitle Sync Engine   (server/services/subtitle-fixer.ts): Phân đoạn phụ đề 9:16 bảo toàn 100% từ ngữ & mốc thời gian Voice, chuẩn hóa danh xưng Phật học & ngữ pháp tiếng Việt
  ├── Storyline Engine       (server/services/storyline-engine.ts): Phân bổ clip/ảnh 4 giai đoạn theo thời lượng Voice
  └── Render Service         (server/services/render-service.ts): Render MP4 1080x1920 (Cross Dissolve + Image Zoom + ASS Karaoke + Outro)
-------------------------------------------------------------------------------------------------------
[ TẦNG TIỆN ÍCH WINDOWS & NATIVE DIALOGS (PowerShell STA) ]
  ├── server/utils/picker.ps1         : Hộp thoại chọn Thư Mục Windows (Folder Browser Dialog)
  ├── server/utils/audio-picker.ps1   : Hộp thoại chọn File Âm Thanh Voice (.mp3, .wav, .m4a...)
  ├── server/utils/media-picker.ps1   : Hộp thoại chọn File Video hoặc Ảnh (.mp4, .mov, .jpg, .png...)
  └── server/utils/video-picker.ps1   : Hộp thoại chọn File Video Outro (.mp4, .mov, .mkv, .avi, .webm)
-------------------------------------------------------------------------------------------------------
[ TẦNG LƯU TRỮ CỤC BỘ (Local Storage) ]
  ├── database/library.db    : SQLite Single-file (Bảng projects, video_sources, generated_videos, settings, voices)
  ├── .cache/                : Cache frames trích xuất (.cache/frames), thumbnails, uploads, render temp
  ├── assets/fonts/          : Thư viện font tiếng Việt chuẩn (Be Vietnam Pro, Montserrat, Lexend)
  ├── assets/bgm/            : Kho nhạc thiền Phật giáo không lời
  ├── .env                   : VILAO_STT_KEY, VILAO_SUBTITLE_KEY, VILAO_EMBEDDING_KEY, VILAO_BASE_URL, ROOT_SOURCE_DIR, EXPORT_DIR
  └── config.json            : Cấu hình mặc định (font size, ducking volume, clip duration, defaultOutroPath, outroEnabled)
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

## 4. QUY TRÌNH 4 GIAI ĐOẠN & ĐỒNG BỘ VIDEO - VOICE (STORYLINE & VISUAL EFFECTS)

Mỗi clip được cắt ngắn **4.0s - 5.5s** và phân bổ tịnh tiến theo tỷ lệ phần trăm thời gian của Voice đọc:

```
Tổng thời lượng Video = Thời lượng Voice chính xác (T giây từ ffprobe) + Thời lượng Outro (nếu bật)

[GIAI ĐOẠN 1: THI CÔNG THÔ] (0% - 20% đầu video)
- Tag: STAGE_1_RAW_CARPENTRY
- Nội dung: Thợ mộc làm gỗ, cắt xẻ, đánh nhám ráp, dựng khung tủ thờ thô.

[GIAI ĐOẠN 2: LẮP RÁP HOÀN THIỆN] (20% - 50% tiếp theo)
- Tag: STAGE_2_ASSEMBLY_FINISHING
- Nội dung: Lắp ráp tủ thờ vào không gian phòng thờ, gắn vách ngăn CNC, lau dọn.

[GIAI ĐOẠN 3: CẮM HOA & TRANG TRÍ] (50% - 75% tiếp theo)
- Tag: STAGE_3_DECOR_FLOWERS
- Nội dung: Cắm hoa sen, hoa huệ, bày biện lư hương đồng, mâm bồng, chỉnh trang tượng Phật.

[GIAI ĐOẠN 4: ĐÈN HÀO QUANG & LỄ PHẬT TRANG NGHIÊM] (75% - 100% kết thúc)
- Tag: STAGE_4_WORSHIP_ALTAR
- Nội dung: Bật đèn hào quang sáng rực, toàn cảnh không gian thờ thanh tịnh, chắp tay lễ Phật.

* Quy Tắc Đồng Bộ Thời Gian & Tránh Lệch / Thiếu Video & Phụ Đề So Với Voice:
  1. Thời lượng Voice: Luôn đo đạc bằng ffprobe (VideoMetadata) để lấy chính xác 100% độ dài audio, không bị cụt đuôi do khoảng lặng cuối câu.
  2. Phân đoạn Phụ đề & Đồng Bộ Karaoke (Subtitle Sync Engine):
     - Phân dòng trực tiếp từ chuỗi KaraokeWord[] của Whisper, bảo toàn 100% từ ngữ gốc, mốc thời gian start-end của từng từ. Ngắt dòng thông minh 3-6 từ theo khoảng lặng âm thanh (>= 0.3s) cho khung dọc 9:16.
     - Đồng bộ 100% giữa Preview & Video xuất ra (FFmpeg ASS):
       + Chữ hiển thị: Viết IN HOA toàn bộ (UPPERCASE), trang nghiêm, dễ đọc.
       + Hiệu ứng Karaoke: Chữ chưa đọc màu Trắng (#FFFFFF / &H00FFFFFF), khi giọng đọc tới đâu đổi sang màu Vàng Kim (#FFD700 / &H0000D7FF) tới đó kèm viền đen 3.5px và đổ bóng sắc nét.
       + Font chữ chuẩn: Sử dụng bộ font Be Vietnam Pro (tích hợp trong assets/fonts/ và nạp vào FFmpeg qua tham số fontsdir).
       + Vị trí & Kích thước: Căn lề đáy 22% (~420px từ đáy 1080x1920), cỡ chữ 50px chuẩn safe zone 9:16.
       + Xử lý khoảng lặng: Tự động chèn thẻ {\k<gap>} trong file ASS để khớp tuyệt đối từng nhịp ngắt nghỉ của giọng Voice.
  3. Chuẩn hóa Danh xưng Phật giáo: Tự động viết hoa các danh từ tôn kính (Phật, Đức Phật, Tam Bảo, Bồ Tát, Thế Tôn, Như Lai, Bổn Sư, Thích Ca, Quán Thế Âm, A Di Đà, Chư Phật, Gia Hộ, Cúng Dường, Phụng Sự...) và giữ chữ thường cho các liên từ nối.
  4. Storyline & Clip Duration Engine (Chuẩn 4.0s - 5.5s):
     - Mọi video nguồn dài (30s, 60s,...) khi nạp vào timeline đều được tự động bóc tách thành các phân đoạn 4.0s - 5.5s.
     - Thuật toán tịnh tiến `sourceStart` lấy các góc quay mới liên tục trong video gốc, không bị lặp hình.
     - Trên Timeline Editor: Khi xóa clip, hệ thống kích hoạt `rebalanceTimelineClips` tự bù clip từ nguồn công trình để giữ thời lượng mọi clip luôn là 4-6s (kèm nút 1-click "Cắt Chuẩn 4-6s").
  5. Remotion Player Preview: Sử dụng thẻ <Video> chuẩn Remotion với giải mã phần cứng GPU (Hardware Acceleration) kết hợp <Sequence> độc lập cho từng clip kèm startFrom={clip.sourceStart * fps} để preview siêu mượt 60fps, loại bỏ hoàn toàn tình trạng giựt hình do Canvas seek.
  6. Timeline Zoom & Fit Engine: Dải Zoom mở rộng 0.05x -> 6.0x, nút "Fit Toàn Bộ" tính toán chính xác tỷ lệ màn hình để hiển thị trọn vẹn toàn bộ timeline mà không bị thanh cuộn ngang, thẻ clip co giãn mượt mà.
  7. FFmpeg Render: Kích hoạt -stream_loop -1 cho video clips ngắn để không bị hụt khung hình; thêm tpad=stop_mode=clone để giữ khung hình cuối trang nghiêm đến khi dứt tiếng.
  8. Hiệu ứng Chuyển cảnh (Cross Dissolve): 0.5s hòa tan mượt mà giữa các clip liền kề.
  9. Media Ảnh tĩnh: Zoom nhẹ Ken Burns từ tâm (scale 1.0x -> 1.10x).
  10. Định dạng chuẩn 9:16 (Scale Crop / Object-fit Cover): Toàn bộ media (ảnh/video) tự động phóng to cắt vừa khít toàn màn hình dọc 9:16, loại bỏ cơ chế nền mờ kép giúp giảm tải và video đồng nhất, trang nghiêm.
  11. Tắt tuyệt đối âm thanh gốc của footage công trình (Mute 100%): Cả Remotion Preview (volume=0, muted, pauseWhenBuffering) và FFmpeg Engine (.noAudio()) chỉ phát duy nhất Voice đọc tiếng Việt (hoặc kèm BGM do người dùng chủ động chọn).
  12. Tối ưu Luồng Âm Thanh Preview & Bảo toàn Buffer (Audio Stabilization):
       - Memoized `compositionProps` qua `useMemo` và bọc `AudioLayer` qua `React.memo` để tránh việc re-render TimelineEditor tạo mới object props liên tục gây giựt / lặp âm thanh.
       - Thêm thuộc tính `pauseWhenBuffering` và định danh `key` cố định cho từng track `<Audio>` giúp trình duyệt đồng bộ buffer âm thanh mượt mà 100%.
  13. Hòa âm BGM & Bảo toàn âm lượng Voice:
       - Mặc định BGM luôn tắt ('-- Không dùng nhạc nền --') để đảm bảo Voice đọc trong trẻo, không bị chèn tiếng ồn đơn âm.
       - Thư mục assets/bgm/ để trống sẵn sàng cho người dùng tự bỏ các file nhạc thiền MP3/WAV yêu thích.
       - Khi bật BGM: Sử dụng '-stream_loop -1' để lặp vô tận và bộ lọc FFmpeg 'amix=inputs=2:duration=first:dropout_transition=0:normalize=0' giúp bảo toàn 100% âm lượng Voice, loại bỏ tình trạng Voice bị nhỏ hoặc nghẹt tiếng.
  14. Trải Nghiệm Sau Khi Xuất Video (Post-Render Actions & Video Preview):
       - **Xem Video Ngay (In-App Player 9:16)**: Modal trình phát video 9:16 tích hợp ngay trong giao diện với autoplay, unmuted audio và đầy đủ điều khiển.
       - **Mở Thư Mục Video (Windows Explorer)**: Lệnh PowerShell `Start-Process explorer.exe -ArgumentList '/select,"<path>"'` tự động mở đúng thư mục và chọn/highlight trực tiếp file video vừa xuất mà không bị lỗi đường dẫn chứa khoảng trắng.
       - **Mở Bằng Windows Player**: Phát ngay lập tức qua trình phát đa phương tiện mặc định của hệ điều hành (VLC, Windows Media Player...).
       - **Tải Trực Tiếp (.MP4)**: Tải video trực tiếp về máy qua trình duyệt.
       - **Khung Điều Khiển Ghi Nhớ**: Card thông tin video vừa xuất hiển thị thường trực trên thanh công cụ và bảng điều khiển Timeline Editor để xem lại hoặc mở thư mục bất kỳ lúc nào.
  15. Cơ Chế Video Outro Cố Định & Bảo Toàn Âm Thanh Gốc (Unmuted Outro Engine):
       - **Cấu hình & Tự động gắn kết**: File video Outro mặc định (`defaultOutroPath`) được lưu trong `config.json` (hỗ trợ cả root và `defaults`). Khi mở Timeline Editor, khối Outro tự động gắn vào cuối Video track sau clip cuối cùng.
       - **Bảo toàn 100% âm thanh gốc (Unmuted)**: Khác với video clip công trình bị mute để nhường chỗ cho Voice, clip Outro có cờ `isOutro: true` được thiết lập `volume={1.0}` và `muted={false}` trong Remotion Player cũng như trích xuất nguyên vẹn audio stream khi Render FFmpeg.
       - **Audio Ducking & BGM Fade-out**: Nhạc thiền BGM tự động Fade-out (nhỏ dần rồi tắt trong 1.0s cuối của phần Voice) trước khi chuyển sang Outro, đảm bảo âm thanh thương hiệu của Outro vang lên trong trẻo và rõ ràng nhất.
       - **Giới hạn Phụ đề Karaoke**: Phụ đề ASS Karaoke chỉ hiển thị trong dải thời gian `0 -> exactVoiceDuration`, tuyệt đối không đè chữ lên Outro.
       - **FFmpeg Stitching Pipeline**: Chuẩn hóa Outro 1080x1920 30fps (`norm_outro.mp4`), nối video thân + outro bằng `xfade` (0.5s) và nối audio bằng `acrossfade` (0.5s) hoặc `concat` tạo video MP4 hoàn chỉnh với thời lượng `exactVoiceDuration + exactOutroDuration - xfadeDuration`.
  16. Chuẩn Hóa Cơ Chế Mở Hộp Thoại File/Folder Windows (Native PowerShell Pickers Architecture):
       - **Quy tắc vàng khi gọi PowerShell UI**:
         + Bắt buộc có cờ `-STA` (Single-Threaded Apartment) và `-NoProfile -ExecutionPolicy Bypass` khi gọi `powershell.exe`.
         + Bắt buộc khởi tạo Form ẩn với:
           ```powershell
           $form = New-Object System.Windows.Forms.Form
           $form.TopMost = $true
           $form.ShowInTaskbar = $true
           $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
           $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
           $result = $dlg.ShowDialog($form)
           ```
           để đảm bảo hộp thoại OpenFileDialog luôn nổi lên trên cùng màn hình (TopMost), không bị mở ngầm/ẩn phía sau trình duyệt hoặc IDE gây cảm giác bấm nút không phản hồi.
         + Bắt buộc xử lý `InitialDir` thông minh: Nếu tham số truyền vào là đường dẫn file thì dùng `[System.IO.Path]::GetDirectoryName($InitialDir)` để mở ngay lập tức tại thư mục đó.
         + Bắt buộc thiết lập mã hóa đầu ra UTF-8:
           ```powershell
           [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
           $OutputEncoding = [System.Text.Encoding]::UTF8
           ```
           để bảo toàn 100% đường dẫn chứa ký tự tiếng Việt có dấu và khoảng trắng.
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
    status TEXT DEFAULT 'draft', -- 'draft', 'rendering', 'completed', 'error'
    timeline_data_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bảng lưu cấu hình người dùng
CREATE TABLE system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Bảng ghi nhớ danh sách Voice đã nạp (Lịch sử Voice)
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

| Method | Endpoint | Tham Số (Body/Query) | Mô Tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/library/projects` | - | Lấy danh sách tất cả các công trình và tổng số video |
| `GET` | `/api/library/projects/:id/videos` | - | Lấy danh sách clip chi tiết của 1 công trình |
| `POST` | `/api/library/pick-and-import` | `{ initialPath?: string }` | Mở hộp thoại chọn thư mục công trình Windows & tự động phân tích AI |
| `POST` | `/api/library/import-path` | `{ folderPath: string }` | Nhập thư mục công trình từ đường dẫn & tự động phân tích AI |
| `POST` | `/api/library/projects/:id/scan` | - | Kích hoạt quét và nhúng AI chạy nền cho 1 công trình (xử lý song song 4 luồng) |
| `GET` | `/api/library/projects/:id/scan-status` | - | Lấy tiến độ % quét và phân tích AI thời gian thực của công trình |
| `DELETE`| `/api/library/projects/:id` | - | Xóa 1 công trình và các video liên quan khỏi thư viện |
| `GET` | `/api/generator/voices` | - | Lấy danh sách voice đã nạp và lưu trong lịch sử SQLite |
| `POST` | `/api/generator/pick-voice` | `{ initialDir?: string }` | Mở hộp thoại Windows chọn file Voice âm thanh (.mp3, .wav, .m4a) qua `audio-picker.ps1` |
| `POST` | `/api/generator/pick-media` | `{ initialDir?: string }` | Mở hộp thoại Windows chọn file Video hoặc Ảnh (.mp4, .mov, .jpg, .png...) thay thế clip qua `media-picker.ps1` |
| `DELETE`| `/api/generator/voices/:id` | - | Xóa voice khỏi danh sách lịch sử |
| `POST` | `/api/generator/upload-voice` | FormData (`file`) | Tải lên file Voice (.mp3, .wav, .m4a) qua web |
| `POST` | `/api/generator/process-voice` | `{ filePath, duration }` | Nhận diện STT Whisper + Gemini sửa phụ đề Phật học & tự động lưu lịch sử |
| `POST` | `/api/generator/assemble-storyline`| `{ voiceDuration, projectId, outro? }` | Tự động phân bổ clip 4 giai đoạn khớp thời lượng Voice (kèm cấu hình Outro) |
| `GET` | `/api/generator/bgm-list` | - | Lấy danh sách nhạc thiền BGM |
| `POST` | `/api/render/start` | `{ videoId, projectName, voicePath, clips, subtitles, outroPath, outroEnabled, outroDuration }` | Bắt đầu Render video MP4 1080x1920 qua FFmpeg (kèm Outro unmuted audio & BGM fade-out) |
| `GET` | `/api/render/status/:jobId` | - | Lấy tiến độ % render (0 - 100%) và đường dẫn file output chính xác |
| `POST` | `/api/render/open-folder` | `{ filePath: string }` | Mở thư mục chứa video trên Windows Explorer (và tự động highlight chọn file video vừa xuất) |
| `POST` | `/api/render/open-video` | `{ filePath: string }` | Mở phát video trực tiếp bằng ứng dụng xem video mặc định của Windows |
| `GET` | `/api/settings` | - | Đọc cấu hình 3 API Key .env / config.json / defaultOutroPath |
| `POST` | `/api/settings` | `{ sttApiKey, subtitleApiKey, embeddingApiKey, baseUrl, rootSourceDir, exportDir, config }` | Lưu cấu hình 3 API Key .env / config.json / defaultOutroPath |
| `POST` | `/api/settings/browse-folder` | `{ initialPath?: string }` | Mở hộp thoại FolderBrowserDialog của Windows qua `picker.ps1` |
| `POST` | `/api/settings/browse-video` | `{ initialPath?: string }` | Mở hộp thoại OpenFileDialog của Windows chọn video Outro (.mp4, .mov, .mkv...) qua `video-picker.ps1` |
| `GET` | `/media/stream?path=...` | `path` | Stream video & audio hỗ trợ HTTP Range header cho Preview Player |
| `GET` | `/api/health` | - | Kiểm tra trạng thái hoạt động backend |

---

## 7. CẤU TRÚC THƯ MỤC MÃ NGUỒN (DIRECTORY TREE)

```
Auto_Video_TamDuc/
├── .env                        # Chứa VILAO_STT_KEY, VILAO_SUBTITLE_KEY, VILAO_EMBEDDING_KEY, VILAO_BASE_URL, ROOT_SOURCE_DIR, EXPORT_DIR
├── config.json                 # Cấu hình app (default font, ducking volume, clip duration, defaultOutroPath, outroEnabled)
├── package.json                # Dependencies React, Remotion, Express, SQLite, FFmpeg
├── vite.config.ts              # Proxy port 5173 -> backend 3001
├── tsconfig.json
├── Auto_Video_TamDuc.exe       # Launcher khởi động 1-click gắn Taskbar
├── backup.bat                  # Script nhấp đúp 1-Click sao lưu lên GitHub
├── backup.ps1                  # PowerShell script thực hiện commit và push Git
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
│   │   └── settings.routes.ts  # Quản lý API Key, Base URL, Thư mục Source & Exports, Video Outro
│   ├── utils/
│   │   ├── picker.ps1          # Hộp thoại chọn thư mục Windows (Folder Browser)
│   │   ├── audio-picker.ps1    # Hộp thoại chọn file Voice âm thanh (.mp3, .wav, .m4a)
│   │   ├── media-picker.ps1    # Hộp thoại chọn file Video hoặc Ảnh (.mp4, .mov, .jpg, .png...)
│   │   └── video-picker.ps1    # Hộp thoại chọn file Video Outro (.mp4, .mov, .mkv, .avi, .webm)
│   └── services/
│       ├── api-client.ts       # OpenAI SDK trỏ https://api.vilao.ai/v1
│       ├── ffmpeg.ts           # Trích frame JPEG 720p, thumbnail, metadata
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

---

## 9. HƯỚNG DẪN SAO LƯU LÊN GITHUB (1-CLICK BACKUP GUIDE)

Repository chính thức: **`https://github.com/ngonco/auto_video_tamduc`**

Hệ thống đã tạo sẵn bộ công cụ sao lưu tự động toàn bộ mã nguồn:

1. **Cách 1 (Nhanh nhất - Dành cho người dùng)**:
   - Nhấp đúp chuột vào file **`backup.bat`** tại thư mục gốc của dự án.
   - Cửa sổ console sẽ tự động `git add .`, tạo commit kèm ngày giờ thực tế và `git push origin main`.

2. **Cách 2 (Dành cho Developer / Terminal)**:
   - Chạy lệnh npm:
     ```bash
     npm run backup
     ```

3. **Cách 3 (PowerShell kèm thông điệp commit tùy chỉnh)**:
   - Chạy lệnh:
     ```powershell
     powershell -ExecutionPolicy Bypass -File ./backup.ps1 "Mô tả nội dung thay đổi"
     ```

> [!NOTE]
> File `.gitignore` đã được cấu hình chặt chẽ để tự động loại trừ các khóa API bí mật (`.env`), dữ liệu bộ nhớ đệm (`.cache/`, `.log`), và file build (`node_modules/`, `dist/`), đảm bảo an toàn 100% khi sao lưu công khai hoặc riêng tư trên GitHub.
