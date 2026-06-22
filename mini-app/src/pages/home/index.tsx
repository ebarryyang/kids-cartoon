import React, { useState } from 'react';
import { View, Text, Image, Button, ScrollView, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';
import { AnimationSeries } from '../../types';

const HomePage: React.FC = () => {
  useDidShow(() => {
    Taro.hideTabBar();
  });

  const [animations, setAnimations] = useState<AnimationSeries[]>([
    {
      id: 'peppa_01',
      title: '粉红猪小妹 第一季',
      cover: 'https://picsum.photos/id/237/300/300',
      isUnlocked: true,
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4'
    },
    {
      id: 'paw_01',
      title: '汪汪队立大功 第一季',
      cover: 'https://picsum.photos/id/1025/300/300',
      isUnlocked: false
    },
    {
      id: 'disney_01',
      title: '米奇妙妙屋',
      cover: 'https://picsum.photos/id/1080/300/300',
      isUnlocked: false
    }
  ]);

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyValue, setKeyValue] = useState('');

  const handleScanCard = () => {
    Taro.scanCode({
      success: (res) => {
        Taro.showToast({ title: '扫码成功，解锁中...', icon: 'loading' });
        setTimeout(() => {
          unlockSeries('paw_01');
        }, 1500);
      },
      fail: () => {
        // 如果用户取消扫码，我们可以让他选择手动输入Key
        setShowKeyModal(true);
      }
    });
  };

  const handleKeySubmit = () => {
    if (!keyValue.trim()) {
      Taro.showToast({ title: '请输入激活码', icon: 'none' });
      return;
    }
    
    Taro.showLoading({ title: '验证激活码...' });
    setTimeout(() => {
      Taro.hideLoading();
      setShowKeyModal(false);
      setKeyValue('');
      unlockSeries('paw_01'); // 模拟解锁汪汪队
    }, 1500);
  };

  const unlockSeries = (id: string) => {
    setAnimations(prev => prev.map(item => 
      item.id === id ? { ...item, isUnlocked: true, videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' } : item
    ));
    Taro.showToast({ title: '解锁成功！素材已缓存', icon: 'success', duration: 2500 });
  };

  const handlePlay = (anim: AnimationSeries) => {
    if (!anim.isUnlocked) {
      Taro.showModal({
        title: '提示',
        content: '该剧集尚未解锁，请先购买实体卡片扫码或输入激活码解锁哦~',
        confirmText: '输入激活码',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            setShowKeyModal(true);
          }
        }
      });
      return;
    }
    
    // 跳转到播放页，并传递视频信息
    Taro.navigateTo({
      url: `/pages/player/index?id=${anim.id}&title=${encodeURIComponent(anim.title)}`
    });
  };

  return (
    <View className={styles.pageContainer}>
      <View className={styles.header}>
        <View className={styles.userInfo}>
          <Image className={styles.avatar} src="https://picsum.photos/id/177/100/100" />
          <View className={styles.greeting}>
            <Text className={styles.title}>Hello, 宝宝!</Text>
            <Text className={styles.subtitle}>今天想看什么呢？</Text>
          </View>
        </View>
      </View>

      <View className={styles.scanSection}>
        <Button className={styles.scanButton} onClick={handleScanCard}>
          <Text className={styles.scanIcon}>📇</Text>
          <Text className={styles.scanText}>扫卡片/输激活码 解锁新动画</Text>
        </Button>
        <Text className={styles.scanTip}>包含：静默下载 2-3MB Lottie 动效与本地发音包</Text>
      </View>

      <View className={styles.listSection}>
        <Text className={styles.sectionTitle}>🎮 我的动画乐园</Text>
        <ScrollView scrollY className={styles.gridContainer} showScrollbar={false}>
          <View className={styles.grid}>
            {animations.map(anim => (
              <View 
                key={anim.id} 
                className={classnames(styles.card, { [styles.lockedCard]: !anim.isUnlocked })}
                onClick={() => handlePlay(anim)}
              >
                <View className={styles.coverWrapper}>
                  <Image src={anim.cover} mode="aspectFill" className={styles.cover} />
                  {!anim.isUnlocked && (
                    <View className={styles.lockOverlay}>
                      <Text className={styles.lockIcon}>🔒</Text>
                    </View>
                  )}
                </View>
                <Text className={styles.animTitle}>{anim.title}</Text>
                <View className={anim.isUnlocked ? styles.playBadge : styles.lockedBadge}>
                  {anim.isUnlocked ? '立即播放' : '未解锁'}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* 激活码输入弹窗 */}
      {showKeyModal && (
        <View className={styles.modalOverlay}>
          <View className={styles.modalContent}>
            <Text className={styles.modalTitle}>输入教案激活码</Text>
            <Text className={styles.modalDesc}>请刮开实体卡片背面的涂层，输入12位激活码</Text>
            
            <Input 
              className={styles.keyInput} 
              placeholder="请输入激活码 (例如: PEPPA-2024)" 
              value={keyValue}
              onInput={(e) => setKeyValue(e.detail.value)}
              focus
            />
            
            <View className={styles.modalBtns}>
              <View className={styles.cancelBtn} onClick={() => setShowKeyModal(false)}>取消</View>
              <View className={styles.confirmBtn} onClick={handleKeySubmit}>立即解锁</View>
            </View>
          </View>
        </View>
      )}

      {/* 当弹窗打开时隐藏底导栏 */}
      {!showKeyModal && <CustomTabBar current={0} />}
    </View>
  );
};

export default HomePage;