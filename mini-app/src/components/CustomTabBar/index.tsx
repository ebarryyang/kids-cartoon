import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

interface Props {
  current: number;
}

const CustomTabBar: React.FC<Props> = ({ current }) => {
  const list = [
    { pagePath: '/pages/home/index', text: '乐园', icon: '🎡' },
    { pagePath: '/pages/discover/index', text: '发现', icon: '🔭' },
    { pagePath: '/pages/honor/index', text: '荣誉', icon: '🏅' },
    { pagePath: '/pages/mine/index', text: '宝宝', icon: '👶' }
  ];

  const switchTab = (index: number, url: string) => {
    if (current !== index) {
      Taro.switchTab({ url });
    }
  };

  return (
    <View className={styles.tabBarWrapper}>
      <View className={styles.tabBar}>
        {list.map((item, index) => {
          const isActive = current === index;
          return (
            <View 
              key={index} 
              className={`${styles.tabItem} ${isActive ? styles.active : ''}`}
              onClick={() => switchTab(index, item.pagePath)}
            >
              <View className={styles.iconWrapper}>
                <Text className={styles.icon}>{item.icon}</Text>
              </View>
              <Text className={styles.text}>{item.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default CustomTabBar;