import path from 'path';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath || '').toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

export interface SourceClipRecord {
  id: string;
  projectId: string;
  projectName?: string;
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
  usageCount?: number;
  lastUsedAt?: string;
}

export interface TimelineClipItem {
  id: string;
  sourceId: string;
  projectId?: string;
  projectName?: string;
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
  mode?: 'single' | 'all';
}

export interface StorylineOptions {
  mode?: 'single' | 'all';
  minClipSec?: number;
  maxClipSec?: number;
}

/**
 * Sắp xếp pool candidates theo các tiêu chí ưu tiên:
 * 1. Video trước, Ảnh tĩnh sau
 * 2. usageCount ASC (ít dùng nhất lên đầu để video luôn tươi mới)
 * 3. aestheticScore DESC (điểm thẩm mỹ cao nhất)
 * 4. 9:16 trước 16:9
 */
function sortStageCandidates(candidates: SourceClipRecord[]): SourceClipRecord[] {
  const videos = candidates.filter((c) => c.mediaType === 'video' && !isImageFile(c.filePath));
  const images = candidates.filter((c) => c.mediaType === 'image' || isImageFile(c.filePath));

  const sorter = (a: SourceClipRecord, b: SourceClipRecord) => {
    // 1. usageCount thấp hơn lên trước
    const usageA = a.usageCount || 0;
    const usageB = b.usageCount || 0;
    if (usageA !== usageB) return usageA - usageB;

    // 2. Điểm thẩm mỹ cao hơn lên trước
    const scoreA = a.aestheticScore || 7.5;
    const scoreB = b.aestheticScore || 7.5;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // 3. Tỷ lệ 9:16 ưu tiên trước
    const is916A = a.aspectRatioType === '9:16' ? 1 : 0;
    const is916B = b.aspectRatioType === '9:16' ? 1 : 0;
    return is916B - is916A;
  };

  videos.sort(sorter);
  images.sort(sorter);

  return [...videos, ...images];
}

/**
 * Thuật toán phân bổ clip 4 giai đoạn tự động kèm cơ chế chống trùng lặp vừa phải:
 * - 0% - 20%: Stage 1 (Thi công thô / Khung tủ)
 * - 20% - 50%: Stage 2 (Lắp ráp hoàn thiện / Vách ngăn CNC)
 * - 50% - 75%: Stage 3 (Cắm hoa sen, hoa huệ, bày mâm bồng, tượng Phật)
 * - 75% - 100%: Stage 4 (Bật đèn hào quang sáng rực, không gian thờ trang nghiêm, lễ Phật)
 */
export function generateStoryline(
  sourceClips: SourceClipRecord[],
  targetDuration: number,
  optionsOrMinSec: StorylineOptions | number = 4.0,
  maxClipSecArg: number = 5.5
): StorylineGenerationResult {
  let mode: 'single' | 'all' = 'single';
  let minClipSec = 4.0;
  let maxClipSec = 5.5;

  if (typeof optionsOrMinSec === 'object' && optionsOrMinSec !== null) {
    mode = optionsOrMinSec.mode || 'single';
    minClipSec = optionsOrMinSec.minClipSec || 4.0;
    maxClipSec = optionsOrMinSec.maxClipSec || 5.5;
  } else {
    minClipSec = typeof optionsOrMinSec === 'number' ? optionsOrMinSec : 4.0;
    maxClipSec = maxClipSecArg || 5.5;
  }

  if (!sourceClips || sourceClips.length === 0 || targetDuration <= 0) {
    return { totalDuration: targetDuration, clips: [], mode };
  }

  // 1. Chuẩn hóa danh sách source clips
  const normalizedSources: SourceClipRecord[] = sourceClips.map((s: any) => ({
    id: s.id,
    projectId: s.projectId || s.project_id || '',
    projectName: s.projectName || s.project_name || s.folder_name || '',
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
    usageCount: Number(s.usageCount ?? s.usage_count ?? 0),
    lastUsedAt: s.lastUsedAt || s.last_used_at || '',
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

  // Sắp xếp trong từng stage theo thứ tự ưu tiên: Video trước -> Usage ít trước -> Thẩm mỹ cao -> 9:16
  Object.keys(clipsByStage).forEach((stageKey) => {
    clipsByStage[stageKey] = sortStageCandidates(clipsByStage[stageKey]);
  });

  // 3. Phân bổ clip động (Dynamic Duration Accumulator) - Tuyệt đối không đứng hình (No-Freeze Frame)
  const idealClipDur = Math.max(minClipSec, Math.min(maxClipSec, 5.0));

  const timelineClips: TimelineClipItem[] = [];
  let currentTimelineTime = 0;
  let clipIndexCounter = 1;
  let lastUsedSourceId = '';
  let lastUsedProjectId = '';
  const videoUsageCount: Record<string, number> = {};
  const stageCursors: Record<string, number> = {
    STAGE_1_RAW_CARPENTRY: 0,
    STAGE_2_ASSEMBLY_FINISHING: 0,
    STAGE_3_DECOR_FLOWERS: 0,
    STAGE_4_WORSHIP_ALTAR: 0,
  };

  let maxIterations = 200; // Bảo vệ chống vòng lặp vô tận

  while (currentTimelineTime < targetDuration - 0.05 && maxIterations-- > 0) {
    const remainingTime = Number((targetDuration - currentTimelineTime).toFixed(2));
    if (remainingTime <= 0.05) break;

    const progressRatio = (currentTimelineTime + Math.min(remainingTime, idealClipDur) / 2) / targetDuration;

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

    // Lọc và chọn candidate tối ưu chống trùng lặp vừa phải:
    let availableCandidates = candidates.filter((c) => c.id !== lastUsedSourceId);
    if (availableCandidates.length === 0) {
      availableCandidates = candidates; // Fallback nếu pool chỉ có duy nhất 1 clip
    }

    if (availableCandidates.length > 1 && lastUsedProjectId) {
      const diffProj = availableCandidates.filter((c) => c.projectId && c.projectId !== lastUsedProjectId);
      if (diffProj.length > 0) {
        availableCandidates = diffProj;
      }
    }

    // Chọn candidate theo cursor xoay vòng trong pool
    const cursor = stageCursors[preferredStage] || 0;
    const chosenIdx = cursor % availableCandidates.length;
    const candidate = availableCandidates[chosenIdx];
    stageCursors[preferredStage] = chosenIdx + 1;

    lastUsedSourceId = candidate.id;
    if (candidate.projectId) {
      lastUsedProjectId = candidate.projectId;
    }

    const isImg = candidate.mediaType === 'image' || isImageFile(candidate.filePath);
    let sourceStart = 0;
    let clipDuration = idealClipDur;

    if (isImg) {
      // Đối với ảnh tĩnh: gán thời lượng chuẩn (4.0 - 5.5s) hoặc phần thời lượng còn lại nếu sắp hết
      clipDuration = Math.min(remainingTime, idealClipDur);
      if (remainingTime > idealClipDur && remainingTime < idealClipDur + minClipSec) {
        clipDuration = remainingTime / 2;
      }
      sourceStart = 0;
    } else {
      // Đối với Video:
      const videoDuration = Math.max(0.5, candidate.duration);

      if (videoDuration <= minClipSec) {
        // [QUY TẮC NO-FREEZE 1]: Video ngắn (ví dụ 1.5s - 3.8s) -> Dùng đúng thời lượng thật của video, không kéo dài gây đứng hình
        clipDuration = Math.min(remainingTime, videoDuration);
        sourceStart = 0;
      } else {
        // [QUY TẮC NO-FREEZE 2]: Video dài -> Cắt đoạn chuẩn 4.0s - 5.5s và tịnh tiến điểm bắt đầu
        let targetSlice = idealClipDur;
        if (remainingTime <= maxClipSec) {
          targetSlice = remainingTime;
        } else if (remainingTime < idealClipDur + minClipSec) {
          targetSlice = remainingTime / 2;
        }

        const maxStart = Math.max(0, videoDuration - targetSlice);
        if (maxStart > 0) {
          const usageIndex = videoUsageCount[candidate.id] || 0;
          videoUsageCount[candidate.id] = usageIndex + 1;
          sourceStart = (usageIndex * targetSlice) % (maxStart + 0.1);
          if (sourceStart > maxStart) sourceStart = maxStart;
        } else {
          sourceStart = 0;
        }

        const maxAvailable = videoDuration - sourceStart;
        clipDuration = Math.min(remainingTime, targetSlice, maxAvailable);
      }
    }

    // Làm tròn thời lượng
    clipDuration = Math.max(0.5, Number(clipDuration.toFixed(2)));

    const tStart = Number(currentTimelineTime.toFixed(2));
    const tEnd = Number((currentTimelineTime + clipDuration).toFixed(2));

    timelineClips.push({
      id: `clip_${clipIndexCounter++}`,
      sourceId: candidate.id,
      projectId: candidate.projectId,
      projectName: candidate.projectName,
      fileName: candidate.fileName,
      filePath: candidate.filePath,
      thumbnailPath: candidate.thumbnailPath,
      stage: candidate.stage,
      timelineStart: tStart,
      timelineEnd: tEnd,
      sourceStart: Number(sourceStart.toFixed(2)),
      sourceDuration: Number(clipDuration.toFixed(2)),
      aspectRatioType: candidate.aspectRatioType,
      mediaType: isImg ? 'image' : 'video',
    });

    currentTimelineTime += clipDuration;
  }

  // Đảm bảo clip cuối cùng khớp chính xác 100% targetDuration
  if (timelineClips.length > 0) {
    const last = timelineClips[timelineClips.length - 1];
    const diff = Number((targetDuration - last.timelineEnd).toFixed(2));
    if (Math.abs(diff) > 0.05) {
      const sourceMatch = normalizedSources.find((s) => s.id === last.sourceId);
      const isImg = last.mediaType === 'image';
      const maxSrcDur = sourceMatch?.duration || 10;
      const canExtend = isImg || (last.sourceStart + (last.sourceDuration + diff) <= maxSrcDur);

      if (canExtend) {
        last.timelineEnd = Number(targetDuration.toFixed(2));
        last.sourceDuration = Number((last.timelineEnd - last.timelineStart).toFixed(2));
      } else {
        const nextCandidate = normalizedSources.find((s) => s.id !== last.sourceId) || normalizedSources[0];
        const extraStart = 0;
        const extraDur = Math.max(0.5, targetDuration - last.timelineEnd);
        timelineClips.push({
          id: `clip_${clipIndexCounter++}`,
          sourceId: nextCandidate.id,
          projectId: nextCandidate.projectId,
          projectName: nextCandidate.projectName,
          fileName: nextCandidate.fileName,
          filePath: nextCandidate.filePath,
          thumbnailPath: nextCandidate.thumbnailPath,
          stage: nextCandidate.stage,
          timelineStart: last.timelineEnd,
          timelineEnd: Number(targetDuration.toFixed(2)),
          sourceStart: extraStart,
          sourceDuration: Number(extraDur.toFixed(2)),
          aspectRatioType: nextCandidate.aspectRatioType,
          mediaType: nextCandidate.mediaType,
        });
      }
    }
  }

  return {
    totalDuration: Number(targetDuration.toFixed(2)),
    clips: timelineClips,
    mode,
  };
}

/**
 * Hàm tự động bù và cân bằng lại các clips trên timeline khi xóa/sửa clip,
 * đảm bảo mọi clip luôn duy trì thời lượng 4.0s - 5.5s (tối đa 6.0s).
 */
export function rebalanceTimelineClips(
  currentClips: TimelineClipItem[],
  availableSources: SourceClipRecord[],
  totalDuration: number,
  minClipSec: number = 4.0,
  maxClipSec: number = 5.5
): TimelineClipItem[] {
  if (totalDuration <= 0) return currentClips;

  // Nếu không còn clip nào, tự sinh lại toàn bộ từ availableSources
  if (!currentClips || currentClips.length === 0) {
    if (availableSources && availableSources.length > 0) {
      return generateStoryline(availableSources, totalDuration, { minClipSec, maxClipSec }).clips;
    }
    return [];
  }

  const idealClipDur = Math.max(minClipSec, Math.min(maxClipSec, 5.0));
  let neededCount = Math.max(1, Math.ceil(totalDuration / maxClipSec));
  if (totalDuration / neededCount < minClipSec && neededCount > 1) {
    neededCount = Math.max(1, Math.round(totalDuration / idealClipDur));
  }

  // Nếu số clip hiện tại ít hơn neededCount (do người dùng xóa bớt), ta bù thêm clip từ availableSources
  let workingClips = [...currentClips];
  const pool = availableSources && availableSources.length > 0 ? availableSources : currentClips.map((c) => ({
    id: c.sourceId || c.id,
    projectId: c.projectId || '',
    projectName: c.projectName || '',
    fileName: c.fileName,
    filePath: c.filePath,
    duration: c.sourceDuration || 5.0,
    width: 1080,
    height: 1920,
    aspectRatioType: c.aspectRatioType,
    stage: c.stage as any,
    aestheticScore: 7.5,
    sceneDescription: '',
    thumbnailPath: c.thumbnailPath,
    mediaType: c.mediaType,
    usageCount: 0,
  }));

  let fillIdx = 0;
  while (workingClips.length < neededCount) {
    const src = pool[fillIdx % pool.length];
    fillIdx++;
    workingClips.push({
      id: `clip_fill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: src.id,
      projectId: src.projectId,
      projectName: src.projectName,
      fileName: src.fileName,
      filePath: src.filePath,
      thumbnailPath: src.thumbnailPath,
      stage: src.stage,
      timelineStart: 0,
      timelineEnd: 0,
      sourceStart: 0,
      sourceDuration: idealClipDur,
      aspectRatioType: src.aspectRatioType,
      mediaType: src.mediaType || (isImageFile(src.filePath) ? 'image' : 'video'),
    });
  }

  const eachDur = totalDuration / workingClips.length;
  let curTime = 0;
  const videoUsageCount: Record<string, number> = {};

  return workingClips.map((c, i) => {
    const isLast = i === workingClips.length - 1;
    const thisDur = isLast ? Math.max(0.1, totalDuration - curTime) : eachDur;
    const isImg = c.mediaType === 'image' || isImageFile(c.filePath);

    let srcStart = c.sourceStart || 0;
    if (!isImg) {
      const srcMatch = pool.find((p) => p.id === c.sourceId || p.filePath === c.filePath);
      const srcTotalDur = srcMatch?.duration || 10;
      if (srcTotalDur > thisDur) {
        const usageIndex = videoUsageCount[c.filePath] || 0;
        videoUsageCount[c.filePath] = usageIndex + 1;
        const maxStart = Math.max(0, srcTotalDur - thisDur);
        srcStart = (usageIndex * thisDur) % (maxStart + 0.1);
        if (srcStart > maxStart) srcStart = maxStart;
      }
    }

    const newClip: TimelineClipItem = {
      ...c,
      timelineStart: Number(curTime.toFixed(2)),
      timelineEnd: Number((curTime + thisDur).toFixed(2)),
      sourceStart: Number(srcStart.toFixed(2)),
      sourceDuration: Number(thisDur.toFixed(2)),
    };
    curTime += thisDur;
    return newClip;
  });
}

