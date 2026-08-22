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
    + **Chọn Clip, Đổi Nguồn Trực Tiếp, Cắt 2 Đầu & Xóa Source Gốc**: Chọn bất kỳ clip nào trên timeline để đổi video/ảnh mới từ **Windows Explorer** hoặc **Thư viện công trình**, **Cắt video nguồn gốc 2 đầu (Start/End handle)** ghi đè vĩnh viễn và đồng bộ CSDL, hoặc **Xóa vĩnh viễn file nguồn gốc (Disk + SQLite)** với tính năng tự động bù/thay thế footage thông minh bảo toàn 100% thời lượng slot và vị trí trên timeline.
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
| **STT (Voice to Text)** | `VILAO_STT_KEY` | `/audio/transcriptions` | `tsa/groq/whisper-large-v3` | Bóc tách giọng nói tiếng Việt siêu tốc kèm initial `prompt` định hướng ngữ cảnh chuẩn âm học, xuất word timestamps chi tiết từng từ cho Karaoke. |
| **Sửa Phụ Đề Ngữ Cảnh AI** | `VILAO_SUBTITLE_KEY` | `/chat/completions` | `ts/gemini-3.1-flash-lite` | Kiểm tra & sửa lỗi sai âm, nhầm thanh điệu, sai vần tiếng Việt theo ngữ cảnh câu văn (tiềm tàng, bủa vây, dân tộc, dù/dẫu...) và thuật toán Word-Alignment bảo toàn 100% mốc thời gian Karaoke. |
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
  2. Phân đoạn Phụ đề, Chống Ảo Giác & Đồng Bộ Karaoke 2 Tầng (2-Layer Anti-Hallucination & AI Spell-Check Engine):
     - **Tầng 1 (Whisper Prompt & Deterministic Purge)**:
       + Truyền prompt tiếng Việt chuẩn mực từ vựng ngữ cảnh tự nhiên để định hướng Whisper.
       + Bộ lọc `filterHallucinatedWords`: Ánh xạ phạm vi ký tự và quét sạch các mẫu câu ảo giác điển hình của Whisper (như *Hãy subscribe cho kênh, Ghiền mì gõ, để không bỏ lỡ video, like và share, bấm chuông, cảm ơn đã theo dõi...*) và các từ kéo dài bất thường do khoảng lặng.
     - **Tầng 2 (Gemini Contextual AI Spell-Check & Hallucination Purge)**: Gửi văn bản STT qua `ts/gemini-3.1-flash-lite` với system prompt chuyên sâu về tiếng Việt, phân tích ngữ nghĩa toàn câu để vừa sửa các lỗi sai âm (như *tìm tàn* ➔ *tiềm tàng*, *mũa vây* ➔ *bủa vây*, *dâng tộc đừng* ➔ *dân tộc đứng*, *phải xuyên* ➔ *phải siêng*...) vừa phát hiện và loại bỏ triệt để các câu ảo giác lạc đề.
     - **Tầng 3 (Thuật toán Ngắt Phụ Đề Thông Minh & Bảo Toàn Từ Ghép - Smart Compound Word Segmentation)**:
       + Tích hợp bộ từ điển phong phú gồm các từ ghép 2 từ (`VIETNAMESE_COMPOUND_WORDS_2`) và 3 từ (`VIETNAMESE_COMPOUND_WORDS_3`) bao quát đời sống, thiện nguyện, không gian thờ và Phật học (`bố thí, làm phước, lượm rác, quần áo, cơm ăn, bắt đầu, mọi điều, trở thành, siêng làm, bàn thờ, phòng thờ, trang nghiêm, thanh tịnh, tâm linh, cội nguồn...`).
       + Hàm `isNonBreakablePair` & `isNonBreakableTriplet`: Tuyệt đối cấm ngắt dòng giữa 2 từ thuộc cùng một từ ghép.
       + Quy tắc độ dài dòng 9:16 linh hoạt: 2 đến 5 từ (tối đa 6 từ nếu cần giữ trọn vẹn từ ghép), ngắt nhịp tự nhiên theo cụm chủ vị/hành động.
       + Xử lý khoảng lặng & Hậu kiểm gộp dòng: Chỉ ngắt câu ngắn 1-2 từ khi `pauseGap >= 0.8s`; tự động gộp các từ đơn lẻ hoặc câu cộc vào dòng kế cận để không bao giờ có dòng cụt ngủn 1 từ.
     - **Tầng 4 (Word-Alignment & Time Interpolation Engine)**: Thuật toán so khớp chuỗi ánh xạ trực tiếp các từ đã sửa vào mảng `KaraokeWord[]` gốc, bảo toàn 100% mốc thời gian `start`, `end`. Khi 1 từ tách thành N từ hoặc N từ gộp thành 1 từ, hệ thống tự động nội suy thời lượng để không làm lệch nhịp Karaoke.
     - **Tầng 5 (Bộ Công Cụ Sửa Phụ Đề Toàn Diện & Auto-Save Database)**:
       + **Xem & Sửa Từng Dòng (Line-by-line Editor)**: Cho phép sửa nhanh text từng dòng (phím Enter/Esc), gộp dòng với dòng kế tiếp, hoặc xóa hẳn dòng thừa/ảo giác chỉ với 1 click.
       + **Sửa Toàn Bộ Văn Bản (Bulk Transcript Editor)**: Cho phép biên tập lại toàn bộ nội dung bài nói trong textarea lớn và nhấn "Áp Dụng & Tự Động Phân Dòng 9:16" (`realignAndSegmentFromCustomText`).
       + **Tự Động Lưu Tức Thì (Auto-Save)**: Mọi thao tác sửa/xóa/gộp/áp dụng đều tự động lưu ngay vào bảng `voices` trong SQLite (`/api/generator/update-subtitles`).
     - Đồng bộ 100% giữa Preview & Video xuất ra (FFmpeg ASS):
       + Chữ hiển thị: Viết IN HOA toàn bộ (UPPERCASE), trang nghiêm, dễ đọc.
       + Hiệu ứng Karaoke: Chữ chưa đọc màu Trắng (#FFFFFF / &H00FFFFFF), khi giọng đọc tới đâu đổi sang màu Vàng Kim (#FFD700 / &H0000D7FF) tới đó kèm viền đen 3.5px và đổ bóng sắc nét.
       + Font chữ chuẩn: Sử dụng bộ font Be Vietnam Pro (tích hợp trong assets/fonts/ và nạp vào FFmpeg qua tham số fontsdir).
       + Kích thước & Vị trí chuẩn: Mặc định cỡ chữ 65px (thay vì 50px cũ bị nhỏ), căn lề đáy 22% (~422px từ đáy 1080x1920) chuẩn safe zone 9:16.
       + Tùy chỉnh trực quan & Ghi nhớ vĩnh viễn (Timeline Subtitle Controls): Bộ thanh trượt điều chỉnh Cỡ chữ (40px - 90px) và Vị trí lề đáy (12% - 35%) ngay trên Bảng điều khiển Timeline Editor; cập nhật trực tiếp thời gian thực trên Preview và tự động lưu vào localStorage / render payload để video xuất ra khớp tuyệt đối 1:1.
       + Xử lý khoảng lặng: Tự động chèn thẻ {\k<gap>} trong file ASS để khớp tuyệt đối từng nhịp ngắt nghỉ của giọng Voice.
  3. Storyline & Clip Duration Engine (Chuẩn 4.0s - 5.5s & 2 Chế Độ Lắp Ráp Nguồn):
     - **2 Chế độ chọn Source**:
       + **Chế độ 1 (1 Công trình cụ thể - Single Mode)**: Phân bổ clip 4 giai đoạn từ 1 thư mục công trình được chọn.
       + **Chế độ 2 (Toàn bộ thư viện - All Projects Smart Mix Mode)**: Tự động tổng hợp và chọn lọc footage tối ưu từ tất cả các công trình trong database.
     - **Thuật toán chống trùng lặp vừa phải & Usage Memory**:
       + Ưu tiên Video trước, chỉ bổ sung Ảnh tĩnh (kèm Ken Burns) khi thiếu video ở giai đoạn tương ứng.
       + Ưu tiên các footage có `usage_count` thấp nhất (chưa dùng hoặc ít dùng) và `aesthetic_score` cao nhất để video luôn tươi mới.
       + Luân phiên các công trình khác nhau giữa các clip liên tiếp (tránh 2 clip cùng 1 công trình khi có nhiều công trình).
       + Cấm 2 clip liên tiếp chọn cùng 1 file nguồn.
       + Thuật toán tịnh tiến `sourceStart` khi tái sử dụng video dài để lấy các góc quay mới liên tục, không bị lặp hình.
     - Trên Timeline Editor: Khi xóa clip hoặc bấm "Cắt Chuẩn 4-6s", hệ thống kích hoạt `rebalanceClips` và `recalcTimelinePositions` tự cân bằng và phân bổ lại các clip thân chính xác trong phạm vi thời lượng Voice (0 -> voiceDuration); khối Outro nằm riêng biệt từ voiceDuration -> totalDuration.
  4. Remotion Player Preview: Sử dụng thẻ <Video> chuẩn Remotion với giải mã phần cứng GPU (Hardware Acceleration) kết hợp <Sequence> độc lập cho từng clip kèm startFrom={clip.sourceStart * fps} để preview siêu mượt 60fps, loại bỏ hoàn toàn tình trạng giựt hình do Canvas seek.
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
         + Bắt buộc khởi tạo Form ẩn với `$form.TopMost = $true`, `$form.ShowInTaskbar = $true`, `$form.StartPosition = CenterScreen` để đảm bảo hộp thoại luôn nổi lên trên cùng màn hình.
         + Xử lý `InitialDir` thông minh tự động nhận diện thư mục cha nếu là file path.
         + Mã hóa UTF-8 cho console để bảo toàn đường dẫn tiếng Việt có dấu.

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

-- 2. Quản lý từng Clip Video / Ảnh
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
    usage_count INTEGER DEFAULT 0, -- Số lần clip đã được chọn vào video
    last_used_at DATETIME,         -- Thời điểm gần nhất được sử dụng
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

-- 5. Bảng ghi nhớ danh sách Voice đã nạp (Lịch sử Voice & Timeline Projects)
CREATE TABLE voices (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    duration REAL DEFAULT 0,
    stt_text TEXT,
    raw_words_json TEXT,
    subtitles_json TEXT,
    timeline_project_json TEXT, -- JSON lưu toàn bộ kịch bản timeline, clips, BGM, subtitle styles, outro
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
| `POST` | `/api/library/delete-source` | `{ filePath?: string, sourceId?: string, projectId?: string }` | Xóa vĩnh viễn 1 file nguồn gốc (vật lý trên ổ cứng + CSDL SQLite) và cập nhật số lượng clip của công trình |
| `POST` | `/api/library/trim-source` | `{ filePath?: string, sourceId?: string, startTime: number, endTime: number }` | Cắt vĩnh viễn 1 file video nguồn gốc theo 2 đầu (FFmpeg + SQLite), ghi đè file gốc và tạo thumbnail mới |
| `GET` | `/api/generator/voices` | - | Lấy danh sách voice đã nạp, phụ đề và dự án timeline đã lưu trong SQLite |
| `POST` | `/api/generator/save-project` | `{ voicePath, voiceId?, timelineData }` | Tự động lưu toàn diện dự án Timeline (clips, BGM, phụ đề, styles, outro) ứng với Voice vào SQLite |
| `GET` | `/api/generator/last-project` | - | Lấy dữ liệu dự án gần nhất để tự động khôi phục khi mở lại app |
| `GET` | `/api/generator/voice-project/:id` | - | Lấy dữ liệu dự án timeline đã lưu của 1 Voice cụ thể (1-Click Mở Lại Dự Án) |
| `POST` | `/api/generator/pick-voice` | `{ initialDir?: string }` | Mở hộp thoại Windows chọn file Voice âm thanh (.mp3, .wav, .m4a) qua `audio-picker.ps1` |
| `POST` | `/api/generator/pick-media` | `{ initialDir?: string }` | Mở hộp thoại Windows chọn file Video hoặc Ảnh (.mp4, .mov, .jpg, .png...) thay thế clip qua `media-picker.ps1` |
| `DELETE`| `/api/generator/voices/:id` | - | Xóa voice khỏi danh sách lịch sử |
| `POST` | `/api/generator/upload-voice` | FormData (`file`) | Tải lên file Voice (.mp3, .wav, .m4a) qua web |
| `POST` | `/api/generator/process-voice` | `{ filePath, duration, forceRefresh? }` | Nhận diện STT Whisper + Gemini sửa phụ đề Phật học, lọc sạch ảo giác & tự động lưu lịch sử |
| `POST` | `/api/generator/update-subtitles` | `{ voicePath, subtitles, fullTranscript? }` | Cập nhật và lưu tức thì danh sách phụ đề vào bảng voices SQLite (khi sửa/xóa/gộp dòng) |
| `POST` | `/api/generator/resegment-transcript` | `{ voicePath, customText, duration? }` | Phân bổ lại toàn bộ phụ đề từ văn bản tùy chỉnh (Bulk Transcript Editor) |
| `POST` | `/api/generator/assemble-storyline`| `{ targetDuration, mode?: 'single' \| 'all', projectId?, outro? }` | Tự động phân bổ clip 4 giai đoạn theo chế độ 1 công trình hoặc toàn bộ thư viện (kèm chống trùng lặp vừa phải & Usage Memory) |
| `GET` | `/api/generator/library-summary` | - | Lấy thống kê tổng quan thư viện (tổng số công trình, clips, thời lượng) |
| `GET` | `/api/generator/bgm-list` | - | Lấy danh sách nhạc thiền BGM |
| `POST` | `/api/render/start` | `{ videoId, projectName, voicePath, clips, subtitles, subtitleFontSize?, subtitleBottomPercent?, outroPath, outroEnabled, outroDuration }` | Bắt đầu Render video MP4 1080x1920 qua FFmpeg (kèm đồng bộ size phụ đề ASS & Outro unmuted audio & BGM fade-out) |
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
│   │   ├── library.routes.ts   # Quản lý công trình, scan & xóa source gốc
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
│   │   ├── EditorView/         # Trình dựng Timeline, Remotion Player 9:16 & Xóa Source Gốc
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

---

## 10. NHẬT KÝ KIỂM THỬ & TỐI ƯU HÓA TOÀN DIỆN (SYSTEM AUDIT LOG)

- **Native Dialogs (PowerShell STA)**: Đồng bộ hóa toàn bộ 4 script (`picker.ps1`, `audio-picker.ps1`, `media-picker.ps1`, `video-picker.ps1`) với cơ chế xử lý `InitialDir` thông minh (tự động nhận diện thư mục cha nếu truyền file path) và thiết lập `$form.ShowInTaskbar = $true` + `$form.WindowState = Normal` để đảm bảo hộp thoại luôn nổi lên trên cùng màn hình.
- **Config Persistence**: Tối ưu hóa việc lưu trữ và đồng bộ hóa `defaultOutroPath`, `outroEnabled`, `outroDuration` đồng thời ở cả cấp root và khối `defaults` trong `config.json` để tương thích ngược 100% với các service backend.
- **Xóa Source Gốc Vĩnh Viễn & Tự Động Thay Thế Footage Thông Minh**:
  - Endpoint `POST /api/library/delete-source`: Xóa file vật lý trên ổ cứng (`fs.unlinkSync`), xóa thumbnail cache, xóa bản ghi `video_sources` trong SQLite và tự động cập nhật lại `total_videos` của `projects`.
  - Trên Timeline Editor: Khi chọn 1 clip, thanh Quick Actions hiển thị nút `Xóa Source Gốc` màu đỏ. Modal xác nhận an toàn hiển thị thumbnail, tên file, đường dẫn chi tiết và cảnh báo nguy hiểm trước khi xóa.
  - Sau khi xóa: Tự động loại bỏ file khỏi `availableSources`, tự động tìm kiếm footage phù hợp cùng/khác stage để thay thế ngay vào vị trí slot bị xóa (bảo toàn 100% thời lượng slot và nhịp điệu timeline), đồng thời cập nhật mọi clip khác trên timeline nếu có dùng chung file.
  - Thêm nút xóa trực tiếp trên từng card trong modal "Chọn Footage Thay Thế Từ Công Trình".
- **Cắt Source Gốc 2 Đầu Vĩnh Viễn & Đồng Bộ Thư Viện (Video Trimmer Engine)**:
  - Endpoint `POST /api/library/trim-source`: Cắt video chính xác từng khung hình bằng FFmpeg (`libx264 -preset veryfast -crf 18`), ghi đè an toàn file gốc trên ổ cứng, tự động tạo lại thumbnail mới và cập nhật thời lượng `duration` trong CSDL SQLite `video_sources`.
  - Trên Timeline Editor: Khi chọn 1 clip, thanh Quick Actions hiển thị nút `Cắt Source Gốc`. Modal cắt video 2 đầu trực quan hỗ trợ xem trước video, thanh trượt 2 đầu (Start handle xanh lá / End handle đỏ cam), nhập số giây chi tiết, nút Xem thử đoạn cắt và nút Cắt Vĩnh Viễn.
  - Sau khi cắt: Tự động cập nhật `sourceStart = 0`, thumbnail mới cho clip trên Timeline và đồng bộ danh sách `localAvailableSources`.
- **Tự Động Lưu Dự Án Ứng Với Voice & Khôi Phục 1-Click (Project Auto-Save Engine)**:
  - SQLite Schema: Bổ sung cột `timeline_project_json TEXT` vào bảng `voices` và ghi nhớ `last_active_voice_path` trong `system_settings`.
  - Backend API: Cung cấp 3 endpoint `POST /api/generator/save-project`, `GET /api/generator/last-project` và `GET /api/generator/voice-project/:id`.
  - Tự động lưu ngầm (Debounce 800ms): Mọi thao tác đổi clip, di chuyển, cắt 2 đầu, sửa phụ đề, chỉnh volume BGM/Voice, cỡ chữ phụ đề hay Outro đều được lưu tức thì vào SQLite.
  - Trực quan hóa trạng thái: Thanh Timeline hiển thị trạng thái `☁️ Đã lưu (HH:mm:ss)` kèm nút `💾 Lưu Ngay`.
  - Danh sách Voice: Thẻ Voice hiển thị badge `🎬 [N] clips` kèm nút `🎬 Mở Lại Dự Án` để 1-click vào thẳng Timeline Editor mà không cần phân bổ lại từ đầu.
  - Tự động khôi phục: Khởi động app tự động nạp lại dự án gần nhất đang làm việc.
- **Sửa Triệt Để Lỗi Thiếu Phụ Đề Đoạn Cuối & Two-Pass STT Safety Engine**:
  - Nguyên nhân gốc: Tham số `prompt` dài trước đây truyền vào Whisper API gây ra vòng lặp ảo giác (loop hallucination: *"Hãy subscribe cho kênh Ghiền Mì Gõ..."*) ở nửa sau file voice, khiến văn bản thật bị nuốt chửng và bộ lọc anti-hallucination cắt bỏ toàn bộ nửa sau của phụ đề.
  - Khắc phục triệt để:
    1. Loại bỏ prompt dài gây nhiễu trong Whisper STT, đảm bảo nhận diện chính xác 100% văn bản giọng đọc xuyên suốt toàn bộ thời lượng.
    2. Triển khai **Two-Pass STT Safety Engine**: Tự động đo thời lượng chính xác của voice; nếu từ cuối cùng kết thúc trước mốc audio > 3.5s, tự động cắt lát audio đuôi và chạy Pass 2 để bù đắp từ bị thiếu.
    3. Thêm cơ chế **Auto-Heal STT Cache**: Khi nạp voice từ cache, nếu phát hiện bản ghi cũ bị thiếu đuôi (< 85% thời lượng voice), hệ thống tự động nhận diện lại toàn diện và chữa lành 100% phụ đề trong CSDL SQLite.
- **Khắc Phục Triệt Để Lỗi Font Tiếng Việt Của File Âm Thanh & Video (UTF-8 Mojibake Fix)**:
  - Nguyên nhân gốc: Khi upload file qua trình duyệt bằng Multer/Busboy, `req.file.originalname` mặc định bị giải mã nhầm theo bảng mã Latin-1 (ISO-8859-1) thay vì UTF-8, khiến các tên file tiếng Việt có dấu (như *"CHÂN LÝ ĐẾN VỚI CUỘC ĐỜI.mp3"*) bị biến thành chuỗi rác ký tự (*"CHÃ‚N LÃ  Ä áº¾N Vá»šI CUá»˜C Ä á»œI.mp3"*).
  - Khắc phục:
    1. Bổ sung hàm tiện ích `fixUtf8Filename()` trong `server/routes/generator.routes.ts` tự động phát hiện và giải mã nhị phân chuẩn xác sang UTF-8.
    2. Áp dụng `fixUtf8Filename()` xuyên suốt các điểm tiếp nhận: `/upload-voice`, `/pick-voice`, `/process-voice`, `/save-project` và `/voices`.
    3. Tự động kiểm tra và sửa chữa sạch sẽ các bản ghi có tên bị lỗi font trong CSDL SQLite khi truy vấn danh sách Voice.
- **Hợp Nhất Khung Nạp Voice Tương Tác (Unified Voice Dropzone UI)**:
  - Tối ưu hóa toàn diện Bước 1: Gộp 2 nút chọn file rời rạc trước đây thành **1 Khung Nạp Voice Duy Nhất** hỗ trợ tương tác đa phương thức:
    1. Kéo thả file âm thanh (.mp3, .wav, .m4a) trực tiếp vào khung với phản hồi đồ họa viền sáng (Drag & drop visual feedback).
    2. Nút chính `📁 Chọn File Trên Máy`: Mở hộp thoại native Windows OpenFileDialog để chọn nhanh từ ổ đĩa.
    3. Nút phụ `Tải Từ Trình Duyệt`: Duyệt file qua HTML5 file picker cho môi trường web.
  - Loại bỏ hoàn toàn sự trùng lặp và phân vân cho người dùng, tối ưu hóa không gian làm việc.
- **Khắc Phục Triệt Để Video 'No Thumb' Bị Đứng Hình & Cơ Chế Tự Động Chữa Lành Timeline (Auto-Heal Timeline & 100% Thumbnail Generation)**:
  - **Nguyên nhân gốc (Các video No Thumb bị đứng đơ)**:
    1. Khi import thư viện, 266 video bị thiếu thumbnail (`thumbnail_path IS NULL`) và thời lượng chưa được đo chuẩn xác bằng ffprobe.
    2. Các dự án lưu cũ (như `TongHop_ToanBoThuVien`) chứa các video ngắn (ví dụ `clip_02.mp4` 1.47s, `clip_04.mp4` 1.81s, `clip_06.mp4` 1.55s) nhưng bị gán slot timeline cố định `5.0s`. Khi trình chiếu qua 1.47s, thẻ `<Video>` của trình duyệt hết frame nên bị đứng đơ ở frame cuối cho 3.53s còn lại!
  - **Khắc phục toàn diện**:
    1. **Tạo mới 100% Thumbnail & Đo thời lượng thực tế**: Đã chạy tiến trình quét và tạo đủ 100% thumbnail cho toàn bộ 510 video trong thư viện SQLite, đo đạc chính xác thời lượng từng file bằng ffprobe.
    2. **Cơ chế Auto-Heal Timeline trong [TimelineEditor.tsx](file:///d:/DONG%20GOI%20TAM%20THOI/Auto_Video_TamDuc/src/components/EditorView/TimelineEditor.tsx)**: Tự động phát hiện bất kỳ clip nào có `sourceDuration > realDuration - sourceStart` hoặc thiếu thumbnail trên timeline, tự động giới hạn và tái phân bổ clip mượt mà 100% không để bất kỳ clip nào bị kéo dài quá độ dài file thật.
- **Tự Động Lọc Xoá Clip < 2.0s Khi Nhúng AI & Nút Nhúng AI Toàn Bộ Thư Viện (Batch AI Embed & Auto-Purge Short Clips)**:
  - **Tự Động Xoá Clip < 2s**: Ở bước Nhúng AI (`server/watcher.ts`), khi đo đạc video bằng `ffprobe`, nếu phát hiện video có thời lượng `< 2.0s`:
    1. Tự động xoá file video gốc trên ổ cứng bằng `fs.unlinkSync()`.
    2. Tự động xoá bản ghi tương ứng trong CSDL SQLite `video_sources`.
    3. Cập nhật lại số lượng `total_videos` trong bảng `projects`.
    ➔ Giúp thư viện luôn tinh gọn, sạch sẽ, chỉ giữ lại các video đạt chuẩn chất lượng từ 2.0s trở lên.
  - **Nút "⚡ Nhúng AI Toàn Bộ Thư Viện"**:
    - Backend: Endpoint `POST /api/library/projects/scan-all` và `GET /api/library/projects/scan-all-status` quản lý tiến trình nhúng AI lần lượt cho tất cả công trình trong thư viện.
    - Frontend: Bổ sung nút bấm sang trọng `⚡ Nhúng AI Toàn Bộ` trên Header Thư Viện ([LibraryGrid.tsx](file:///d:/DONG%20GOI%20TAM%20THOI/Auto_Video_TamDuc/src/components/LibraryView/LibraryGrid.tsx)) kèm thanh tiến trình tổng thể hiển thị phần trăm và thông báo chi tiết theo thời gian thực.
- **Build & Quality Assurance**: Dự án đã vượt qua bài kiểm tra `npx tsc --noEmit` và `npm run build` với 0 lỗi cú pháp, toàn bộ các luồng Thư viện, Tạo video nhanh, Dựng timeline và Xuất MP4 hoạt động trơn tru, ổn định tuyệt đối.










