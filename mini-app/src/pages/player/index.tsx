import React, { useState, useEffect } from 'react';
import { View, Text, Video, Button, ScrollView, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import InteractiveVideoPlayer from '../../components/InteractiveVideoPlayer';
import { CloudDriveHelper } from '../../services/cloudDriveHelper';
import { CourseEvent, VideoFile } from '../../types';

const PlayerPage: React.FC = () => {
  const router = useRouter();
  const { id, title } = router.params;
  
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [score, setScore] = useState<number>(0);
  const [showReview, setShowReview] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<VideoFile[]>([]);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string>('');

  const mockEvents: CourseEvent[] = [
    {
      id: '1',
      time: 2.0,
      word: 'Apple',
      image: 'https://picsum.photos/id/1080/100/100',
      audio: '', 
      sound: ''
    },
    {
      id: '2',
      time: 5.0,
      word: 'Banana',
      image: 'https://picsum.photos/id/292/100/100',
      audio: '',
      sound: ''
    }
  ];

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: decodeURIComponent(title || '宝宝剧场') });
    
    // 初始化网盘并获取剧集列表
    const fetchEpisodes = async () => {
      try {
        const files = await CloudDriveHelper.getFolderVideos(id);
        setEpisodes(files);
        if (files.length > 0) {
          handleSelectEpisode(files[0].fileId);
        }
      } catch (error) {
        console.error('获取视频列表失败', error);
      }
    };
    
    fetchEpisodes();
  }, [id, title]);

  const handleSelectEpisode = async (fileId: string) => {
    setCurrentEpisodeId(fileId);
    setVideoSrc(''); // 显示加载状态
    const url = await CloudDriveHelper.getStreamingUrl(fileId);
    setVideoSrc(url);
  };

  const handleScore = (word: string) => {
    setScore(prev => prev + 10);
    Taro.showToast({
      title: `太棒了！+10分 (${word})`,
      icon: 'none'
    });
  };

  const handleVideoEnd = () => {
    setShowReview(true);
  };

  const handleCloseReview = () => {
    setShowReview(false);
  };

  return (
    <View className={styles.pageContainer}>
      <View className={styles.header}>
        <View className={styles.backBtn} onClick={() => Taro.navigateBack()}>
          <Text className={styles.backIcon}>←</Text>
        </View>
        <Text className={styles.seriesTitle}>{decodeURIComponent(title || '')}</Text>
        <View className={styles.scoreBadge}>
          <Text className={styles.scoreIcon}>⭐</Text>
          <Text className={styles.scoreText}>{score}</Text>
        </View>
      </View>

      <View className={styles.playerWrapper}>
        {videoSrc ? (
          <InteractiveVideoPlayer
            videoSrc={videoSrc}
            courseEvents={mockEvents}
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

      {/* 选集区域 */}
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

      {/* 模块4：跨视频地道表达强化 (10秒观后复习弹窗) */}
      {showReview && (
        <View className={styles.reviewModal}>
          <View className={styles.reviewContent}>
            <Text className={styles.reviewTitle}>看完了！我们来复习一下吧 🌟</Text>
            <Text className={styles.reviewSubtitle}>今日核心词句: "Wait for me!"</Text>
            
            <Video 
              className={styles.reviewVideo}
              src="https://www.w3schools.com/html/mov_bbb.mp4" 
              autoplay 
              loop
              controls={false}
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