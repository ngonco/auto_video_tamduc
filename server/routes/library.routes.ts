import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { db } from '../db.js';
import { folderWatcher } from '../watcher.js';
import { trimVideoFile } from '../services/ffmpeg.js';

export const libraryRouter = Router();

/**
 * Tự động kiểm tra và dọn dẹp các công trình hoặc file media không còn tồn tại trên ổ đĩa
 */
export function purgeMissingProjectsAndSources() {
  try {
    const projects = db.prepare('SELECT id, folder_name, folder_path FROM projects').all() as any[];
    for (const proj of projects) {
      if (!fs.existsSync(proj.folder_path)) {
        console.log(`[SelfHealing] Project folder missing on disk, purging from SQLite: ${proj.folder_name} (${proj.folder_path})`);
        const thumbs = db.prepare('SELECT thumbnail_path FROM video_sources WHERE project_id = ?').all(proj.id) as any[];
        for (const t of thumbs) {
          if (t.thumbnail_path) {
            const thumbFull = path.resolve(process.cwd(), t.thumbnail_path);
            if (fs.existsSync(thumbFull)) {
              try { fs.unlinkSync(thumbFull); } catch (_) {}
            }
          }
        }
        db.prepare('DELETE FROM video_sources WHERE project_id = ?').run(proj.id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);
      }
    }
  } catch (err: any) {
    console.warn('[SelfHealing] Error syncing missing projects:', err.message);
  }
}

// Lấy danh sách tất cả các Công trình (tự động dọn sạch folder đã bị xóa trên đĩa)
libraryRouter.get('/projects', (req, res) => {
  try {
    purgeMissingProjectsAndSources();

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

// Lấy danh sách video của 1 công trình (ưu tiên ít dùng lên đầu)
libraryRouter.get('/projects/:id/videos', (req, res) => {
  try {
    const videos = db.prepare('SELECT * FROM video_sources WHERE project_id = ? ORDER BY usage_count ASC, aesthetic_score DESC').all(req.params.id);
    res.json({ success: true, data: videos });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lấy danh sách footage mới nhất kèm usage_count đồng bộ từ CSDL cho Timeline Editor
libraryRouter.get('/sources', (req, res) => {
  try {
    const { projectId } = req.query;
    let clips: any[] = [];

    if (!projectId || projectId === 'ALL' || projectId === 'ALL_PROJECTS') {
      clips = db.prepare(`
        SELECT 
          v.id, v.project_id as projectId, p.folder_name as projectName,
          v.file_name as fileName, v.file_path as filePath,
          v.duration, v.width, v.height, v.aspect_ratio_type as aspectRatioType,
          v.stage, v.aesthetic_score as aestheticScore, v.scene_description as sceneDescription,
          v.thumbnail_path as thumbnailPath, v.usage_count as usageCount, v.last_used_at as lastUsedAt
        FROM video_sources v
        LEFT JOIN projects p ON v.project_id = p.id
        ORDER BY v.usage_count ASC, v.aesthetic_score DESC
      `).all();
    } else {
      clips = db.prepare(`
        SELECT 
          v.id, v.project_id as projectId, p.folder_name as projectName,
          v.file_name as fileName, v.file_path as filePath,
          v.duration, v.width, v.height, v.aspect_ratio_type as aspectRatioType,
          v.stage, v.aesthetic_score as aestheticScore, v.scene_description as sceneDescription,
          v.thumbnail_path as thumbnailPath, v.usage_count as usageCount, v.last_used_at as lastUsedAt
        FROM video_sources v
        LEFT JOIN projects p ON v.project_id = p.id
        WHERE v.project_id = ?
        ORDER BY v.usage_count ASC, v.aesthetic_score DESC
      `).all(projectId);
    }

    const validClips = clips.filter((c: any) => fs.existsSync(c.filePath));
    res.json({ success: true, data: validClips });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tăng số lần sử dụng của một source video/ảnh khi được chọn thay thế trên Timeline
libraryRouter.post('/increment-source-usage', (req, res) => {
  try {
    const { sourceId, filePath } = req.body;
    if (!sourceId && !filePath) {
      return res.status(400).json({ success: false, error: 'Thiếu sourceId hoặc filePath' });
    }

    if (sourceId) {
      db.prepare(`
        UPDATE video_sources 
        SET usage_count = COALESCE(usage_count, 0) + 1, last_used_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(sourceId);
    } else if (filePath) {
      db.prepare(`
        UPDATE video_sources 
        SET usage_count = COALESCE(usage_count, 0) + 1, last_used_at = CURRENT_TIMESTAMP
        WHERE file_path = ?
      `).run(filePath);
    }

    res.json({ success: true });
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

// Trigger quét và nhúng AI cho TOÀN BỘ thư viện
libraryRouter.post('/projects/scan-all', async (req, res) => {
  try {
    activeScanJobs['ALL'] = {
      status: 'scanning',
      percent: 0,
      message: 'Bắt đầu tiến trình phân tích AI cho toàn bộ thư viện...',
    };

    res.json({ success: true, message: 'Đã bắt đầu tiến trình phân tích AI cho toàn bộ thư viện' });

    // Chạy phân tích nền
    folderWatcher.scanAndEmbedAllProjects((percent, message) => {
      activeScanJobs['ALL'] = {
        status: percent >= 100 ? 'completed' : 'scanning',
        percent,
        message,
      };
    })
      .then(() => {
        activeScanJobs['ALL'] = {
          status: 'completed',
          percent: 100,
          message: 'Đã hoàn tất phân tích AI cho toàn bộ thư viện!',
        };
      })
      .catch((err) => {
        console.error('[LibraryRoutes] Error scanning all projects:', err);
        activeScanJobs['ALL'] = {
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

// Lấy trạng thái tiến độ quét AI toàn bộ
libraryRouter.get('/projects/scan-all-status', (req, res) => {
  const job = activeScanJobs['ALL'] || { status: 'idle', percent: 0, message: '' };
  res.json({ success: true, data: job });
});

// Lấy trạng thái tiến độ quét AI
libraryRouter.get('/projects/:id/scan-status', (req, res) => {
  const projectId = req.params.id;
  const job = activeScanJobs[projectId] || { status: 'idle', percent: 0, message: '' };
  res.json({ success: true, data: job });
});

// Xóa 1 công trình khỏi thư viện (kèm dọn dẹp thumbnail cache)
libraryRouter.delete('/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    const thumbs = db.prepare('SELECT thumbnail_path FROM video_sources WHERE project_id = ?').all(projectId) as any[];
    for (const t of thumbs) {
      if (t.thumbnail_path) {
        const thumbFull = path.resolve(process.cwd(), t.thumbnail_path);
        if (fs.existsSync(thumbFull)) {
          try { fs.unlinkSync(thumbFull); } catch (_) {}
        }
      }
    }
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


