import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { getVideoMetadata } from '../services/ffmpeg.js';

export const settingsRouter = Router();

// Đọc cấu hình hiện tại
settingsRouter.get('/', async (req, res) => {
  try {
    const configPath = path.resolve(process.cwd(), 'config.json');
    let configData: any = {};
    if (fs.existsSync(configPath)) {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    const maskKey = (key?: string) => {
      if (!key) return '';
      if (key.length <= 8) return '••••••••';
      return '••••••••' + key.slice(-4);
    };

    const defaultOutroPath = configData.defaultOutroPath || configData.defaults?.defaultOutroPath || '';
    const outroEnabled = configData.outroEnabled !== undefined 
      ? configData.outroEnabled 
      : (configData.defaults?.outroEnabled ?? true);
    let outroDuration = configData.outroDuration || configData.defaults?.outroDuration || 0;

    if (defaultOutroPath && fs.existsSync(defaultOutroPath)) {
      try {
        const meta = await getVideoMetadata(defaultOutroPath);
        outroDuration = meta.duration || 0;
      } catch (_) {}
    }

    res.json({
      success: true,
      data: {
        sttApiKey: maskKey(process.env.VILAO_STT_KEY || process.env.VILAO_API_KEY),
        subtitleApiKey: maskKey(process.env.VILAO_SUBTITLE_KEY || process.env.VILAO_API_KEY),
        embeddingApiKey: maskKey(process.env.VILAO_EMBEDDING_KEY || process.env.VILAO_API_KEY),
        baseUrl: process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1',
        sttModel: process.env.STT_MODEL || 'tsa/groq/whisper-large-v3',
        subtitleModel: process.env.SUBTITLE_FIX_MODEL || 'ts/gemini-3.1-flash-lite',
        visionModel: process.env.VISION_MODEL || 'ts/gemini-3.1-flash-lite',
        rootSourceDir: process.env.ROOT_SOURCE_DIR || '',
        exportDir: process.env.EXPORT_DIR || '',
        defaultOutroPath,
        outroEnabled,
        outroDuration,
        config: configData,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mở Native Folder Picker của Windows (Hỗ trợ Pinned Folders & Quick Access)
settingsRouter.post('/browse-folder', (req, res) => {
  try {
    const { initialPath } = req.body || {};
    const scriptPath = path.resolve(process.cwd(), 'server', 'utils', 'picker.ps1');
    const title = 'Chon Thu Muc (Click vao Thu Muc da Pin hoac Duyet roi nhan Open)';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, title, initialPath || ''],
      { windowsHide: false },
      (error: any, stdout: any, stderr: any) => {
        if (error) {
          console.error('[BrowseFolder] Error opening dialog:', error, stderr);
          return res.status(500).json({ success: false, error: 'Không thể mở hộp thoại: ' + error.message });
        }
        const selectedPath = (stdout || '').trim();
        res.json({
          success: true,
          selectedPath: selectedPath || null,
        });
      }
    );
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mở Native Video File Picker của Windows để chọn Outro Video
settingsRouter.post('/browse-video', (req, res) => {
  try {
    const { initialPath } = req.body || {};
    const scriptPath = path.resolve(process.cwd(), 'server', 'utils', 'video-picker.ps1');
    const title = 'Chon File Video Outro Co Dinh (.mp4, .mov, .mkv, .avi, .webm)';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, title, initialPath || ''],
      { windowsHide: false },
      async (error: any, stdout: any, stderr: any) => {
        if (error) {
          console.error('[BrowseVideo] Error opening dialog:', error, stderr);
          return res.status(500).json({ success: false, error: 'Không thể mở hộp thoại: ' + error.message });
        }

        const selectedPath = (stdout || '').trim();
        if (!selectedPath || !fs.existsSync(selectedPath)) {
          return res.json({ success: true, selectedPath: null });
        }

        let duration = 0;
        try {
          const meta = await getVideoMetadata(selectedPath);
          duration = meta.duration || 0;
        } catch (_) {}

        res.json({
          success: true,
          selectedPath,
          fileName: path.basename(selectedPath),
          duration,
        });
      }
    );
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lưu cấu hình
settingsRouter.post('/', (req, res) => {
  try {
    const {
      sttApiKey,
      subtitleApiKey,
      embeddingApiKey,
      baseUrl,
      rootSourceDir,
      exportDir,
      config,
    } = req.body;

    // Cập nhật .env
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    if (sttApiKey && !sttApiKey.includes('••••')) {
      process.env.VILAO_STT_KEY = sttApiKey;
      envContent = updateEnvKey(envContent, 'VILAO_STT_KEY', sttApiKey);
    }
    if (subtitleApiKey && !subtitleApiKey.includes('••••')) {
      process.env.VILAO_SUBTITLE_KEY = subtitleApiKey;
      envContent = updateEnvKey(envContent, 'VILAO_SUBTITLE_KEY', subtitleApiKey);
    }
    if (embeddingApiKey && !embeddingApiKey.includes('••••')) {
      process.env.VILAO_EMBEDDING_KEY = embeddingApiKey;
      envContent = updateEnvKey(envContent, 'VILAO_EMBEDDING_KEY', embeddingApiKey);
    }
    if (baseUrl) {
      process.env.VILAO_BASE_URL = baseUrl;
      envContent = updateEnvKey(envContent, 'VILAO_BASE_URL', baseUrl);
    }
    if (rootSourceDir) {
      process.env.ROOT_SOURCE_DIR = rootSourceDir;
      envContent = updateEnvKey(envContent, 'ROOT_SOURCE_DIR', rootSourceDir);
    }
    if (exportDir) {
      process.env.EXPORT_DIR = exportDir;
      envContent = updateEnvKey(envContent, 'EXPORT_DIR', exportDir);
    }

    fs.writeFileSync(envPath, envContent, 'utf-8');

    // Cập nhật config.json nếu có
    if (config) {
      const configPath = path.resolve(process.cwd(), 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }

    res.json({ success: true, message: 'Đã lưu cấu hình hệ thống thành công' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function updateEnvKey(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return content + `\n${key}=${value}`;
}
