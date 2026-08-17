import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { db } from '../db.js';
import { folderWatcher } from '../watcher.js';

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

// Trigger quét và nhúng AI lại cho 1 công trình
libraryRouter.post('/projects/:id/scan', async (req, res) => {
  try {
    const projectId = req.params.id;
    folderWatcher.scanAndEmbedProject(projectId);
    res.json({ success: true, message: 'Đã bắt đầu tiến trình phân tích AI cho công trình' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
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
