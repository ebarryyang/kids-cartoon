import axios from 'axios';

const API_BASE = '/api/course-materials';

export interface EpisodeMaterial {
  episodeId: string;
  episodeName: string;
  subtitleUrl?: string;
  vocabularyUrl?: string;
  hasExercise: boolean;
  exerciseCount?: number;
}

export interface CourseMaterial {
  seriesId: string;
  seriesName: string;
  coverUrl?: string;
  episodes: EpisodeMaterial[];
}

// 获取课程列表
export const getCourseList = async (): Promise<{ success: boolean; data: { seriesId: string; seriesName: string; coverUrl?: string; episodeCount: number }[] }> => {
  const response = await axios.get(API_BASE);
  return response.data;
};

// 获取课程详情（含所有单集资料）
export const getCourseDetail = async (seriesId: string): Promise<{ success: boolean; data: CourseMaterial }> => {
  const response = await axios.get(`${API_BASE}/${seriesId}`);
  return response.data;
};

// 获取单集资料
export const getEpisodeMaterial = async (seriesId: string, episodeId: string): Promise<{ success: boolean; data: EpisodeMaterial }> => {
  const response = await axios.get(`${API_BASE}/${seriesId}/episodes/${episodeId}`);
  return response.data;
};
