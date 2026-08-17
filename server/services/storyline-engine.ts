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
}

export interface StorylineGenerationResult {
  totalDuration: number;
  clips: TimelineClipItem[];
}

const STAGE_ORDER = [
  'STAGE_1_RAW_CARPENTRY',
  'STAGE_2_ASSEMBLY_FINISHING',
  'STAGE_3_DECOR_FLOWERS',
  'STAGE_4_WORSHIP_ALTAR',
] as const;

/**
 * Thuật toán lắp ráp kịch bản 4 giai đoạn tự động, thích ứng với dữ liệu thực tế
 */
export function generateStoryline(
  sourceClips: SourceClipRecord[],
  targetDuration: number,
  minClipSec: number = 3.0,
  maxClipSec: number = 4.5
): StorylineGenerationResult {
  if (!sourceClips || sourceClips.length === 0) {
    return { totalDuration: targetDuration, clips: [] };
  }

  // Nhóm clip theo 4 giai đoạn và sắp xếp theo điểm thẩm mỹ cao nhất trước
  const clipsByStage: Record<string, SourceClipRecord[]> = {
    STAGE_1_RAW_CARPENTRY: [],
    STAGE_2_ASSEMBLY_FINISHING: [],
    STAGE_3_DECOR_FLOWERS: [],
    STAGE_4_WORSHIP_ALTAR: [],
  };

  sourceClips.forEach((clip) => {
    const stage = clip.stage || 'STAGE_2_ASSEMBLY_FINISHING';
    if (!clipsByStage[stage]) {
      clipsByStage[stage] = [];
    }
    clipsByStage[stage].push(clip);
  });

  // Sort mỗi stage theo aesthetic score giảm dần
  Object.keys(clipsByStage).forEach((stageKey) => {
    clipsByStage[stageKey].sort((a, b) => (b.aestheticScore || 0) - (a.aestheticScore || 0));
  });

  // Tìm các stage thực tế có clip
  const availableStages = STAGE_ORDER.filter((s) => clipsByStage[s].length > 0);

  // Nếu không có stage nào khớp, dùng toàn bộ clip
  if (availableStages.length === 0) {
    availableStages.push('STAGE_2_ASSEMBLY_FINISHING');
    clipsByStage['STAGE_2_ASSEMBLY_FINISHING'] = [...sourceClips];
  }

  // Tính tỷ lệ thời lượng cho từng stage có sẵn
  const stageWeights: Record<string, number> = {};
  if (availableStages.length === 4) {
    stageWeights['STAGE_1_RAW_CARPENTRY'] = 0.20;
    stageWeights['STAGE_2_ASSEMBLY_FINISHING'] = 0.25;
    stageWeights['STAGE_3_DECOR_FLOWERS'] = 0.25;
    stageWeights['STAGE_4_WORSHIP_ALTAR'] = 0.30;
  } else {
    // Phân bổ đều theo tỷ lệ các stage hiện có
    const equalWeight = 1.0 / availableStages.length;
    availableStages.forEach((s) => {
      stageWeights[s] = equalWeight;
    });
  }

  const timelineClips: TimelineClipItem[] = [];
  let currentTimelineTime = 0;
  let clipIndexCounter = 1;

  for (const stage of availableStages) {
    const stageClips = clipsByStage[stage];
    const stageTargetDuration = targetDuration * (stageWeights[stage] || 0.25);
    const stageEndTime = Math.min(currentTimelineTime + stageTargetDuration, targetDuration);

    let stageCurrentTime = currentTimelineTime;
    let clipPoolIndex = 0;

    while (stageCurrentTime < stageEndTime && stageCurrentTime < targetDuration) {
      const source = stageClips[clipPoolIndex % stageClips.length];
      clipPoolIndex++;

      // Tính thời lượng cho đoạn cut này
      const remainingInStage = stageEndTime - stageCurrentTime;
      const desiredDuration = Math.min(
        maxClipSec,
        Math.max(minClipSec, Math.random() * (maxClipSec - minClipSec) + minClipSec)
      );
      const cutDuration = Math.min(desiredDuration, remainingInStage, targetDuration - stageCurrentTime);

      if (cutDuration < 0.5) break;

      // Điểm bắt đầu cắt trong file gốc
      const maxSourceStart = Math.max(0, (source.duration || 10) - cutDuration);
      const sourceStart = Math.min(Math.random() * maxSourceStart, maxSourceStart);

      timelineClips.push({
        id: `clip_${clipIndexCounter++}`,
        sourceId: source.id,
        fileName: source.fileName,
        filePath: source.filePath,
        thumbnailPath: source.thumbnailPath,
        stage: source.stage,
        timelineStart: Number(stageCurrentTime.toFixed(2)),
        timelineEnd: Number((stageCurrentTime + cutDuration).toFixed(2)),
        sourceStart: Number(sourceStart.toFixed(2)),
        sourceDuration: Number(cutDuration.toFixed(2)),
        aspectRatioType: source.aspectRatioType,
      });

      stageCurrentTime += cutDuration;
    }

    currentTimelineTime = stageCurrentTime;
  }

  // Nếu còn thiếu thời lượng so với voice, bổ sung thêm từ các clip đẹp nhất của stage 4 hoặc bất kỳ clip nào
  if (currentTimelineTime < targetDuration) {
    const remaining = targetDuration - currentTimelineTime;
    const bestClips = clipsByStage['STAGE_4_WORSHIP_ALTAR'].length > 0
      ? clipsByStage['STAGE_4_WORSHIP_ALTAR']
      : sourceClips;

    let poolIdx = 0;
    let extraTime = currentTimelineTime;

    while (extraTime < targetDuration) {
      const source = bestClips[poolIdx % bestClips.length];
      poolIdx++;

      const cutDuration = Math.min(maxClipSec, targetDuration - extraTime);
      if (cutDuration < 0.2) break;

      timelineClips.push({
        id: `clip_${clipIndexCounter++}`,
        sourceId: source.id,
        fileName: source.fileName,
        filePath: source.filePath,
        thumbnailPath: source.thumbnailPath,
        stage: source.stage,
        timelineStart: Number(extraTime.toFixed(2)),
        timelineEnd: Number((extraTime + cutDuration).toFixed(2)),
        sourceStart: 0,
        sourceDuration: Number(cutDuration.toFixed(2)),
        aspectRatioType: source.aspectRatioType,
      });

      extraTime += cutDuration;
    }
  }

  return {
    totalDuration: targetDuration,
    clips: timelineClips,
  };
}
