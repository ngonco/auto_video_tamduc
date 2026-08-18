import path from 'path';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath || '').toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

export interface SourceClipRecord {
  id: string;
  projectId: string;
  fileName: string;
  filePath: string;
  duration: number;
  width: number;
  height: number;
  aspectRatioType: '9:16' | '16:9' | 'other';
  stage: 'STAGE_1_RAW_CARPENTRY' | 'STAGE_2_ASSEMBLY_FINISHING' | 'STAGE_3_DECOR_FLOWERS' | 'STAGE_4_WORSHIP_ALTAR';
  aestheticScore: number;
  sceneDescription: string;
  thumbnailPath: string;
  mediaType?: 'video' | 'image';
}

export interface TimelineClipItem {
  id: string;
  sourceId: string;
  fileName: string;
  filePath: string;
  thumbnailPath: string;
  stage: string;
  timelineStart: number; // Thời điểm bắt đầu trên timeline tổng (giây)
  timelineEnd: number;   // Thời điểm kết thúc trên timeline tổng (giây)
  sourceStart: number;   // Điểm cắt đầu trong file gốc (giây)
  sourceDuration: number;// Thời lượng của đoạn cắt (giây)
  aspectRatioType: '9:16' | '16:9' | 'other';
  mediaType?: 'video' | 'image';
}

export interface StorylineGenerationResult {
  totalDuration: number;
  clips: TimelineClipItem[];
}

/**
 * Thuật toán phân bổ clip 4 giai đoạn tự động, chuẩn tiến trình không gian thờ Phật:
 * - 0% - 20%: Stage 1 (Thi công thô / Khung tủ)
 * - 20% - 50%: Stage 2 (Lắp ráp hoàn thiện / Vách ngăn CNC)
 * - 50% - 75%: Stage 3 (Cắm hoa sen, hoa huệ, bày mâm bồng, tượng Phật)
 * - 75% - 100%: Stage 4 (Bật đèn hào quang sáng rực, không gian thờ trang nghiêm, lễ Phật)
 */
export function generateStoryline(
  sourceClips: SourceClipRecord[],
  targetDuration: number,
  minClipSec: number = 4.0,
  maxClipSec: number = 5.5
): StorylineGenerationResult {
  if (!sourceClips || sourceClips.length === 0 || targetDuration <= 0) {
    return { totalDuration: targetDuration, clips: [] };
  }

  // 1. Chuẩn hóa danh sách source clips
  const normalizedSources: SourceClipRecord[] = sourceClips.map((s: any) => ({
    id: s.id,
    projectId: s.projectId || s.project_id,
    fileName: s.fileName || s.file_name,
    filePath: s.filePath || s.file_path,
    duration: Number(s.duration) || 5.0,
    width: Number(s.width) || 1080,
    height: Number(s.height) || 1920,
    aspectRatioType: s.aspectRatioType || s.aspect_ratio_type || '9:16',
    stage: s.stage || 'STAGE_2_ASSEMBLY_FINISHING',
    aestheticScore: Number(s.aestheticScore ?? s.aesthetic_score ?? 7.5),
    sceneDescription: s.sceneDescription || s.scene_description || '',
    thumbnailPath: s.thumbnailPath || s.thumbnail_path || '',
    mediaType: s.mediaType || (isImageFile(s.filePath || s.file_path) ? 'image' : 'video'),
  }));

  // 2. Nhóm source theo 4 giai đoạn
  const clipsByStage: Record<string, SourceClipRecord[]> = {
    STAGE_1_RAW_CARPENTRY: [],
    STAGE_2_ASSEMBLY_FINISHING: [],
    STAGE_3_DECOR_FLOWERS: [],
    STAGE_4_WORSHIP_ALTAR: [],
  };

  normalizedSources.forEach((clip) => {
    const stage = clip.stage || 'STAGE_2_ASSEMBLY_FINISHING';
    if (!clipsByStage[stage]) {
      clipsByStage[stage] = [];
    }
    clipsByStage[stage].push(clip);
  });

  // Sắp xếp trong từng stage theo điểm thẩm mỹ (aestheticScore) giảm dần
  Object.keys(clipsByStage).forEach((stageKey) => {
    clipsByStage[stageKey].sort((a, b) => (b.aestheticScore || 0) - (a.aestheticScore || 0));
  });

  // 3. Tính số lượng clip cần thiết để lấp đầy targetDuration
  const idealClipDur = Math.max(minClipSec, Math.min(maxClipSec, 5.0));
  const estimatedClipsCount = Math.max(1, Math.round(targetDuration / idealClipDur));
  const exactClipDur = targetDuration / estimatedClipsCount;

  const timelineClips: TimelineClipItem[] = [];
  let currentTimelineTime = 0;
  let clipIndexCounter = 1;
  let lastUsedSourceId = '';
  const videoUsageCount: Record<string, number> = {};
  const stageCursors: Record<string, number> = {
    STAGE_1_RAW_CARPENTRY: 0,
    STAGE_2_ASSEMBLY_FINISHING: 0,
    STAGE_3_DECOR_FLOWERS: 0,
    STAGE_4_WORSHIP_ALTAR: 0,
  };

  for (let clipIdx = 0; clipIdx < estimatedClipsCount; clipIdx++) {
    // Xác định thời lượng cho clip này
    let cutDuration = exactClipDur;
    if (clipIdx === estimatedClipsCount - 1) {
      // Clip cuối cùng gánh toàn bộ phần dư còn lại để khớp 100% targetDuration
      cutDuration = Math.max(0.1, targetDuration - currentTimelineTime);
    }

    const progressRatio = (currentTimelineTime + cutDuration / 2) / targetDuration;

    // Xác định stage ưu tiên theo tiến trình thời gian
    let preferredStage: 'STAGE_1_RAW_CARPENTRY' | 'STAGE_2_ASSEMBLY_FINISHING' | 'STAGE_3_DECOR_FLOWERS' | 'STAGE_4_WORSHIP_ALTAR';
    if (progressRatio <= 0.20) {
      preferredStage = 'STAGE_1_RAW_CARPENTRY';
    } else if (progressRatio <= 0.50) {
      preferredStage = 'STAGE_2_ASSEMBLY_FINISHING';
    } else if (progressRatio <= 0.75) {
      preferredStage = 'STAGE_3_DECOR_FLOWERS';
    } else {
      preferredStage = 'STAGE_4_WORSHIP_ALTAR';
    }

    // Tìm danh sách ứng viên từ stage ưu tiên, nếu trống thì tìm các stage lân cận
    let candidates = clipsByStage[preferredStage];
    if (!candidates || candidates.length === 0) {
      if (preferredStage === 'STAGE_1_RAW_CARPENTRY') {
        candidates = clipsByStage['STAGE_2_ASSEMBLY_FINISHING'].length > 0
          ? clipsByStage['STAGE_2_ASSEMBLY_FINISHING']
          : normalizedSources;
      } else if (preferredStage === 'STAGE_4_WORSHIP_ALTAR') {
        candidates = clipsByStage['STAGE_3_DECOR_FLOWERS'].length > 0
          ? clipsByStage['STAGE_3_DECOR_FLOWERS']
          : (clipsByStage['STAGE_2_ASSEMBLY_FINISHING'].length > 0 ? clipsByStage['STAGE_2_ASSEMBLY_FINISHING'] : normalizedSources);
      } else {
        candidates = normalizedSources;
      }
    }

    // Chọn candidate tốt nhất, tránh lặp liền kề với clip trước nếu có >= 2 clip trong pool
    let candidate = candidates[0];
    const cursor = stageCursors[preferredStage] || 0;
    if (candidates.length > 1) {
      let chosenIdx = cursor % candidates.length;
      if (candidates[chosenIdx].id === lastUsedSourceId) {
        chosenIdx = (chosenIdx + 1) % candidates.length;
      }
      candidate = candidates[chosenIdx];
      stageCursors[preferredStage] = chosenIdx + 1;
    } else {
      candidate = candidates[0];
    }

    lastUsedSourceId = candidate.id;

    const isImg = candidate.mediaType === 'image' || isImageFile(candidate.filePath);
    let sourceStart = 0;

    if (!isImg && candidate.duration > cutDuration) {
      // Đối với video dài: mỗi lần lặp lại sẽ cắt ở một phân đoạn thời gian khác nhau
      const usageIndex = videoUsageCount[candidate.id] || 0;
      videoUsageCount[candidate.id] = usageIndex + 1;

      const maxStart = Math.max(0, candidate.duration - cutDuration);
      const step = maxStart > 0 ? maxStart / 3 : 0;
      sourceStart = Math.min(maxStart, (usageIndex * step) % (maxStart + 0.1));
    }

    const tStart = Number(currentTimelineTime.toFixed(2));
    const tEnd = Number((currentTimelineTime + cutDuration).toFixed(2));

    timelineClips.push({
      id: `clip_${clipIndexCounter++}`,
      sourceId: candidate.id,
      fileName: candidate.fileName,
      filePath: candidate.filePath,
      thumbnailPath: candidate.thumbnailPath,
      stage: candidate.stage,
      timelineStart: tStart,
      timelineEnd: tEnd,
      sourceStart: Number(sourceStart.toFixed(2)),
      sourceDuration: Number(cutDuration.toFixed(2)),
      aspectRatioType: candidate.aspectRatioType,
      mediaType: isImg ? 'image' : 'video',
    });

    currentTimelineTime += cutDuration;
  }

  // Đảm bảo clip cuối cùng chạm chính xác 100% targetDuration
  if (timelineClips.length > 0) {
    const last = timelineClips[timelineClips.length - 1];
    last.timelineEnd = Number(targetDuration.toFixed(2));
    last.sourceDuration = Number((last.timelineEnd - last.timelineStart).toFixed(2));
  }

  return {
    totalDuration: Number(targetDuration.toFixed(2)),
    clips: timelineClips,
  };
}
