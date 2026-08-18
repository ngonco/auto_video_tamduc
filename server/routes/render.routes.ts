import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { renderFinalVideo, RenderRequest } from '../services/render-service.js';

export const renderRouter = Router();

// Lưu trữ trạng thái các job render trong bộ nhớ
const activeJobs: Record<string, { status: string; percent: number; message: string; outputPath?: string; error?: string }> = {};

// Bắt đầu Render
renderRouter.post('/start', async (req, res) => {
  try {
    const {
      videoId,
      projectName,
      voicePath,
      bgmPath,
      bgmVolume,
      voiceVolume,
      duckingVolume,
      clips,
      subtitles,
      outroPath,
      outroEnabled,
      outroDuration,
    } = req.body;

    const exportDir = process.env.EXPORT_DIR || path.resolve(process.cwd(), 'exports');
    const jobId = `render_${uuidv4().slice(0, 8)}`;

    activeJobs[jobId] = {
      status: 'rendering',
      percent: 0,
      message: 'Bắt đầu tiến trình render video...',
    };

    // Phản hồi jobId ngay
    res.json({ success: true, jobId });

    // Render bất đồng bộ
    const renderReq: RenderRequest = {
      videoId: videoId || jobId,
      projectName: projectName || 'TamDuc_Video',
      voicePath,
      bgmPath,
      bgmVolume: Number(bgmVolume) || 0.15,
      voiceVolume: Number(voiceVolume) || 1.0,
      duckingVolume: Number(duckingVolume) || 0.08,
      clips,
      subtitles,
      outputDir: exportDir,
      outroPath,
      outroEnabled: Boolean(outroEnabled),
      outroDuration: Number(outroDuration) || 0,
    };

    renderFinalVideo(renderReq, (percent, message) => {
      activeJobs[jobId] = {
        status: 'rendering',
        percent: Math.min(99, Math.round(percent)),
        message,
      };
    })
      .then((outputPath) => {
        activeJobs[jobId] = {
          status: 'completed',
          percent: 100,
          message: 'Xuất video thành công!',
          outputPath,
        };

        // Lưu vào DB
        try {
          db.prepare(`
            INSERT INTO generated_videos (id, project_name, voice_path, output_path, status)
            VALUES (?, ?, ?, ?, 'completed')
          `).run(jobId, projectName, voicePath, outputPath);
        } catch (dbErr) {
          console.warn('[RenderRouter] Error saving to db:', dbErr);
        }
      })
      .catch((err) => {
        console.error('[RenderRouter] Render failed:', err);
        activeJobs[jobId] = {
          status: 'error',
          percent: 0,
          message: `Render thất bại: ${err.message}`,
          error: err.message,
        };
      });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Kiểm tra tiến độ Render
renderRouter.get('/status/:jobId', (req, res) => {
  const job = activeJobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy job render' });
  }
  res.json({ success: true, data: job });
});

// Mở thư mục chứa video xuất ra trên Windows Explorer (và highlight file video vừa xuất)
renderRouter.post('/open-folder', (req, res) => {
  try {
    const { filePath } = req.body;
    const defaultExportDir = process.env.EXPORT_DIR || path.resolve(process.cwd(), 'exports');

    let targetPath = defaultExportDir;
    if (filePath && typeof filePath === 'string' && filePath.trim() !== '') {
      if (fs.existsSync(filePath)) {
        targetPath = filePath;
      } else {
        const dir = path.dirname(filePath);
        if (fs.existsSync(dir)) {
          targetPath = dir;
        }
      }
    }

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    const resolved = path.resolve(targetPath);
    const isFile = fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory();

    if (isFile) {
      // Dùng PowerShell mở Explorer và chọn trực tiếp file (select file)
      const psCommand = `Start-Process explorer.exe -ArgumentList '/select,\`"${resolved.replace(/`/g, '``').replace(/"/g, '`"')}\`"'`;
      execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], (err) => {
        if (err) console.warn('[RenderRouter] Note on opening explorer select:', err.message);
      });
    } else {
      // Mở thư mục (open folder)
      const psCommand = `Start-Process explorer.exe -ArgumentList '\`"${resolved.replace(/`/g, '``').replace(/"/g, '`"')}\`"'`;
      execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], (err) => {
        if (err) console.warn('[RenderRouter] Note on opening explorer folder:', err.message);
      });
    }

    res.json({ success: true, message: 'Đã gửi lệnh mở thư mục Explorer', path: resolved });
  } catch (err: any) {
    console.error('[RenderRouter] Error opening folder:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mở video bằng trình xem mặc định của Windows
renderRouter.post('/open-video', (req, res) => {
  try {
    const { filePath } = req.body;
    let targetFile = filePath;

    if (!targetFile || !fs.existsSync(targetFile)) {
      const defaultExportDir = process.env.EXPORT_DIR || path.resolve(process.cwd(), 'exports');
      if (fs.existsSync(defaultExportDir)) {
        const files = fs.readdirSync(defaultExportDir)
          .filter((f) => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.mov'))
          .map((f) => ({ name: f, time: fs.statSync(path.join(defaultExportDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        if (files.length > 0) {
          targetFile = path.join(defaultExportDir, files[0].name);
        }
      }
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy file video xuất ra' });
    }

    const resolvedFile = path.resolve(targetFile);
    const psCommand = `Start-Process -FilePath \`"${resolvedFile.replace(/`/g, '``').replace(/"/g, '`"')}\`"`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], (err) => {
      if (err) console.warn('[RenderRouter] Note on opening video with default player:', err.message);
    });

    res.json({ success: true, message: 'Đã gửi lệnh phát video', filePath: resolvedFile });
  } catch (err: any) {
    console.error('[RenderRouter] Error playing video:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


