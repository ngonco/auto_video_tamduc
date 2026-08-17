import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'database');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'library.db');
export const db = new Database(DB_PATH);

// Bật WAL mode để đọc ghi nhanh, không bị lock
db.pragma('journal_mode = WAL');

// Khởi tạo Lược đồ Bảng Tinh Gọn
db.exec(`
  -- 1. Bảng quản lý các Folder Công trình (Folder con trong Root)
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    folder_name TEXT NOT NULL UNIQUE,
    folder_path TEXT NOT NULL,
    total_videos INTEGER DEFAULT 0,
    is_embedded INTEGER DEFAULT 0,
    stage_summary TEXT, -- JSON summary of stages
    last_scanned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 2. Bảng quản lý từng Clip trong Công trình
  CREATE TABLE IF NOT EXISTS video_sources (
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 3. Bảng lưu lịch sử các Video đã sinh
  CREATE TABLE IF NOT EXISTS generated_videos (
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
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 5. Bảng ghi nhớ danh sách Voice đã nạp (Lịch sử Voice)
  CREATE TABLE IF NOT EXISTS voices (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    duration REAL DEFAULT 0,
    stt_text TEXT,
    raw_words_json TEXT,
    subtitles_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log(`[Database] SQLite connected successfully at: ${DB_PATH}`);
