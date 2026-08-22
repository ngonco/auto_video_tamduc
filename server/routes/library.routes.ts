import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { db } from '../db.js';
import { folderWatcher } from '../watcher.js';
import { trimVideoFile } from '../services/ffmpeg.js';

export const libraryRouter = Router();

// Lấy danh sách tất cả các Công trình
libraryRouter.get('/projects', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM video_sources WHERE project_id = p.id) as total_videos,
        (SELECT thumbnail_path FROM video_sources WHERE project_id = p.id AND thumbnail_path IS NOT NULL LIMIT 1) as cover_thumbnail
      FROM projects p
      ORDER BY p.last_scanned_at DESC
    `).all();

    res.json({ success: true, data: projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lấy danh sách video của 1 công trình
libraryRouter.get('/projects/:id/videos', (req, res) => {
  try {
    const videos = db.prepare('SELECT * FROM video_sources WHERE project_id = ? ORDER BY stage, aesthetic_score DESC').all(req.params.id);
    res.json({ success: true, data: videos });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mở hộp thoại chọn thư mục Windows và tự động Import & Quét AI
libraryRouter.post('/pick-and-import', async (req, res) => {
  try {
    const scriptPath = path.resolve(process.cwd(), 'server', 'utils', 'picker.ps1');
    const title = 'Chon Thu Muc Cong Trinh (Chon thu muc chua video roi nhan Open)';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, title, ''],
      { windowsHide: false },
      async (error: any, stdout: any, stderr: any) => {
        if (error) {
          console.error('[PickAndImport] Error opening dialog:', error, stderr);
          return res.status(500).json({ success: false, error: 'Không thể mở hộp thoại chọn thư mục: ' + error.message });
        }

        const selectedPath = (stdout || '').trim();
        if (!selectedPath) {
          return res.json({ success: false, cancelled: true, message: 'Người dùng đã hủy chọn thư mục' });
        }

        try {
          const project = await folderWatcher.importAndScanCustomFolder(selectedPath);
          res.json({
            success: true,
            data: project,
            message: `Đã nạp và phân tích AI thành công cho công trình: ${project.folder_name}`,
          });
        } catch (importErr: any) {
          res.status(400).json({ success: false, error: importErr.message });
        }
      }
    );
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Nhập trực tiếp từ đường dẫn thư mục
libraryRouter.post('/import-path', async (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'Thiếu đường dẫn folderPath' });
    }

    const project = await folderWatcher.importAndScanCustomFolder(folderPath);
    res.json({
      success: true,
      data: project,
      message: `Đã nạp và phân tích AI thành công cho công trình: ${project.folder_name}`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Theo dõi tiến độ scan/embed cho từng công trình
const activeScanJobs: Record<string, { status: string; percent: number; message: string; error?: string }> = {};

// Trigger quét và nhúng AI lại cho 1 công trình
libraryRouter.post('/projects/:id/scan', async (req, res) => {
  try {
    const projectId = req.params.id;
    activeScanJobs[projectId] = {
      status: 'scanning',
      percent: 0,
      message: 'Bắt đầu tiến trình phân tích AI...',
    };

    res.json({ success: true, message: 'Đã bắt đầu tiến trình phân tích AI cho công trình' });

    // Chạy phân tích nền
    folderWatcher.scanAndEmbedProject(projectId, (percent, message) => {
      activeScanJobs[projectId] = {
        status: percent >= 100 ? 'completed' : 'scanning',
        percent,
        message,
      };
    })
      .then(() => {
        activeScanJobs[projectId] = {
          status: 'completed',
          percent: 100,
          message: 'Đã hoàn tất phân tích AI cho toàn bộ công trình!',
        };
      })
      .catch((err) => {
        console.error(`[LibraryRoutes] Error scanning project ${projectId}:`, err);
        activeScanJobs[projectId] = {
          status: 'error',
          percent: 0,
          message: `Lỗi phân tích AI: ${err.message}`,
          error: err.message,
        };
      });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lấy trạng thái tiến độ quét AI
libraryRouter.get('/projects/:id/scan-status', (req, res) => {
  const projectId = req.params.id;
  const job = activeScanJobs[projectId] || { status: 'idle', percent: 0, message: '' };
  res.json({ success: true, data: job });
});

// Xóa 1 công trình khỏi thư viện
libraryRouter.delete('/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    db.prepare('DELETE FROM video_sources WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    res.json({ success: true, message: 'Đã xóa công trình khỏi thư viện thành công' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Xóa vĩnh viễn 1 file source gốc (vật lý trên ổ cứng + CSDL SQLite)
libraryRouter.post('/delete-source', (req, res) => {
  try {
    const { filePath, sourceId, projectId } = req.body || {};
    if (!filePath && !sourceId) {
      return res.status(400).json({ success: false, error: 'Thiếu filePath hoặc sourceId cần xóa' });
    }

    // 1. Tìm thông tin file trong database nếu có
    let sourceRecord: any = null;
    if (sourceId) {
      sourceRecord = db.prepare('SELECT * FROM video_sources WHERE id = ?').get(sourceId);
    } else if (filePath) {
      sourceRecord = db.prepare('SELECT * FROM video_sources WHERE file_path = ?').get(filePath);
    }

    const targetFilePath = sourceRecord?.file_path || filePath;
    const targetProjectId = sourceRecord?.project_id || projectId;

    // 2. Xóa file vật lý trên ổ đĩa nếu tồn tại
    let fileDeletedFromDisk = false;
    if (targetFilePath && fs.existsSync(targetFilePath)) {
      try {
        fs.unlinkSync(targetFilePath);
        fileDeletedFromDisk = true;
        console.log(`[DeleteSource] Successfully deleted physical file: ${targetFilePath}`);
      } catch (fsErr: any) {
        console.error(`[DeleteSource] Failed to delete physical file ${targetFilePath}:`, fsErr);
      }
    }

    // 3. Xóa thumbnail cache nếu có
    if (sourceRecord?.thumbnail_path) {
      try {
        const thumbFull = path.resolve(process.cwd(), sourceRecord.thumbnail_path);
        if (fs.existsSync(thumbFull)) {
          fs.unlinkSync(thumbFull);
        }
      } catch (thumbErr) {
        // ignore cache delete error
      }
    }

    // 4. Xóa bản ghi trong SQLite
    if (sourceRecord?.id) {
      db.prepare('DELETE FROM video_sources WHERE id = ?').run(sourceRecord.id);
    } else if (targetFilePath) {
      db.prepare('DELETE FROM video_sources WHERE file_path = ?').run(targetFilePath);
    }

    // 5. Cập nhật lại total_videos trong bảng projects nếu có projectId
    if (targetProjectId) {
      db.prepare(`
        UPDATE projects 
        SET total_videos = (SELECT COUNT(*) FROM video_sources WHERE project_id = ?) 
        WHERE id = ?
      `).run(targetProjectId, targetProjectId);
    }

    res.json({
      success: true,
      fileDeletedFromDisk,
      message: `Đã xóa vĩnh viễn file nguồn ${path.basename(targetFilePath || '')} thành công`,
      deletedFilePath: targetFilePath,
      deletedSourceId: sourceRecord?.id || sourceId,
    });
  } catch (err: any) {
    console.error('[DeleteSource] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cắt vĩnh viễn 1 file source video gốc (vật lý trên ổ cứng + CSDL SQLite)
libraryRouter.post('/trim-source', async (req, res) => {
  try {
    const { filePath, sourceId, startTime, endTime } = req.body || {};
    if (!filePath && !sourceId) {
      return res.status(400).json({ success: false, error: 'Thiếu filePath hoặc sourceId cần cắt' });
    }

    const start = Math.max(0, Number(startTime) || 0);
    const end = Number(endTime);
    if (isNaN(end) || end <= start) {
      return res.status(400).json({ success: false, error: 'Khoảng thời gian cắt không hợp lệ (endTime phải lớn hơn startTime)' });
    }

    // 1. Tìm thông tin file trong CSDL
    let sourceRecord: any = null;
    if (sourceId) {
      sourceRecord = db.prepare('SELECT * FROM video_sources WHERE id = ?').get(sourceId);
    } else if (filePath) {
      sourceRecord = db.prepare('SELECT * FROM video_sources WHERE file_path = ?').get(filePath);
    }

    const targetFilePath = sourceRecord?.file_path || filePath;
    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return res.status(404).json({ success: false, error: 'File video không tồn tại trên ổ cứng' });
    }

    const videoId = sourceRecord?.id || path.basename(targetFilePath, path.extname(targetFilePath));

    // 2. Thực hiện cắt video bằng FFmpeg và trích xuất thumbnail mới
    const { duration: newDuration, thumbnailPath: newThumbPath } = await trimVideoFile(
      targetFilePath,
      start,
      end,
      videoId
    );

    // 3. Cập nhật bản ghi trong SQLite
    if (sourceRecord?.id) {
      db.prepare('UPDATE video_sources SET duration = ?, thumbnail_path = ? WHERE id = ?').run(
        newDuration,
        newThumbPath,
        sourceRecord.id
      );
    } else {
      db.prepare('UPDATE video_sources SET duration = ?, thumbnail_path = ? WHERE file_path = ?').run(
        newDuration,
        newThumbPath,
        targetFilePath
      );
    }

    res.json({
      success: true,
      message: `Đã cắt vĩnh viễn video ${path.basename(targetFilePath)} thành công`,
      newDuration,
      newThumbnailPath: newThumbPath,
      fileName: path.basename(targetFilePath),
      filePath: targetFilePath,
      sourceId: sourceRecord?.id || sourceId,
    });
  } catch (err: any) {
    console.error('[TrimSource] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


