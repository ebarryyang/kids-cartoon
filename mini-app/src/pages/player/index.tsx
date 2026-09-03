import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Video, Button, ScrollView, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import InteractiveVideoPlayer from '../../components/InteractiveVideoPlayer';
import { CloudDriveHelper } from '../../services/cloudDriveHelper';
import { CourseEvent, VideoFile } from '../../types';

const API_BASE =
  process.env.TARO_APP_PROXY_BASE || 'https://kids-cartoon-two.vercel.app';

const IMPORTED_KEY = 'kids-cartoon/imported-series';

type ImportedItem = {
  folderId: string;
  folderName: string;
  folderPath: string;
  vocabularyUrl?: string;
  subtitleUrl?: string;
  importedAt: number;
};

type VocabPayload = { version?: number; meta?: any; events?: any[] };

function clampPct(n: any, min = 5, max = 95): number {
  const x = Number(n);
  if (isNaN(x)) return 50;
  return Math.max(min, Math.min(max, x));
}

function normalizeEvents(arr: any[]): CourseEvent[] {
  const out: CourseEvent[] = [];
  (arr || []).forEach((v: any, i: number) => {
    if (!v) return;
    const time = Number(v.time ?? v['触发时间(s)'] ?? 0);
    const en = (v.wordEn ?? v['英文单词'] ?? v.word ?? '').toString().trim();
    const zh = (v.wordZh ?? v['中文释义'] ?? '').toString().trim();
    if (!en || isNaN(time)) return;
    out.push({
      id: String(v.id ?? `evt_${i + 1}`),
      time: Number(time.toFixed(1)),
      word: en,
      wordZh: zh || undefined,
      image: v.imageUrl ? String(v.imageUrl) : undefined,
      audio: v.audioUrl ? String(v.audioUrl) : undefined,
      sound: v.audioUrl ? String(v.audioUrl) : undefined,
      coordX: clampPct(v.coordX ?? v['X坐标'] ?? 50),
      coordY: clampPct(v.coordY ?? v['Y坐标'] ?? 25),
    });
  });
  return out.sort((a, b) => a.time - b.time);
}

function parseMarkdownVocabulary(text: string): any[] {
  const lines = (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let started = false;
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) { started = true; continue; }
    if (!started) continue;
    const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
    if (cols.length >= 3) rows.push(cols);
  }
  return rows.map(cols => ({
    '触发时间(s)': parseFloat(cols[0]) || 0,
    '英文单词': cols[1] || '',
    '中文释义': cols[2] || '',
    'X坐标': parseFloat(cols[3]) || 50,
    'Y坐标': parseFloat(cols[4]) || 25,
  }));
}

async function loadVocabularyEvents(url: string): Promise<CourseEvent[]> {
  if (!url) return [];
  try {
    const resp = await Taro.request<string | any[] | VocabPayload>({
      url, timeout: 15000,
      header: { Accept: 'application/json, text/plain, */*' },
    });
    const data: any = (resp as any).data;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (!text) return [];
    const head = text.trimStart().slice(0, 8);
    if (head.startsWith('{') || head.startsWith('[')) {
      const obj = typeof data === 'string' ? JSON.parse(data) : data;
      if (Array.isArray(obj)) return normalizeEvents(obj);
      if (obj && Array.isArray((obj as VocabPayload).events)) {
        return normalizeEvents((obj as VocabPayload).events || []);
      }
      return [];
    }
    return normalizeEvents(parseMarkdownVocabulary(text));
  } catch (err) {
    console.warn('[Player] loadVocabularyEvents failed for', url, err);
    return [];
  }
}

function readImportedList(): ImportedItem[] {
  try {
    const raw = Taro.getStorageSync(IMPORTED_KEY);
    if (!raw) return [];
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? (arr as ImportedItem[]) : [];
  } catch { return []; }
}

function resolveVocabularyUrl(folderId: string | undefined, folderName: string): string | undefined {
  const list = readImportedList();
  const byFolder = list.find(i => i.folderId === folderId) || list.find(i => i.folderName === folderName);
  return byFolder?.vocabularyUrl;
}

const PlayerPage: React.FC = () => {
  const router = useRouter();
  const { id, title } = router.params;
  const folderName = decodeURIComponent(title || '');

  const [videoSrc, setVideoSrc] = useState<string>('');
  const [score, setScore] = useState<number>(0);
  const [showReview, setShowReview] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<VideoFile[]>([]);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string>('');

  const [vocabularyUrl, setVocabularyUrl] = useState<string>('');
  const [courseEvents, setCourseEvents] = useState<CourseEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);

  // 从 /api/course-materials/:seriesId/episodes/:episodeId 拉 vocabularyUrl
  // （seriesId 此处先用 folder id 占位，和 H5 的 course-materials REST 保持统一）
  useEffect(() => {
    if (!currentEpisodeId || !id) return;
    let alive = true;
    setLoadingEvents(true);
    (async () => {
      let vocabUrl: string | undefined = resolveVocabularyUrl(id, folderName);
      if (!vocabUrl) {
        try {
          const resp = await Taro.request<any>({
            url: `${API_BASE}/api/course-materials/${encodeURIComponent(id as string)}/episodes/${encodeURIComponent(currentEpisodeId)}`,
            timeout: 8000,
          });
          const data: any = (resp as any).data?.data;
          if (data?.vocabularyUrl) vocabUrl = data.vocabularyUrl;
        } catch (_) {}
      }
      if (!alive) return;
      if (vocabUrl) {
        setVocabularyUrl(vocabUrl);
        const arr = await loadVocabularyEvents(vocabUrl);
        if (alive) setCourseEvents(arr);
      } else {
        setCourseEvents([]);
      }
      if (alive) setLoadingEvents(false);
    })();
    return () => { alive = false; };
  }, [id, currentEpisodeId, folderName]);

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: folderName || '宝宝剧场' });

    const fetchEpisodes = async () => {
      try {
        const files = await CloudDriveHelper.getFolderVideos(id as string);
        setEpisodes(files);
        if (files.length > 0) {
          await handleSelectEpisode(files[0].fileId);
        }
      } catch (error) {
        console.error('获取视频列表失败', error);
        Taro.showToast({ title: '网盘视频加载失败', icon: 'none' });
      }
    };
    fetchEpisodes();
  }, [id, folderName]);

  const handleSelectEpisode = async (fileId: string) => {
    setCurrentEpisodeId(fileId);
    setVideoSrc('');
    try {
      const url = await CloudDriveHelper.getStreamingUrl(fileId);
      setVideoSrc(url);
    } catch (e) {
      console.error('getStreamingUrl error', e);
      Taro.showToast({ title: '视频地址解析失败', icon: 'none' });
    }
  };

  const handleScore = (word: string) => {
    setScore(prev => prev + 10);
    Taro.showToast({ title: `太棒了！+10分 (${word})`, icon: 'none' });
  };

  const handleVideoEnd = () => setShowReview(true);
  const handleCloseReview = () => setShowReview(false);

  const eventsBadge = useMemo(() => {
    if (loadingEvents) return '生词表加载中...';
    if (courseEvents.length) return `📚 ${courseEvents.length} 个生词`;
    if (vocabularyUrl) return '暂无生词气泡';
    return '（未配置生词表）';
  }, [courseEvents, vocabularyUrl, loadingEvents]);

  return (
    <View className={styles.pageContainer}>
      <View className={styles.header}>
        <View className={styles.backBtn} onClick={() => Taro.navigateBack()}>
          <Text className={styles.backIcon}>←</Text>
        </View>
        <View className={styles.headerCenter}>
          <Text className={styles.seriesTitle}>{folderName}</Text>
          <Text className={styles.seriesSub}>{eventsBadge}</Text>
        </View>
        <View className={styles.scoreBadge}>
          <Text className={styles.scoreIcon}>⭐</Text>
          <Text className={styles.scoreText}>{score}</Text>
        </View>
      </View>

      <View className={styles.playerWrapper}>
        {videoSrc ? (
          <InteractiveVideoPlayer
            videoSrc={videoSrc}
            courseEvents={courseEvents}
            onScore={handleScore}
            onVideoEnd={handleVideoEnd}
          />
        ) : (
          <View className={styles.loading}>
            <View className={styles.loadingSpinner}></View>
            <Text>正在缓冲魔法动画...</Text>
          </View>
        )}
      </View>

      <View className={styles.episodeSection}>
        <Text className={styles.sectionTitle}>选集播放</Text>
        <ScrollView scrollY className={styles.episodeList} showScrollbar={false}>
          {episodes.map((ep, index) => (
            <View
              key={ep.fileId}
              className={classnames(styles.episodeCard, currentEpisodeId === ep.fileId && styles.activeEpisode)}
              onClick={() => handleSelectEpisode(ep.fileId)}
            >
              <View className={styles.episodeCover}>
                <Image src={`https://picsum.photos/id/${10 + index}/200/150`} mode="aspectFill" className={styles.coverImg} />
                {currentEpisodeId === ep.fileId && (
                  <View className={styles.playingOverlay}>
                    <Text className={styles.playingText}>播放中</Text>
                  </View>
                )}
                {ep.progress !== undefined && ep.progress > 0 && ep.progress < 100 && (
                  <View className={styles.progressContainer}>
                    <View className={styles.progressBar} style={{ width: `${ep.progress}%` }}></View>
                  </View>
                )}
              </View>
              <View className={styles.episodeInfo}>
                <Text className={styles.episodeName}>{ep.fileName}</Text>
                <View className={styles.episodeMeta}>
                  {ep.playCount ? (
                    <Text className={styles.playCount}>已看 {ep.playCount} 次</Text>
                  ) : ep.progress === 100 ? (
                    <Text className={styles.playCount}>已看完</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {showReview && (
        <View className={styles.reviewModal}>
          <View className={styles.reviewContent}>
            <Text className={styles.reviewTitle}>看完了！我们来复习一下吧 🌟</Text>
            <Text className={styles.reviewSubtitle}>
              {courseEvents.length
                ? `本课 ${courseEvents.length} 个生词：${courseEvents.slice(0, 4).map(e => e.word).join(' / ')}${courseEvents.length > 4 ? '...' : ''}`
                : '今日核心词句: "Wait for me!"'}
            </Text>
            <Video
              className={styles.reviewVideo}
              src="https://www.w3schools.com/html/mov_bbb.mp4"
              autoplay loop controls={false}
            />
            <Text className={styles.reviewTip}>（融合了小猪佩奇、汪汪队中的同一句台词）</Text>
            <Button className={styles.closeBtn} onClick={handleCloseReview}>
              太棒了，看下一集
            </Button>
          </View>
        </View>
      )}
    </View>
  );
};

export default PlayerPage;
