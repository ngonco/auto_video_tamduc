import { Router } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { renderFinalVideo, RenderRequest } from '../services/render-service.js';

export const renderRouter = Router();

// Lưu trữ trạng thái các job render trong bộ nhớ
const activeJobs: Record<string, { status: string; percent: number; message: string; outputPath?: string; error?: string }> = {};

// Bắt đầu Render
renderRouter.post('/start', async (req, res) => {
  try {
    const { videoId, projectName, voicePath, bgmPath, bgmVolume, voiceVolume, duckingVolume, clips, subtitles } = req.body;

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
    };

    renderFinalVideo(renderReq, (percent, message) => {
      activeJobs[jobId] = {
        status: percent >= 100 ? 'completed' : 'rendering',
        percent,
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
        db.prepare(`
          INSERT INTO generated_videos (id, project_name, voice_path, output_path, status)
          VALUES (?, ?, ?, ?, 'completed')
        `).run(jobId, projectName, voicePath, outputPath);
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

// Mở thư mục chứa video xuất ra trên Windows Explorer
renderRouter.post('/open-folder', (req, res) => {
  try {
    const { filePath } = req.body;
    const target = filePath ? path.dirname(filePath) : (process.env.EXPORT_DIR || path.resolve(process.cwd(), 'exports'));
    exec(`explorer.exe "${target}"`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
