import React, { useState, useRef, useEffect } from 'react';
import { View, Video, Image, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import { CourseEvent } from '../../types';

interface ActiveItem extends CourseEvent {
  uid: string;
  coordX: number;
  isPopping: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

interface InteractiveVideoPlayerProps {
  videoSrc: string;
  courseEvents: CourseEvent[];
  onScore: (word: string) => void;
  onVideoEnd?: () => void;
}

const InteractiveVideoPlayer: React.FC<InteractiveVideoPlayerProps> = ({ videoSrc, courseEvents, onScore, onVideoEnd }) => {
  const [activeItems, setActiveItems] = useState<ActiveItem[]>([]);
  const [isCasting, setIsCasting] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const triggeredEventIds = useRef<Set<string>>(new Set());
  const lastUpdateTime = useRef<number>(0);
  const videoContext = useRef<Taro.VideoContext | null>(null);

  useEffect(() => {
    videoContext.current = Taro.createVideoContext('babyVideo');
    // 组件卸载时清理定时器
    return () => {
      activeItems.forEach(item => {
        if (item.timer) clearTimeout(item.timer);
      });
    };
  }, [activeItems]);

  const handleTimeUpdate = (e: any) => {
    const currentTime = e.detail.currentTime;

    // 节流处理，限制频率
    if (Math.abs(currentTime - lastUpdateTime.current) < 0.2) return;
    lastUpdateTime.current = currentTime;

    courseEvents.forEach(event => {
      if (
        Math.abs(currentTime - event.time) <= 0.2 &&
        !triggeredEventIds.current.has(event.id)
      ) {
        triggerEvent(event);
      }
    });
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  // 模拟投屏状态切换（实际应由微信小程序投屏API事件触发）
  const togglePlayStatus = () => {
    if (videoContext.current) {
      if (isPlaying) {
        videoContext.current.pause();
      } else {
        videoContext.current.play();
      }
    }
  };

  const removeActiveItem = (uid: string) => {
    setActiveItems(prev => prev.filter(i => i.uid !== uid));
  };

  const triggerEvent = (event: CourseEvent) => {
    triggeredEventIds.current.add(event.id);
    const randomX = Math.floor(Math.random() * 61) + 15;
    
    const uid = `${event.id}_${Date.now()}`;
    const timer = setTimeout(() => {
      removeActiveItem(uid);
    }, 6000);

    const newItem: ActiveItem = {
      ...event,
      uid,
      coordX: randomX,
      isPopping: false,
      timer
    };

    setActiveItems(prev => [...prev, newItem]);
  };

  const playAudio = (src: string) => {
    if (!src) return;
    const innerAudioContext = Taro.createInnerAudioContext();
    innerAudioContext.autoplay = true;
    innerAudioContext.src = src;
    
    innerAudioContext.onEnded(() => {
      innerAudioContext.destroy();
    });
    innerAudioContext.onError((res) => {
      console.error('[InteractiveVideoPlayer] 音频播放错误', res);
      innerAudioContext.destroy();
    });
  };

  const handleItemClick = (e: any, item: ActiveItem) => {
    e.stopPropagation();
    if (item.isPopping) return;

    if (item.timer) clearTimeout(item.timer);

    setActiveItems(prev => prev.map(i => 
      i.uid === item.uid ? { ...i, isPopping: true } : i
    ));

    playAudio(item.sound);
    setTimeout(() => playAudio(item.audio), 300);

    onScore(item.word);

    setTimeout(() => {
      removeActiveItem(item.uid);
    }, 300);
  };

  return (
    <View className={styles.playerContainer}>
      <Video
        id="babyVideo"
        className={styles.videoElement}
        src={videoSrc}
        autoplay
        controls
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={onVideoEnd}
      />

      <View className={styles.customCastBtn} onClick={() => Taro.showToast({ title: '正在连接电视...', icon: 'loading' })}>
        <Text className={styles.castIcon}>📺</Text>
        <Text className={styles.castText}>投屏</Text>
      </View>

      <View className={styles.interactiveLayer}>
        {activeItems.map(item => (
          <View
            key={item.uid}
            className={classnames(styles.floatingItem, item.isPopping && styles.isPopping)}
            style={{ left: `${item.coordX}%` }}
            onClick={(e) => handleItemClick(e, item)}
          >
            <Image 
              src={item.image || 'https://picsum.photos/id/2/100/100'} 
              className={styles.itemImage} 
              mode="aspectFit" 
            />
          </View>
        ))}
      </View>

      {/* 投屏状态下的手机端遥控器 */}
      {isCasting && (
        <View className={styles.castingController}>
          <Text className={styles.castingText}>正在电视上播放...</Text>
          <Button className={styles.castingBtn} onClick={togglePlayStatus}>
            {isPlaying ? '暂停' : '播放'}
          </Button>
        </View>
      )}

      {/* 临时测试按钮：模拟投屏状态切换 */}
      <View className={styles.testCastingWrapper} onClick={() => setIsCasting(!isCasting)}>
        <Text className={styles.testCastingText}>模拟投屏: {isCasting ? 'ON' : 'OFF'}</Text>
      </View>
    </View>
  );
};

export default InteractiveVideoPlayer;
