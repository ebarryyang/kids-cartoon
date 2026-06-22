<template>
  <div class="timeline-editor-container">
    <!-- 顶部控制栏 -->
    <div class="top-bar">
      <h2>AI 动画教案可视化编辑器</h2>
      <div class="actions">
        <el-button type="primary" @click="startSimulationPreview">AI 模拟预览</el-button>
        <el-button type="success" @click="saveAndPublish">保存并发布</el-button>
      </div>
    </div>

    <el-row :gutter="20" class="editor-main">
      <!-- 左侧面板：视频播放区 (60%) -->
      <el-col :span="14" class="left-panel">
        <div class="video-wrapper">
          <video
            ref="videoRef"
            class="main-video"
            controls
            :src="videoSrc"
            @timeupdate="handleTimeUpdate"
          ></video>

          <!-- AI 模拟预览时的漂浮词汇展示 -->
          <div v-if="previewWord" class="preview-bubble" :style="{ left: previewX + '%', top: previewY + '%' }">
            {{ previewWord }}
          </div>
        </div>

        <div class="video-actions">
          <el-button type="primary" size="large" icon="Plus" @click="addInteractionPoint">
            添加交互点 (当前时间: {{ currentVideoTime.toFixed(1) }}s)
          </el-button>
        </div>
      </el-col>

      <!-- 右侧面板：时间轴列表区 (40%) -->
      <el-col :span="10" class="right-panel">
        <div class="timeline-header">
          <h3>交互节点列表 ({{ eventList.length }})</h3>
        </div>
        
        <div class="timeline-list">
          <el-empty v-if="eventList.length === 0" description="暂无交互点，请在左侧添加" />
          
          <el-timeline v-else>
            <el-timeline-item
              v-for="(item, index) in eventList"
              :key="item.id"
              :timestamp="`触发时间: ${item.time.toFixed(1)}s`"
              placement="top"
              type="primary"
            >
              <el-card class="event-card">
                <el-form :model="item" label-width="80px" size="small">
                  <el-form-item label="触发时间">
                    <el-input-number v-model="item.time" :precision="1" :step="0.1" :min="0" />
                  </el-form-item>
                  <el-form-item label="核心单词">
                    <el-input v-model="item.word" placeholder="例如: Apple" />
                  </el-form-item>
                  <el-form-item label="X坐标(%)">
                    <el-input-number v-model="item.coordX" :min="0" :max="100" />
                  </el-form-item>
                  <el-form-item label="Y坐标(%)">
                    <el-input-number v-model="item.coordY" :min="0" :max="100" />
                  </el-form-item>
                  
                  <div class="card-actions">
                    <el-button type="info" plain size="small" @click="seekAndPlay(item.time)">定位播放</el-button>
                    <el-button type="danger" plain size="small" @click="removeEvent(index)">删除</el-button>
                  </div>
                </el-form>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';

// ================= 数据结构定义 =================
export interface TimelineEvent {
  id: string;         // 随机唯一ID
  time: number;       // 时间戳（秒）
  word: string;       // 单词
  coordX: number;     // 气泡横坐标百分比 (0-100)
  coordY: number;     // 气泡纵坐标百分比 (0-100)
}

// ================= 状态声明 =================
const videoSrc = ref<string>('https://example.com/sample_animation.mp4'); // 替换为真实视频源
const videoRef = ref<HTMLVideoElement | null>(null);
const currentVideoTime = ref<number>(0);
const eventList = ref<TimelineEvent[]>([]);

// 预览相关状态
const isPreviewing = ref<boolean>(false);
const previewWord = ref<string>('');
const previewX = ref<number>(50);
const previewY = ref<number>(50);
let previewTimer: ReturnType<typeof setTimeout> | null = null;
const triggeredPreviewIds = ref<Set<string>>(new Set());

// ================= 左侧面板逻辑 =================
const handleTimeUpdate = (e: Event) => {
  const target = e.target as HTMLVideoElement;
  currentVideoTime.value = target.currentTime;

  // AI 模拟预览逻辑
  if (isPreviewing.value) {
    eventList.value.forEach(event => {
      // 误差 0.2s 内触发预览
      if (Math.abs(target.currentTime - event.time) <= 0.2 && !triggeredPreviewIds.value.has(event.id)) {
        triggerPreviewBubble(event);
      }
    });
  }
};

const addInteractionPoint = () => {
  const newEvent: TimelineEvent = {
    id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    time: Number(currentVideoTime.value.toFixed(1)),
    word: '',
    coordX: 50, // 默认居中
    coordY: 20  // 默认偏上
  };
  
  eventList.value.push(newEvent);
  
  // 按照时间自动排序
  eventList.value.sort((a, b) => a.time - b.time);
  ElMessage.success(`已添加交互点：${newEvent.time}s`);
};

// ================= 右侧面板逻辑 =================
const seekAndPlay = (time: number) => {
  if (videoRef.value) {
    videoRef.value.currentTime = time;
    videoRef.value.play();
  }
};

const removeEvent = (index: number) => {
  eventList.value.splice(index, 1);
  ElMessage.warning('交互点已删除');
};

// ================= 顶部控制栏逻辑 =================
const startSimulationPreview = () => {
  if (!videoRef.value) return;
  
  isPreviewing.value = true;
  triggeredPreviewIds.value.clear();
  clearPreviewTimer();
  previewWord.value = '';
  
  // 视频从头开始播放
  videoRef.value.currentTime = 0;
  videoRef.value.play();
  ElMessage.info('开始 AI 模拟预览');
};

const triggerPreviewBubble = (event: TimelineEvent) => {
  triggeredPreviewIds.value.add(event.id);
  previewWord.value = event.word || '未命名单词';
  previewX.value = event.coordX;
  previewY.value = event.coordY;
  
  clearPreviewTimer();
  
  // 模拟气泡停留 3 秒
  previewTimer = setTimeout(() => {
    previewWord.value = '';
  }, 3000);
};

const clearPreviewTimer = () => {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
};

const saveAndPublish = () => {
  const jsonData = JSON.stringify(eventList.value, null, 2);
  console.log('【导出的教案 JSON 数据】', jsonData);
  
  // 浏览器下载 JSON 文件
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `courseware_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  ElMessage.success('保存成功！文件已下载');
};

// ================= 生命周期 =================
onBeforeUnmount(() => {
  clearPreviewTimer();
});
</script>

<style scoped>
.timeline-editor-container {
  padding: 20px;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 15px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.05);
}

.top-bar h2 {
  margin: 0;
  color: #303133;
}

.editor-main {
  flex: 1;
  overflow: hidden;
}

.left-panel, .right-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 左侧视频区 */
.video-wrapper {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
}

.main-video {
  width: 100%;
  height: 100%;
  outline: none;
}

.video-actions {
  margin-top: 20px;
  text-align: center;
}

/* 模拟预览的气泡 */
.preview-bubble {
  position: absolute;
  transform: translate(-50%, -50%);
  background-color: rgba(255, 204, 0, 0.9);
  color: #d32f2f;
  padding: 10px 20px;
  border-radius: 50px;
  font-weight: bold;
  font-size: 24px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  pointer-events: none;
  animation: pop-in 0.3s ease-out forwards;
  z-index: 100;
}

@keyframes pop-in {
  0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}

/* 右侧时间轴区 */
.timeline-header {
  background: #fff;
  padding: 15px;
  border-radius: 8px 8px 0 0;
  border-bottom: 1px solid #ebeef5;
}

.timeline-header h3 {
  margin: 0;
  color: #303133;
}

.timeline-list {
  flex: 1;
  background: #fff;
  padding: 20px;
  border-radius: 0 0 8px 8px;
  overflow-y: auto;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.05);
}

.event-card {
  margin-bottom: 10px;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
</style>
