import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';
import { CloudDriveHelper, PanFile } from '../../services/cloudDriveHelper';
import { ChildProfile } from '../../types';

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|m4v|flv|wmv|ts|webm)$/i;
const SERIES_IMPORT_STORAGE_KEY = 'kids-cartoon/imported-series';

interface ImportedSeries {
  seriesFolderPath: string;
  folderName: string;
  fsId: string;
  videoCount: number;
  totalEntries: number;
  importedAt: number;
}

const MinePage: React.FC = () => {
  const [profile] = useState<ChildProfile>({
    name: '小汤圆',
    age: 3,
    avatar: 'https://picsum.photos/id/177/200/200',
    score: 120,
    medals: []
  });

  const [isDriveBound, setIsDriveBound] = useState<boolean>(CloudDriveHelper.isDriveBound());
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [pastingToken, setPastingToken] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');

  const [currentDir, setCurrentDir] = useState<string>(CloudDriveHelper.getDefaultDir());
  const [panLoading, setPanLoading] = useState(false);
  const [panError, setPanError] = useState<string | null>(null);
  const [panFiles, setPanFiles] = useState<PanFile[]>([]);
  const [selectedPanFile, setSelectedPanFile] = useState<PanFile | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedList, setImportedList] = useState<ImportedSeries[]>([]);

  useDidShow(() => {
    Taro.hideTabBar();
    setIsDriveBound(CloudDriveHelper.isDriveBound());
    refreshImportedList();
  });

  useEffect(() => {
    if (!showFilePicker) return;
    void loadDir(currentDir);
  }, [showFilePicker, currentDir]);

  const refreshImportedList = () => {
    try {
      const v = Taro.getStorageSync(SERIES_IMPORT_STORAGE_KEY);
      const arr: ImportedSeries[] = typeof v === 'string' ? JSON.parse(v || '[]') : Array.isArray(v) ? v : [];
      setImportedList(Array.isArray(arr) ? arr : []);
    } catch {
      setImportedList([]);
    }
  };

  const appendImportedSeries = (s: ImportedSeries) => {
    try {
      const cur: ImportedSeries[] = (() => {
        try {
          const v = Taro.getStorageSync(SERIES_IMPORT_STORAGE_KEY);
          return typeof v === 'string' ? JSON.parse(v || '[]') : Array.isArray(v) ? v : [];
        } catch { return []; }
      })();
      const next = [s, ...cur.filter((x) => x.seriesFolderPath !== s.seriesFolderPath)];
      Taro.setStorageSync(SERIES_IMPORT_STORAGE_KEY, JSON.stringify(next));
      setImportedList(next);
    } catch {}
  };

  const handleBindDrive = async () => {
    const success = await CloudDriveHelper.bindDrive();
    if (success) {
      Taro.showToast({ title: '绑定成功', icon: 'success' });
      setIsDriveBound(true);
    } else {
      setPastingToken(true);
    }
  };

  const handleSaveToken = () => {
    const t = (tokenDraft || '').trim();
    if (!t) {
      Taro.showToast({ title: '请粘贴 access_token', icon: 'none' });
      return;
    }
    CloudDriveHelper.setAccessToken(t);
    setTokenDraft('');
    setPastingToken(false);
    setIsDriveBound(true);
    Taro.showToast({ title: 'Token 已保存', icon: 'success' });
  };

  const handleImportToPark = () => {
    if (!isDriveBound) {
      Taro.showToast({ title: '请先绑定网盘', icon: 'none' });
      return;
    }
    setCurrentDir(CloudDriveHelper.getDefaultDir());
    setPanFiles([]);
    setPanError(null);
    setSelectedPanFile(null);
    setShowFilePicker(true);
  };

  const loadDir = async (dir: string) => {
    setPanLoading(true);
    setPanError(null);
    try {
      const r = await CloudDriveHelper.getFileList(dir);
      if (!r || (r.errno !== 0 && r.errno !== undefined)) {
        const msg = (r && r.errmsg) ? r.errmsg : (r ? `errno=${r.errno}` : '未知错误');
        setPanError(msg);
        setPanFiles([]);
        if (r && r.errno === -6) {
          // 鉴权失效，清空并提示重新粘贴
          CloudDriveHelper.clearAccessToken();
          setIsDriveBound(false);
        }
        return;
      }
      const list = Array.isArray(r.list) ? r.list : [];
      setPanFiles(list);
      if (!selectedPanFile) {
        const firstFolder = list.find((f) => Number(f.isdir) === 1);
        setSelectedPanFile(firstFolder || list[0] || null);
      } else {
        const stillExists = list.find((f) => String(f.fs_id) === String(selectedPanFile.fs_id));
        setSelectedPanFile(stillExists || null);
      }
    } catch (e: any) {
      setPanError(e?.message || String(e));
      setPanFiles([]);
    } finally {
      setPanLoading(false);
    }
  };

  const handleItemClick = (file: PanFile) => {
    const isDir = Number(file.isdir) === 1;
    if (isDir) {
      setSelectedPanFile(file);
    } else if (VIDEO_EXT_RE.test(file.server_filename || '')) {
      setSelectedPanFile(file);
    } else {
      setSelectedPanFile(file);
    }
  };

  const handleDrillDown = (file: PanFile) => {
    if (Number(file.isdir) !== 1) return;
    const path = typeof file.path === 'string' && file.path ? file.path : `${currentDir === '/' ? '' : currentDir}/${file.server_filename}`;
    setCurrentDir(path);
    setSelectedPanFile(null);
  };

  const handleGoParent = () => {
    if (!currentDir || currentDir === '/') return;
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    const next = parts.length ? '/' + parts.join('/') : '/';
    setCurrentDir(next);
    setSelectedPanFile(null);
  };

  const videoStatsOfFolder = (folder: PanFile): { videos: number; total: number } => {
    if (Number(folder.isdir) !== 1) return { videos: 0, total: 0 };
    // 当前 list 里的条目其实是 currentDir 下的；folder 可能还没下钻。
    // 这里优先：如果当前正好在 folder 的 path 下，就直接用 panFiles 计算；否则给空，UI 不误导。
    const currentPathMatch =
      folder.path && (folder.path === currentDir || folder.path + '/' === currentDir || currentDir === folder.path);
    if (currentPathMatch) {
      let videos = 0;
      for (const f of panFiles) {
        if (Number(f.isdir) !== 1 && VIDEO_EXT_RE.test(f.server_filename || '')) videos++;
      }
      return { videos, total: panFiles.length };
    }
    return { videos: 0, total: 0 };
  };

  const handleConfirmImport = async () => {
    if (!selectedPanFile) {
      Taro.showToast({ title: '请先选择一个文件夹', icon: 'none' });
      return;
    }
    const isDir = Number(selectedPanFile.isdir) === 1;
    if (!isDir) {
      Taro.showToast({ title: '请选择一个文件夹（视频目录）', icon: 'none' });
      return;
    }
    setImporting(true);
    Taro.showLoading({ title: 'AI 匹配教案中...' });
    try {
      const folderPath = typeof selectedPanFile.path === 'string' && selectedPanFile.path
        ? selectedPanFile.path
        : `${currentDir === '/' ? '' : currentDir}/${selectedPanFile.server_filename}`;
      let videoCount = 0;
      let totalEntries = 0;
      // 若当前就显示该目录内容 → 直接统计；否则再拉一次该目录，确保真实
      const isCurrentShownAsFolder = folderPath === currentDir;
      if (isCurrentShownAsFolder) {
        videoCount = videoStatsOfFolder(selectedPanFile).videos;
        totalEntries = panFiles.length;
      } else {
        const r = await CloudDriveHelper.getFileList(folderPath);
        if (r && r.errno === 0 && Array.isArray(r.list)) {
          totalEntries = r.list.length;
          for (const f of r.list) {
            if (Number(f.isdir) !== 1 && VIDEO_EXT_RE.test(f.server_filename || '')) videoCount++;
          }
        }
      }
      appendImportedSeries({
        seriesFolderPath: folderPath,
        folderName: selectedPanFile.server_filename || folderPath.split('/').pop() || folderPath,
        fsId: String(selectedPanFile.fs_id || ''),
        videoCount,
        totalEntries,
        importedAt: Date.now(),
      });
      await new Promise((r) => setTimeout(r, 1000));
      Taro.hideLoading();
      Taro.showToast({ title: `已加入乐园！含${videoCount}集视频`, icon: 'success', duration: 2500 });
      setShowFilePicker(false);
    } catch (e: any) {
      Taro.hideLoading();
      Taro.showToast({ title: e?.message || '导入失败', icon: 'none' });
    } finally {
      setImporting(false);
    }
  };

  const breadcrumbParts = useMemo(() => {
    return currentDir.split('/').filter(Boolean);
  }, [currentDir]);

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

        {isDriveBound && (
          <View className={styles.tokenMiniRow} onClick={() => { setPastingToken(true); setTokenDraft(''); }}>
            <Text className={styles.tokenMiniText}>点击更新 access_token</Text>
            <Text className={styles.arrow}>></Text>
          </View>
        )}

        {pastingToken && (
          <View className={styles.tokenPasteCard}>
            <Text className={styles.tokenPasteLabel}>把 Web 端授权后的 access_token 粘贴到下面：</Text>
            <Input
              className={styles.tokenPasteInput}
              value={tokenDraft}
              placeholder="以 123. 或 21. 开头的一长串字符"
              onInput={(e) => setTokenDraft(e.detail.value)}
            />
            <View className={styles.tokenPasteActions}>
              <View className={styles.tokenBtnGhost} onClick={() => { setPastingToken(false); setTokenDraft(''); }}>
                <Text>取消</Text>
              </View>
              <View className={styles.tokenBtnPrimary} onClick={handleSaveToken}>
                <Text>保存</Text>
              </View>
            </View>
          </View>
        )}

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

        {importedList.length > 0 && (
          <View className={styles.importedSection}>
            <Text className={styles.sectionTitle2}>📒 已导入的动画文件夹</Text>
            {importedList.map((s, idx) => (
              <View key={idx} className={styles.importedItem}>
                <Text className={styles.importedIcon}>✅</Text>
                <View className={styles.importedInfo}>
                  <Text className={styles.importedName}>{s.folderName}</Text>
                  <Text className={styles.importedMeta}>含 {s.videoCount} 集视频 · {s.totalEntries} 个条目</Text>
                </View>
              </View>
            ))}
          </View>
        )}
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

      <View className={styles.mascotWrapper}>
        <Image
          src="https://api.iconify.design/1-cute-cat.svg"
          className={styles.mascotImg}
          mode="aspectFit"
        />
        <View className={styles.bubble}>
          <Text>Keep Going!</Text>
        </View>
      </View>

      {!showFilePicker && !pastingToken && <CustomTabBar current={3} />}

      {pastingToken && (
        <View className={styles.modalOverlay}>
          <View className={styles.modalContent}>
            <View className={styles.modalHeader}>
              <Text className={styles.modalTitle}>更新 access_token</Text>
              <Text className={styles.closeBtn} onClick={() => { setPastingToken(false); setTokenDraft(''); }}>✕</Text>
            </View>
            <Text className={styles.tokenHint}>
              Web 端完成授权后（https://kids-cartoon-two.vercel.app/auth），在 DevTools → Application → Local Storage 中把 access_token 复制到这里即可。
            </Text>
            <Input
              className={styles.tokenPasteInput}
              value={tokenDraft}
              placeholder="粘贴 access_token"
              onInput={(e) => setTokenDraft(e.detail.value)}
            />
            <View className={styles.modalFooter}>
              <View className={styles.confirmImportBtn} onClick={handleSaveToken}>
                <Text>保存并启用</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {showFilePicker && (
        <View className={styles.modalOverlay}>
          <View className={styles.modalContent}>
            <View className={styles.modalHeader}>
              <Text className={styles.modalTitle}>选择网盘文件夹</Text>
              <Text className={styles.closeBtn} onClick={() => setShowFilePicker(false)}>✕</Text>
            </View>

            <View className={styles.pathRow}>
              <Text className={styles.pathLabel}>当前目录：</Text>
              <View className={styles.breadcrumb}>
                <Text
                  className={styles.crumbItem}
                  onClick={() => setCurrentDir('/')}
                >/</Text>
                {breadcrumbParts.map((p, i) => {
                  const pathTo = '/' + breadcrumbParts.slice(0, i + 1).join('/');
                  return (
                    <View key={i} className={styles.crumbWithSep}>
                      <Text className={styles.crumbSep}>/</Text>
                      <Text
                        className={styles.crumbItem}
                        onClick={() => setCurrentDir(pathTo)}
                      >{decodeURIComponent(p)}</Text>
                    </View>
                  );
                })}
              </View>
              {currentDir && currentDir !== '/' && (
                <View className={styles.backBtn} onClick={handleGoParent}>
                  <Text>⬆ 上一级</Text>
                </View>
              )}
            </View>

            {panLoading && (
              <View className={styles.statusRow}>
                <Text className={styles.statusText}>🔄 正在从百度网盘拉取目录...</Text>
              </View>
            )}

            {!panLoading && panError && (
              <View className={styles.errorRow}>
                <Text className={styles.errorText}>❌ {panError}</Text>
                <View className={styles.retryBtn} onClick={() => loadDir(currentDir)}>
                  <Text>重试</Text>
                </View>
              </View>
            )}

            {!panLoading && !panError && panFiles.length === 0 && (
              <View className={styles.statusRow}>
                <Text className={styles.statusText}>📭 当前目录为空或没有权限读取</Text>
                <View className={styles.retryBtn} onClick={handleGoParent}>
                  <Text>返回上一级</Text>
                </View>
              </View>
            )}

            <View className={styles.fileList}>
              {panFiles.map((file) => {
                const isDir = Number(file.isdir) === 1;
                const isVideo = !isDir && VIDEO_EXT_RE.test(file.server_filename || '');
                const selected = selectedPanFile && String(selectedPanFile.fs_id) === String(file.fs_id);
                let desc = '';
                if (isDir) {
                  const st = videoStatsOfFolder(file);
                  if (st.total > 0) desc = `包含 ${st.videos} 个视频 / ${st.total} 个条目`;
                  else desc = '📁 文件夹（点右侧进入）';
                } else if (isVideo) {
                  const mb = Number(file.size || 0) / 1024 / 1024;
                  desc = `🎞 视频 · ${mb.toFixed(1)} MB`;
                } else {
                  desc = '📄 文件（建议选择文件夹或视频）';
                }
                return (
                  <View key={String(file.fs_id)} className={styles.fileItem} onClick={() => handleItemClick(file)}>
                    <Text className={styles.folderIcon}>{isDir ? '📁' : isVideo ? '🎞' : '📄'}</Text>
                    <View className={styles.folderInfo}>
                      <Text className={styles.folderName}>{file.server_filename || '(未命名)'}</Text>
                      <Text className={styles.folderDesc}>{desc}</Text>
                    </View>
                    <View className={styles.fileItemRight}>
                      {isDir && (
                        <View className={styles.drillBtn} onClick={(e) => { e.stopPropagation(); handleDrillDown(file); }}>
                          <Text>进入</Text>
                        </View>
                      )}
                      <View className={selected ? styles.radioChecked : styles.radioUnchecked}></View>
                    </View>
                  </View>
                );
              })}
            </View>

            <View className={styles.modalFooter}>
              <View
                className={classnames(styles.confirmImportBtn, (!selectedPanFile || importing) && styles.disabledBtn)}
                onClick={handleConfirmImport}
              >
                <Text>{importing ? '导入中...' : '确认导入并匹配教案'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default MinePage;
