import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SeriesMapping } from './types';

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
  // 更新单集进度
  updateEpisodeProgress: (seriesId: string, fsId: number, progress: number) => void;
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
      updateEpisodeProgress: (seriesId: string, fsId: number, progress: number) => {
        const current = get().seriesMappings;
        const updated = current.map(m => {
          if (m.seriesId !== seriesId) return m;
          const episodes = m.episodes.map(ep => 
            ep.fsId === fsId ? { ...ep, progress } : ep
          );
          return { ...m, episodes };
        });
        set({ seriesMappings: updated });
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
