// 单集文件信息
// fsId 在「网盘模式」是百度网盘的数字 fs_id，在「courses 模式」是 courses.json 里的字符串 episodeId，
// 因此统一放宽为 number | string，比较时一律用 String() 归一化。
export interface EpisodeFile {
  fsId: number | string;
  filename: string;
  dlink?: string;
  size?: number;
  progress?: number; // 播放进度 0-100
  playCount?: number;
  lastPlayedAt?: number; // 上次播放时间戳（ms）
}

/** 百度网盘文件列表项（/rest/2.0/xpan/file?method=list 的 list[] 元素） */
export interface PanFile {
  fs_id: number;
  server_filename: string;
  path?: string;
  size?: number;
  isdir?: number;
  category?: number;
  dlink?: string;
}

// 课程系列与网盘文件的映射关系
export interface SeriesMapping {
  seriesId: string;
  folderPath?: string; // 网盘文件夹路径
  episodes: EpisodeFile[]; // 多集列表
  subtitleFsId?: number; // 字幕文件 fsId
  subtitleDlink?: string;
  vocabularyFsId?: number; // 生词表文件 fsId
  vocabularyDlink?: string;
}
