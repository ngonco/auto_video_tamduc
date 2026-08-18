import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { transcribeAudio } from '../services/stt-service.js';
import { polishAndSegmentSubtitles, segmentAndPolishSubtitles } from '../services/subtitle-fixer.js';
import { generateStoryline, SourceClipRecord } from '../services/storyline-engine.js';
import { getVideoMetadata } from '../services/ffmpeg.js';

const UPLOAD_DIR = path.resolve(process.cwd(), '.cache', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `voice_${Date.now()}_${uuidv4().slice(0, 6)}${ext}`);
  },
});

const upload = multer({ storage });
export const generatorRouter = Router();

// 1. Upload file Voice qua Web
generatorRouter.post('/upload-voice', upload.single('voice'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Không tìm thấy file voice tải lên' });
    }

    res.json({
      success: true,
      file: {
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileName: req.file.filename,
        size: req.file.size,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Mở File Explorer để chọn Voice trực tiếp trên máy tính
generatorRouter.post('/pick-voice', (req, res) => {
  try {
    const scriptPath = path.resolve(process.cwd(), 'server', 'utils', 'audio-picker.ps1');
    const title = 'Chon File Voice Am Thanh (MP3, WAV, M4A)';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, title, ''],
      { windowsHide: false },
      (error: any, stdout: any, stderr: any) => {
        if (error) {
          console.error('[PickVoice] Error opening dialog:', error, stderr);
          return res.status(500).json({ success: false, error: 'Không thể mở hộp thoại chọn file: ' + error.message });
        }

        const selectedPath = (stdout || '').trim();
        if (!selectedPath || !fs.existsSync(selectedPath)) {
          return res.json({ success: false, cancelled: true, message: 'Người dùng đã hủy chọn file' });
        }

        const stat = fs.statSync(selectedPath);
        const fileName = path.basename(selectedPath);

        res.json({
          success: true,
          file: {
            originalName: fileName,
            filePath: selectedPath,
            fileName: fileName,
            size: stat.size,
          },
        });
      }
    );
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Lấy danh sách các Voice đã nạp (Ghi nhớ / Lịch sử Voice)
generatorRouter.get('/voices', (req, res) => {
  try {
    const voices = db.prepare(`SELECT * FROM voices ORDER BY created_at DESC`).all();
    const formatted = voices.map((v: any) => {
      const rawWords = v.raw_words_json ? JSON.parse(v.raw_words_json) : [];
      let subs = v.subtitles_json ? JSON.parse(v.subtitles_json) : [];

      // Tự động kiểm tra & sửa chữa nếu phụ đề cũ bị ngắn/lệch so với thời lượng Voice
      const lastSubEnd = subs.length > 0 ? subs[subs.length - 1].end : 0;
      if (rawWords.length > 0 && (subs.length === 0 || (v.duration > 5 && lastSubEnd < v.duration * 0.85))) {
        subs = segmentAndPolishSubtitles(rawWords);
        try {
          db.prepare(`UPDATE voices SET subtitles_json = ? WHERE id = ?`).run(JSON.stringify(subs), v.id);
        } catch (_) {}
      }

      return {
        ...v,
        raw_words: rawWords,
        subtitles: subs,
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Xóa voice khỏi lịch sử
generatorRouter.delete('/voices/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`DELETE FROM voices WHERE id = ?`).run(id);
    res.json({ success: true, message: 'Đã xóa voice thành công' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Nhận diện giọng nói STT + Sửa chính tả Phật pháp + Tự động Ghi nhớ Voice
generatorRouter.post('/process-voice', async (req, res) => {
  try {
    const { filePath, originalName } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'Đường dẫn file voice không hợp lệ' });
    }

    // Kiểm tra xem voice đã từng được xử lý trong database chưa để trả kết quả ngay (instant cache)
    const existing: any = db.prepare(`SELECT * FROM voices WHERE file_path = ?`).get(filePath);
    if (existing && existing.subtitles_json) {
      const rawWords = existing.raw_words_json ? JSON.parse(existing.raw_words_json) : [];
      let subs = existing.subtitles_json ? JSON.parse(existing.subtitles_json) : [];

      const lastSubEnd = subs.length > 0 ? subs[subs.length - 1].end : 0;
      if (rawWords.length > 0 && (subs.length === 0 || (existing.duration > 5 && lastSubEnd < existing.duration * 0.85))) {
        subs = segmentAndPolishSubtitles(rawWords);
        try {
          db.prepare(`UPDATE voices SET subtitles_json = ? WHERE id = ?`).run(JSON.stringify(subs), existing.id);
        } catch (_) {}
      }

      return res.json({
        success: true,
        cached: true,
        data: {
          id: existing.id,
          rawText: existing.stt_text,
          duration: existing.duration,
          words: rawWords,
          subtitles: subs,
        },
      });
    }

    console.log('[Generator] Starting STT transcription on:', filePath);
    // Bước 1: Whisper STT lấy word timestamps
    const sttResult = await transcribeAudio(filePath);

    // Lấy thời lượng thực tế chuẩn xác của file voice
    let accurateDuration = sttResult.duration;
    try {
      const audioMeta = await getVideoMetadata(filePath);
      if (audioMeta.duration && audioMeta.duration > 0) {
        accurateDuration = audioMeta.duration;
      }
    } catch (_) {}

    console.log('[Generator] Polishing subtitles with LLM...');
    // Bước 2: Gemini LLM chuẩn hóa từ ngữ Phật pháp và ngắt câu 9:16
    const polishedSubtitles = await polishAndSegmentSubtitles(sttResult.text, sttResult.words);

    const voiceId = 'voice_' + uuidv4().slice(0, 8);
    const fileName = originalName || path.basename(filePath);

    // Bước 3: Ghi nhớ vào SQLite database
    db.prepare(`
      INSERT INTO voices (id, file_name, file_path, duration, stt_text, raw_words_json, subtitles_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        duration = excluded.duration,
        stt_text = excluded.stt_text,
        raw_words_json = excluded.raw_words_json,
        subtitles_json = excluded.subtitles_json
    `).run(
      voiceId,
      fileName,
      filePath,
      accurateDuration,
      sttResult.text,
      JSON.stringify(sttResult.words),
      JSON.stringify(polishedSubtitles)
    );

    res.json({
      success: true,
      data: {
        id: voiceId,
        rawText: sttResult.text,
        duration: accurateDuration,
        words: sttResult.words,
        subtitles: polishedSubtitles,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Tự động sinh Storyline Clips theo 4 giai đoạn
generatorRouter.post('/assemble-storyline', (req, res) => {
  try {
    const { projectId, targetDuration } = req.body;
    if (!projectId || !targetDuration) {
      return res.status(400).json({ success: false, error: 'Thiếu projectId hoặc targetDuration' });
    }

    const clips: SourceClipRecord[] = db.prepare(`
      SELECT 
        id, project_id as projectId, file_name as fileName, file_path as filePath,
        duration, width, height, aspect_ratio_type as aspectRatioType,
        stage, aesthetic_score as aestheticScore, scene_description as sceneDescription,
        thumbnail_path as thumbnailPath
      FROM video_sources 
      WHERE project_id = ?
    `).all(projectId) as any[];

    if (clips.length === 0) {
      return res.status(400).json({ success: false, error: 'Công trình này chưa có video nào' });
    }

    const storyline = generateStoryline(clips, Number(targetDuration));
    res.json({ success: true, data: storyline });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Danh sách BGM nhạc thiền
generatorRouter.get('/bgm-list', (req, res) => {
  const bgmDir = path.resolve(process.cwd(), 'assets', 'bgm');
  if (!fs.existsSync(bgmDir)) {
    fs.mkdirSync(bgmDir, { recursive: true });
  }

  const files = fs.readdirSync(bgmDir).filter((f) => ['.mp3', '.wav', '.m4a'].includes(path.extname(f).toLowerCase()));
  const list = files.map((f) => ({
    name: f.replace(path.extname(f), '').replace(/_/g, ' '),
    fileName: f,
    filePath: path.join(bgmDir, f),
  }));

  res.json({ success: true, data: list });
});
