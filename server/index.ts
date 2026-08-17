import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { libraryRouter } from './routes/library.routes.js';
import { generatorRouter } from './routes/generator.routes.js';
import { renderRouter } from './routes/render.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { folderWatcher } from './watcher.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static media folders
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const THUMBS_DIR = path.join(CACHE_DIR, 'thumbnails');
const FRAMES_DIR = path.join(CACHE_DIR, 'frames');
const UPLOADS_DIR = path.join(CACHE_DIR, 'uploads');
const BGM_DIR = path.resolve(process.cwd(), 'assets', 'bgm');
const DEFAULT_EXPORT_DIR = path.resolve(process.cwd(), 'exports');

[THUMBS_DIR, FRAMES_DIR, UPLOADS_DIR, BGM_DIR, DEFAULT_EXPORT_DIR].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn(`[Server] Note creating static dir ${dir}:`, e);
  }
});

let exportStaticDir = DEFAULT_EXPORT_DIR;
if (process.env.EXPORT_DIR) {
  try {
    if (!fs.existsSync(process.env.EXPORT_DIR)) {
      fs.mkdirSync(process.env.EXPORT_DIR, { recursive: true });
    }
    exportStaticDir = process.env.EXPORT_DIR;
  } catch (_) {
    exportStaticDir = DEFAULT_EXPORT_DIR;
  }
}

app.use('/media/thumbnails', express.static(THUMBS_DIR));
app.use('/media/frames', express.static(FRAMES_DIR));
app.use('/media/uploads', express.static(UPLOADS_DIR));
app.use('/media/bgm', express.static(BGM_DIR));
app.use('/media/exports', express.static(exportStaticDir));

// Video streaming endpoint với HTTP Range support (hỗ trợ preview mượt mà trên browser/remotion player)
app.get('/media/stream', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('Video file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.mp3') contentType = 'audio/mpeg';
  else if (ext === '.wav') contentType = 'audio/wav';
  else if (ext === '.m4a') contentType = 'audio/mp4';
  else if (ext === '.mov') contentType = 'video/quicktime';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.bmp') contentType = 'image/bmp';


  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Mount Routes
app.use('/api/library', libraryRouter);
app.use('/api/generator', generatorRouter);
app.use('/api/render', renderRouter);
app.use('/api/settings', settingsRouter);

// Root test
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'Auto Video Tâm Đức Server', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 AUTO VIDEO TÂM ĐỨC BACKEND SERVER RUNNING`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`==================================================\n`);

  // Bắt đầu Watcher nếu có cấu hình ROOT_SOURCE_DIR
  const rootSource = process.env.ROOT_SOURCE_DIR;
  if (rootSource) {
    folderWatcher.start(rootSource);
  }
});
