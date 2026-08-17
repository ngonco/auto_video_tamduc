export interface KaraokeWord {
  word: string;
  start: number; // giây
  end: number;   // giây
}

export interface SubtitleLine {
  id: string;
  start: number; // giây
  end: number;   // giây
  text: string;
  words: KaraokeWord[];
}

export interface TimelineClipItem {
  id: string;
  sourceId: string;
  fileName: string;
  filePath: string;
  thumbnailPath: string;
  stage: string;
  timelineStart: number; // giây
  timelineEnd: number;   // giây
  sourceStart: number;   // giây
  sourceDuration: number;// giây
  aspectRatioType: '9:16' | '16:9' | 'other';
}

export interface MainVideoProps {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  clips: TimelineClipItem[];
  subtitles: SubtitleLine[];
  voiceUrl?: string;
  bgmUrl?: string;
  voiceVolume?: number;
  bgmVolume?: number;
  fontFamily?: string;
  activeWordColor?: string;
  inactiveWordColor?: string;
}
