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

const DEFAULT_IMG = 'https://picsum.photos/id/2/100/100';

function playRemote(src: string | undefined) {
  if (!src) return;
  const innerAudioContext = Taro.createInnerAudioContext();
  innerAudioContext.autoplay = true;
  innerAudioContext.src = src;
  innerAudioContext.onEnded(() => innerAudioContext.destroy());
  innerAudioContext.onError((res) => {
    console.error('[InteractiveVideoPlayer] 音频播放错误', res);
    innerAudioContext.destroy();
  });
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
    triggeredEventIds.current = new Set();
    setActiveItems([]);
    return () => {
      activeItems.forEach(item => {
        if (item.timer) clearTimeout(item.timer);
      });
    };
  }, [videoSrc]);

  const handleTimeUpdate = (e: any) => {
    const currentTime = e.detail.currentTime;
    if (Math.abs(currentTime - lastUpdateTime.current) < 0.2) return;
    lastUpdateTime.current = currentTime;

    courseEvents.forEach(event => {
      if (
        Math.abs(currentTime - event.time) <= 0.25 &&
        !triggeredEventIds.current.has(event.id)
      ) {
        triggerEvent(event);
      }
    });
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const togglePlayStatus = () => {
    if (videoContext.current) {
      if (isPlaying) videoContext.current.pause();
      else videoContext.current.play();
    }
  };

  const removeActiveItem = (uid: string) => {
    setActiveItems(prev => prev.filter(i => i.uid !== uid));
  };

  const triggerEvent = (event: CourseEvent) => {
    triggeredEventIds.current.add(event.id);
    const coordX =
      typeof event.coordX === 'number' && !isNaN(event.coordX)
        ? Math.max(5, Math.min(95, event.coordX))
        : Math.floor(Math.random() * 61) + 15;

    const uid = `${event.id}_${Date.now()}`;
    const timer = setTimeout(() => removeActiveItem(uid), 6500);

    const newItem: ActiveItem = {
      ...event,
      uid,
      coordX,
      isPopping: false,
      timer,
    };
    setActiveItems(prev => [...prev, newItem]);
  };

  const handleItemClick = (e: any, item: ActiveItem) => {
    e.stopPropagation();
    if (item.isPopping) return;
    if (item.timer) clearTimeout(item.timer);

    setActiveItems(prev => prev.map(i =>
      i.uid === item.uid ? { ...i, isPopping: true } : i
    ));

    if (item.sound) playRemote(item.sound);
    setTimeout(() => playRemote(item.audio), 320);
    if (!item.audio && !item.sound) {
      Taro.showToast({ title: item.word, icon: 'none' });
    }

    onScore(item.word);

    setTimeout(() => removeActiveItem(item.uid), 380);
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
              src={item.image || DEFAULT_IMG}
              className={styles.itemImage}
              mode="aspectFit"
            />
            {item.wordZh && (
              <Text className={styles.itemSubTitle}>{item.wordZh}</Text>
            )}
          </View>
        ))}
      </View>

      {isCasting && (
        <View className={styles.castingController}>
          <Text className={styles.castingText}>正在电视上播放...</Text>
          <Button className={styles.castingBtn} onClick={togglePlayStatus}>
            {isPlaying ? '暂停' : '播放'}
          </Button>
        </View>
      )}

      <View className={styles.testCastingWrapper} onClick={() => setIsCasting(!isCasting)}>
        <Text className={styles.testCastingText}>
          {courseEvents.length ? `📚 ${courseEvents.length} 词` : ''}
          &nbsp;投屏: {isCasting ? 'ON' : 'OFF'}
        </Text>
      </View>
    </View>
  );
};

export default InteractiveVideoPlayer;
