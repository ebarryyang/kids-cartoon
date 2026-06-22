// 单集文件信息
export interface EpisodeFile {
  fsId: number;
  filename: string;
  dlink?: string;
  size?: number;
  progress?: number; // 播放进度 0-100
  playCount?: number;
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
