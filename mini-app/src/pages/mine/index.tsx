import React, { useState } from 'react';
import { View, Text, Image, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';
import { CloudDriveHelper } from '../../services/cloudDriveHelper';
import { ChildProfile } from '../../types';

const MinePage: React.FC = () => {
  const [profile] = useState<ChildProfile>({
    name: '小汤圆',
    age: 3,
    avatar: 'https://picsum.photos/id/177/200/200',
    score: 120,
    medals: []
  });

  const [isDriveBound, setIsDriveBound] = useState<boolean>(CloudDriveHelper.isDriveBound());
  // 控制网盘文件选择弹窗
  const [showFilePicker, setShowFilePicker] = useState(false);

  useDidShow(() => {
    Taro.hideTabBar();
    setIsDriveBound(CloudDriveHelper.isDriveBound());
  });

  const handleBindDrive = async () => {
    const success = await CloudDriveHelper.bindDrive();
    if (success) {
      Taro.showToast({ title: '绑定成功', icon: 'success' });
      setIsDriveBound(true);
    }
  };

  const handleImportToPark = () => {
    if (!isDriveBound) {
      Taro.showToast({ title: '请先绑定网盘', icon: 'none' });
      return;
    }
    // 打开网盘文件选择器弹窗
    setShowFilePicker(true);
  };

  const handleConfirmImport = () => {
    setShowFilePicker(false);
    Taro.showLoading({ title: 'AI 匹配教案中...' });
    setTimeout(() => {
      Taro.hideLoading();
      Taro.showToast({ title: '已成功加入动画乐园！', icon: 'success', duration: 2000 });
      // 实际业务中这里会把选中的文件夹ID与云端教案建立映射，存入用户数据库
    }, 1500);
  };

  return (
    <View className={styles.pageContainer}>
      <View className={styles.profileCard}>
        <Image src={profile.avatar} className={styles.avatar} />
        <View className={styles.info}>
          <View className={styles.nameRow}>
            <Text className={styles.name}>{profile.name}</Text>
          </View>
          <View className={styles.badgeRow}>
            <Text className={styles.age}>LV.{Math.floor(profile.score / 50) + 1}</Text>
            <View className={styles.editBtn}>
              <Text>更新</Text>
            </View>
          </View>
        </View>
      </View>

      <View className={styles.section}>
        <Text className={styles.sectionTitle}>网盘资源管理</Text>
        
        <View className={styles.driveCard}>
          <View className={styles.driveInfo}>
            <Text className={styles.driveIcon}>☁️</Text>
            <View className={styles.driveText}>
              <Text className={styles.driveName}>百度网盘授权</Text>
              <Text className={styles.driveDesc}>
                {isDriveBound ? '已绑定，可无感流播动画资源' : '绑定后可播放您网盘内的动画'}
              </Text>
            </View>
          </View>
          {isDriveBound ? (
            <View className={styles.boundBtn}>
              <Text>已绑定</Text>
            </View>
          ) : (
            <View className={styles.bindBtn} onClick={handleBindDrive}>
              <Text>去绑定</Text>
            </View>
          )}
        </View>

        {/* 新增：导入资源到乐园的入口 */}
        <View className={classnames(styles.importCard, !isDriveBound && styles.disabledCard)} onClick={handleImportToPark}>
          <View className={styles.importInfo}>
            <View className={styles.importIconWrapper}>
              <Text className={styles.importIcon}>📥</Text>
            </View>
            <View className={styles.importText}>
              <Text className={styles.importTitle}>导入动画到乐园</Text>
              <Text className={styles.importDesc}>从网盘选择文件夹，AI 自动匹配互动教案</Text>
            </View>
          </View>
          <Text className={styles.arrow}>></Text>
        </View>
      </View>

      <View className={styles.section}>
        <Text className={styles.sectionTitle}>FEATURES</Text>
        <View className={styles.menuList}>
          <View className={styles.menuItem}>
            <Text className={styles.menuIcon}>📚</Text>
            <Text className={styles.menuText}>绘本点读扩展</Text>
            <Text className={styles.arrow}>></Text>
          </View>
          <View className={styles.menuItem}>
            <Text className={styles.menuIcon}>🎤</Text>
            <Text className={styles.menuText}>零存储口语测评</Text>
            <Text className={styles.arrow}>></Text>
          </View>
        </View>
      </View>

      {/* 底部右侧可爱的卡通点缀 */}
      <View className={styles.mascotWrapper}>
        <Image 
          src="https://api.iconify.design/1-cute-cat.svg" // 占位图，实际可换成可爱的SVG平面卡通
          className={styles.mascotImg}
          mode="aspectFit"
        />
        <View className={styles.bubble}>
          <Text>Keep Going!</Text>
        </View>
      </View>

      {/* 弹窗打开时隐藏导航栏，防止 z-index 冲突或遮挡底部按钮 */}
      {!showFilePicker && <CustomTabBar current={3} />}

      {/* 模拟网盘文件选择器弹窗 */}
      {showFilePicker && (
        <View className={styles.modalOverlay}>
          <View className={styles.modalContent}>
            <View className={styles.modalHeader}>
              <Text className={styles.modalTitle}>选择网盘文件夹</Text>
              <Text className={styles.closeBtn} onClick={() => setShowFilePicker(false)}>✕</Text>
            </View>
            
            <View className={styles.fileList}>
              {/* 模拟网盘目录结构 */}
              <View className={styles.fileItem}>
                <Text className={styles.folderIcon}>📁</Text>
                <View className={styles.folderInfo}>
                  <Text className={styles.folderName}>粉红猪小妹 第一季</Text>
                  <Text className={styles.folderDesc}>包含 52 个视频文件</Text>
                </View>
                <View className={styles.radioChecked}></View>
              </View>
              
              <View className={styles.fileItem}>
                <Text className={styles.folderIcon}>📁</Text>
                <View className={styles.folderInfo}>
                  <Text className={styles.folderName}>汪汪队立大功 英文版</Text>
                  <Text className={styles.folderDesc}>包含 26 个视频文件</Text>
                </View>
                <View className={styles.radioUnchecked}></View>
              </View>
            </View>

            <View className={styles.modalFooter}>
              <View className={styles.confirmImportBtn} onClick={handleConfirmImport}>
                <Text>确认导入并匹配教案</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default MinePage;