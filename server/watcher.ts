import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import { getVideoMetadata, extractKeyframes } from './services/ffmpeg.js';
import { analyzeVideoFrames } from './services/vision-analyzer.js';

export const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'];
export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
export const MEDIA_EXTS = [...VIDEO_EXTS, ...IMAGE_EXTS];

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

export class FolderWatcherService {
  private watcher: any = null;
  public onNewProjectDetected?: (project: any) => void;

  public start(rootDir: string) {
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    console.log(`[Watcher] Starting hybrid watcher on: ${rootDir}`);
    this.watcher = chokidar.watch(rootDir, {
      depth: 2,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 1500,
        pollInterval: 200,
      },
    });

    this.watcher.on('add', (filePath: string) => this.handleFileAdded(filePath, rootDir));
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleFileAdded(filePath: string, rootDir: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (!MEDIA_EXTS.includes(ext)) return;


    // Xác định thư mục công trình (subfolder trực tiếp dưới rootDir)
    const relative = path.relative(rootDir, filePath);
    const parts = relative.split(path.sep);
    if (parts.length < 2) return; // File ở root ngoài cùng, không nằm trong subfolder công trình

    const folderName = parts[0];
    const folderPath = path.join(rootDir, folderName);
    const fileName = path.basename(filePath);

    try {
      // 1. Kiểm tra hoặc tạo Project trong DB
      let project: any = db.prepare('SELECT * FROM projects WHERE folder_name = ?').get(folderName);
      if (!project) {
        const projectId = `proj_${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO projects (id, folder_name, folder_path, total_videos, is_embedded, last_scanned_at)
          VALUES (?, ?, ?, 1, 0, datetime('now'))
        `).run(projectId, folderName, folderPath);

        project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        console.log(`[Watcher] New Project Detected: ${folderName}`);

        if (this.onNewProjectDetected) {
          this.onNewProjectDetected(project);
        }
      }

      // 2. Kiểm tra xem Video đã có trong DB chưa
      const existingVideo = db.prepare('SELECT id FROM video_sources WHERE file_path = ?').get(filePath);
      if (!existingVideo) {
        const videoId = `vid_${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO video_sources (id, project_id, file_name, file_path, is_analyzed)
          VALUES (?, ?, ?, ?, 0)
        `).run(videoId, project.id, fileName, filePath);

        // Cập nhật tổng số video của project
        const total = (db.prepare('SELECT COUNT(*) as count FROM video_sources WHERE project_id = ?').get(project.id) as any).count;
        db.prepare('UPDATE projects SET total_videos = ?, last_scanned_at = datetime(\'now\') WHERE id = ?').run(total, project.id);
      }
    } catch (err) {
      console.error('[Watcher] Error recording video file:', err);
    }
  }

  /**
   * Quét và Nhúng AI cho 1 Project (Hybrid trigger khi người dùng đồng ý)
   */
  public async scanAndEmbedProject(projectId: string, onProgress?: (percent: number, message: string) => void): Promise<void> {
    const project: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) throw new Error('Không tìm thấy công trình này');

    // 1. Tự động đồng bộ các file từ ổ đĩa vào DB nếu thư mục tồn tại
    if (fs.existsSync(project.folder_path)) {
      const mediaFiles: string[] = [];
      const scanDir = (dir: string, depth = 0) => {
        if (depth > 2) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(full, depth + 1);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (MEDIA_EXTS.includes(ext)) {
                mediaFiles.push(full);
              }
            }
          }
        } catch (_) {}
      };

      scanDir(project.folder_path);

      for (const filePath of mediaFiles) {
        const fileName = path.basename(filePath);
        const existing = db.prepare('SELECT id FROM video_sources WHERE file_path = ?').get(filePath);
        if (!existing) {
          const videoId = `vid_${uuidv4().slice(0, 8)}`;
          db.prepare(`
            INSERT INTO video_sources (id, project_id, file_name, file_path, is_analyzed)
            VALUES (?, ?, ?, ?, 0)
          `).run(videoId, project.id, fileName, filePath);
        }
      }

      if (mediaFiles.length > 0) {
        const placeholders = mediaFiles.map(() => '?').join(',');
        db.prepare(`DELETE FROM video_sources WHERE project_id = ? AND file_path NOT IN (${placeholders})`).run(project.id, ...mediaFiles);
      }
    }

    const videos: any[] = db.prepare('SELECT * FROM video_sources WHERE project_id = ?').all(projectId);
    if (videos.length === 0) {
      throw new Error(`Công trình "${project.folder_name}" không có file video/ảnh nào để phân tích.`);
    }

    // Cập nhật tổng số video
    db.prepare('UPDATE projects SET total_videos = ? WHERE id = ?').run(videos.length, projectId);

    let completed = 0;
    const stageCounts: Record<string, number> = {};

    if (onProgress) {
      onProgress(5, `Bắt đầu phân tích AI cho ${videos.length} media clips...`);
    }

    // 2. Chạy phân tích AI song song 4 luồng (Concurrency Pool)
    await runWithConcurrency(videos, 4, async (video) => {
      try {
        // Đo đạc metadata
        const meta = await getVideoMetadata(video.file_path);

        // Trích xuất 2-3 frame ảnh đại diện
        const { framePaths, thumbnailPath } = await extractKeyframes(video.file_path, video.id, meta.duration);

        // Gọi AI Vision phân tích cảnh (chỉ gửi frame ảnh)
        const analysis = await analyzeVideoFrames(framePaths);

        // Lưu vào DB
        db.prepare(`
          UPDATE video_sources 
          SET duration = ?, width = ?, height = ?, aspect_ratio_type = ?,
              stage = ?, aesthetic_score = ?, scene_description = ?,
              thumbnail_path = ?, is_analyzed = 1
          WHERE id = ?
        `).run(
          meta.duration,
          meta.width,
          meta.height,
          meta.aspectRatioType,
          analysis.stage,
          analysis.aestheticScore,
          analysis.description,
          thumbnailPath,
          video.id
        );

        stageCounts[analysis.stage] = (stageCounts[analysis.stage] || 0) + 1;
      } catch (err) {
        console.error(`[Watcher] Error embedding video ${video.file_name}:`, err);
      }

      completed++;
      if (onProgress) {
        const pct = 5 + Math.round((completed / videos.length) * 90);
        onProgress(Math.min(95, pct), `Đang phân tích AI clip ${completed}/${videos.length}: ${video.file_name}`);
      }
    });

    // 3. Đánh dấu project đã nhúng xong
    db.prepare(`
      UPDATE projects 
      SET is_embedded = 1, stage_summary = ?, last_scanned_at = datetime('now') 
      WHERE id = ?
    `).run(JSON.stringify(stageCounts), projectId);

    if (onProgress) {
      onProgress(100, 'Đã hoàn tất phân tích toàn bộ công trình!');
    }
  }

  /**
   * Nhập một thư mục công trình tùy chọn bất kỳ từ máy và tự động quét/nhúng AI
   */
  public async importAndScanCustomFolder(folderPath: string, onProgress?: (percent: number, message: string) => void): Promise<any> {
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Thư mục không tồn tại: ${folderPath}`);
    }

    const folderName = path.basename(folderPath) || 'CongTrinh_' + Date.now();

    // 1. Quét tìm tất cả các file video/ảnh trong thư mục
    const mediaFiles: string[] = [];
    const scanDir = (dir: string, depth = 0) => {
      if (depth > 2) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (MEDIA_EXTS.includes(ext)) {
            mediaFiles.push(full);
          }
        }
      }
    };

    scanDir(folderPath);

    if (mediaFiles.length === 0) {
      throw new Error(`Thư mục "${folderName}" không chứa file video/ảnh hợp lệ (.mp4, .mov, .mkv, .avi, .webm, .jpg, .png, .webp)`);
    }

    // 2. Tạo hoặc lấy Project trong Database
    let project: any = db.prepare('SELECT * FROM projects WHERE folder_path = ?').get(folderPath);
    if (!project) {
      const projectId = `proj_${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO projects (id, folder_name, folder_path, total_videos, is_embedded, last_scanned_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `).run(projectId, folderName, folderPath, mediaFiles.length);

      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    } else {
      db.prepare('UPDATE projects SET total_videos = ?, last_scanned_at = datetime(\'now\') WHERE id = ?').run(mediaFiles.length, project.id);
    }

    // 3. Xóa các file cũ đã bị xóa khỏi ổ đĩa
    const placeholders = mediaFiles.map(() => '?').join(',');
    db.prepare(`DELETE FROM video_sources WHERE project_id = ? AND file_path NOT IN (${placeholders})`).run(project.id, ...mediaFiles);

    // 4. Ghi nhận các file media mới vào bảng video_sources
    for (const filePath of mediaFiles) {
      const fileName = path.basename(filePath);
      const existing = db.prepare('SELECT id FROM video_sources WHERE file_path = ?').get(filePath);
      if (!existing) {
        const videoId = `vid_${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO video_sources (id, project_id, file_name, file_path, is_analyzed)
          VALUES (?, ?, ?, ?, 0)
        `).run(videoId, project.id, fileName, filePath);
      }
    }


    // 4. Tự động chạy tiến trình phân tích AI 4 giai đoạn
    await this.scanAndEmbedProject(project.id, onProgress);

    return db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  }
}

export const folderWatcher = new FolderWatcherService();
