import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SeriesMapping, EpisodeFile } from './types';

interface User {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
}

interface AppState {
  // 用户登录状态
  user: User | null;
  setUser: (user: User | null) => void;
  isLoggedIn: () => boolean;
  logout: () => void;
  // 百度网盘授权
  accessToken: string | null;
  setAccessToken: (token: string) => void;
  // 已解锁的课程ID集合
  unlockedSeries: string[];
  unlockSeries: (id: string) => void;
  isSeriesUnlocked: (id: string) => boolean;
  // 激活码弹窗状态
  showKeyModal: boolean;
  setShowKeyModal: (show: boolean) => void;
  // 课程与网盘文件夹/多集的映射关系
  seriesMappings: SeriesMapping[];
  setSeriesMapping: (seriesId: string, mapping: Omit<SeriesMapping, 'seriesId'>) => void;
  getSeriesMapping: (seriesId: string) => SeriesMapping | undefined;
  // 更新单集进度（episodeKey：网盘模式传 number fs_id，courses 模式传 string episodeId）
  updateEpisodeProgress: (
    seriesId: string,
    episodeKey: string | number,
    progress: number,
    filename?: string
  ) => void;
  // 获取某个系列最近播放的一集（按 lastPlayedAt 降序）
  getRecentlyPlayedEpisode: (seriesId: string) => EpisodeFile | undefined;
  // 从发现页添加到乐园
  addToPark: (seriesId: string, folderPath: string) => void;
  // 已加入乐园的系列ID集合
  addedToPark: string[];
  isAddedToPark: (seriesId: string) => boolean;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 用户登录状态
      user: null,
      setUser: (user) => set({ user }),
      isLoggedIn: () => !!get().user,
      logout: () => {
        set({ 
          user: null, 
          accessToken: null, 
          unlockedSeries: [],
          seriesMappings: [],
          addedToPark: []
        });
      },
      // 百度网盘授权
      accessToken: null,
      setAccessToken: (token) => set({ accessToken: token }),
      unlockedSeries: [],
      unlockSeries: (id: string) => {
        const current = get().unlockedSeries;
        if (!current.includes(id)) {
          set({ unlockedSeries: [...current, id] });
        }
      },
      isSeriesUnlocked: (id: string) => {
        return get().unlockedSeries.includes(id);
      },
      showKeyModal: false,
      setShowKeyModal: (show: boolean) => set({ showKeyModal: show }),
      seriesMappings: [],
      setSeriesMapping: (seriesId: string, mapping: Omit<SeriesMapping, 'seriesId'>) => {
        const current = get().seriesMappings;
        const filtered = current.filter(m => m.seriesId !== seriesId);
        set({ seriesMappings: [...filtered, { ...mapping, seriesId }] });
      },
      getSeriesMapping: (seriesId: string) => {
        return get().seriesMappings.find(m => m.seriesId === seriesId);
      },
      updateEpisodeProgress: (seriesId, episodeKey, progress, filename) => {
        const key = String(episodeKey);
        const now = Date.now();
        const current = get().seriesMappings;
        const idx = current.findIndex(m => m.seriesId === seriesId);

        // courses 模式下 seriesMappings 里还没有该系列（用户没点过「加入乐园」），
        // 这里自动建一条，保证播放进度/上次播放时间同样能记录下来。
        if (idx === -1) {
          set({
            seriesMappings: [
              ...current,
              {
                seriesId,
                episodes: [
                  { fsId: key, filename: filename || key, progress, lastPlayedAt: now, playCount: 1 },
                ],
              },
            ],
          });
          return;
        }

        const next = [...current];
        const m = next[idx];
        const episodes = [...m.episodes];
        const epIdx = episodes.findIndex(ep => String(ep.fsId) === key);
        if (epIdx === -1) {
          episodes.push({ fsId: key, filename: filename || key, progress, lastPlayedAt: now, playCount: 1 });
        } else {
          episodes[epIdx] = {
            ...episodes[epIdx],
            progress,
            lastPlayedAt: now,
            playCount: (episodes[epIdx].playCount ?? 0) + 1,
          };
        }
        next[idx] = { ...m, episodes };
        set({ seriesMappings: next });
      },
      getRecentlyPlayedEpisode: (seriesId: string) => {
        const mapping = get().seriesMappings.find(m => m.seriesId === seriesId);
        if (!mapping || mapping.episodes.length === 0) return undefined;
        return mapping.episodes
          .filter(ep => ep.lastPlayedAt != null)
          .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0];
      },
      addedToPark: [],
      addToPark: (seriesId: string, folderPath: string) => {
        const current = get().addedToPark;
        if (!current.includes(seriesId)) {
          set({ addedToPark: [...current, seriesId] });
          // 同时设置 series mapping
          get().setSeriesMapping(seriesId, {
            folderPath,
            episodes: [],
          });
        }
      },
      isAddedToPark: (seriesId: string) => {
        return get().addedToPark.includes(seriesId);
      },
    }),
    {
      name: 'animation-app-storage',
    }
  )
);
