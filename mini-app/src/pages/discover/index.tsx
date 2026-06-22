import React from 'react';
import { View, Text, Swiper, SwiperItem, Image, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';

const DiscoverPage: React.FC = () => {
  useDidShow(() => {
    Taro.hideTabBar();
  });
  const banners = [
    { id: 1, img: 'https://picsum.photos/id/1015/800/1200', title: '小猪佩奇: 欢乐露营季' },
    { id: 2, img: 'https://picsum.photos/id/1025/800/1200', title: '汪汪队: 终极救援' },
    { id: 3, img: 'https://picsum.photos/id/1033/800/1200', title: '海底小纵队: 夏日特辑' }
  ];

  /*
   * 【SaaS 管理后台对接说明】
   * 这里的 updates (最新上线剧集) 和 banners (轮播海报) 数据，
   * 在实际生产环境中，将通过请求运营 SaaS 后台的 API 获取：
   * 
   * useEffect(() => {
   *   fetch('https://api.saas-admin.com/v1/discover/series')
   *     .then(res => res.json())
   *     .then(data => {
   *        setBanners(data.banners);
   *        setUpdates(data.recentSeries);
   *     });
   * }, []);
   * 
   * 运营人员可以在 Web 端 SaaS 后台实时上架/下架新的【动画剧集】、
   * 调整海报轮播图排序，C 端小程序会自动拉取最新配置，无需重新发布小程序。
   */
  const updates = [
    { id: 1, title: '小马宝莉: 友谊的魔力', img: 'https://picsum.photos/id/10/400/300', ep: '全26集' },
    { id: 2, title: '托马斯和他的朋友们', img: 'https://picsum.photos/id/11/400/300', ep: '全15集' },
    { id: 3, title: '朵拉大冒险', img: 'https://picsum.photos/id/12/400/300', ep: '全20集' },
    { id: 4, title: '蓝色小考拉 Penelope', img: 'https://picsum.photos/id/13/400/300', ep: '全10集' },
    { id: 5, title: '米奇妙妙屋 第一季', img: 'https://picsum.photos/id/14/400/300', ep: '全30集' },
  ];

  return (
    <View className={styles.pageContainer}>
      <View className={styles.bannerSection}>
        <Swiper 
          className={styles.swiper} 
          circular 
          autoplay 
          indicatorDots 
          indicatorColor="rgba(255,255,255,0.5)" 
          indicatorActiveColor="#FFD13B"
        >
          {banners.map(b => (
            <SwiperItem key={b.id}>
              <View className={styles.bannerCard}>
                <Image src={b.img} mode="aspectFill" className={styles.bannerImg} />
                <View className={styles.bannerOverlay}>
                  <Text className={styles.bannerTitle}>{b.title}</Text>
                  <View className={styles.playBtn}>立刻观看</View>
                </View>
                <View className={styles.recommendBadge}>重磅主推</View>
              </View>
            </SwiperItem>
          ))}
        </Swiper>
      </View>
      
      <View className={styles.updateSection}>
        <Text className={styles.sectionTitle}>✨ 最新上线剧集</Text>
        <ScrollView scrollX className={styles.updateList} showScrollbar={false}>
          {updates.map(u => (
            <View key={u.id} className={styles.updateCard}>
              <Image src={u.img} mode="aspectFill" className={styles.updateImg} />
              <Text className={styles.updateTitle}>{u.title}</Text>
              <Text className={styles.updateEp}>{u.ep}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      <CustomTabBar current={1} />
    </View>
  );
};

export default DiscoverPage;