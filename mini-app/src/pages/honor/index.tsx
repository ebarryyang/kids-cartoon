import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';
import { ChildProfile } from '../../types';

const HonorPage: React.FC = () => {
  useDidShow(() => {
    Taro.hideTabBar();
  });
  // 模拟从全局状态或缓存获取的宝宝数据
  const [profile] = useState<ChildProfile>({
    name: '小汤圆',
    age: 3,
    avatar: 'https://picsum.photos/id/177/200/200',
    score: 120,
    medals: [
      { id: 'm1', name: '小小观察家', icon: '👀', description: '看完5集动画', unlocked: true, requiredScore: 50 },
      { id: 'm2', name: '专注小能手', icon: '🎯', description: '看完10集动画', unlocked: true, requiredScore: 100 },
      { id: 'm3', name: '英语小达人', icon: '🌟', description: '看完20集动画', unlocked: false, requiredScore: 200 },
      { id: 'm4', name: '坚持不懈', icon: '💪', description: '看完50集动画', unlocked: false, requiredScore: 500 },
      { id: 'm5', name: '智慧小星星', icon: '✨', description: '看完100集动画', unlocked: false, requiredScore: 1000 },
      { id: 'm6', name: '全能小霸王', icon: '👑', description: '看完200集动画', unlocked: false, requiredScore: 2000 }
    ]
  });

  return (
    <View className={styles.pageContainer}>
      <View className={styles.header}>
        <View className={styles.scoreBoard}>
          <Text className={styles.scoreNum}>{profile.score}</Text>
          <Text className={styles.scoreLabel}>我的积分 🌟</Text>
        </View>
      </View>

      {/* 勋章墙展示区 */}
      <View className={styles.medalSection}>
        <Text className={styles.sectionTitle}>荣誉勋章墙</Text>
        <ScrollView scrollY className={styles.medalScroll}>
          <View className={styles.medalGrid}>
            {profile.medals.map(medal => (
              <View key={medal.id} className={classnames(styles.medalCard, !medal.unlocked && styles.medalLocked)}>
                <View className={styles.medalIconWrapper}>
                  <Text className={styles.medalIcon}>{medal.icon}</Text>
                </View>
                <Text className={styles.medalName}>{medal.name}</Text>
                <Text className={styles.medalDesc}>{medal.description}</Text>
                {!medal.unlocked && (
                  <View className={styles.lockedBadge}>
                    <Text>需 {medal.requiredScore} 分</Text>
                  </View>
                )}
                {medal.unlocked && (
                  <View className={styles.unlockedBadge}>
                    <Text>已获得</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <CustomTabBar current={2} />
    </View>
  );
};

export default HonorPage;