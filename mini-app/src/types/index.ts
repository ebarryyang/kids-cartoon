export interface CourseEvent {
  id: string;
  time: number;
  word: string;
  image: string;
  audio: string;
  sound: string;
}

export interface VideoFile {
  fileId: string;
  fileName: string;
  size: number;
  playCount?: number; // 播放次数
  progress?: number;  // 播放进度 (0-100)
}

export interface AnimationSeries {
  id: string;
  title: string;
  cover: string;
  isUnlocked: boolean;
  videoUrl?: string;
  events?: CourseEvent[];
}

export interface Medal {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  requiredScore: number;
}

export interface ChildProfile {
  name: string;
  age: number;
  avatar: string;
  score: number;
  medals: Medal[];
}
