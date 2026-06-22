<template>
  <view class="player-container">
    <!-- 视频底层 -->
    <video
      id="babyVideo"
      class="video-element"
      :src="videoSrc"
      :autoplay="true"
      :controls="true"
      @timeupdate="handleTimeUpdate"
    ></video>

    <!-- 互动层：与 video 同级或嵌套，z-index 提高，禁用自身的指针事件以防遮挡视频控制栏 -->
    <view class="interactive-layer">
      <!-- 漂浮贴纸：启用指针事件，确保能点击 -->
      <view
        v-for="item in activeItems"
        :key="item.uid"
        class="floating-item"
        :class="{ 'is-popping': item.isPopping }"
        :style="{ left: item.coordX + '%' }"
        @click.stop="handleItemClick(item)"
      >
        <image :src="item.image" class="item-image" mode="aspectFit" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';

// ================= 类型定义 =================
export interface CourseEvent {
  id: string;          // 唯一ID
  time: number;        // 触发时间（秒，如 3.0）
  word: string;        // 英文单词
  image: string;       // 本地透明PNG路径
  audio: string;       // 本地发音MP3路径
  sound: string;       // 本地点击爆炸音效MP3路径
}

interface ActiveItem extends CourseEvent {
  uid: string;         // 运行时唯一实例ID，防止同一个事件重复复用ID
  coordX: number;      // 随机X轴百分比
  isPopping: boolean;  // 是否正在播放破裂动画
  timer?: ReturnType<typeof setTimeout>; // 销毁定时器
}

// ================= 组件通信 =================
const props = defineProps<{
  videoSrc: string;
  courseEvents: CourseEvent[];
}>();

const emit = defineEmits<{
  (e: 'onScore', word: string): void;
}>();

// ================= 状态管理 =================
const activeItems = ref<ActiveItem[]>([]);
const triggeredEventIds = ref<Set<string>>(new Set()); // 记录本次播放已触发的事件，防止重复触发

// ================= 核心逻辑：时间轴节流与匹配 =================
let lastUpdateTime = 0;

const handleTimeUpdate = (e: any) => {
  const currentTime = e.detail.currentTime; // 单位：秒

  // 节流处理：限制处理频率，防止高频计算（约200ms判断一次即可）
  if (Math.abs(currentTime - lastUpdateTime) < 0.2) return;
  lastUpdateTime = currentTime;

  // 匹配教案事件
  props.courseEvents.forEach(event => {
    // 判断误差范围 ±0.2s 内，且未被触发过
    if (
      Math.abs(currentTime - event.time) <= 0.2 &&
      !triggeredEventIds.value.has(event.id)
    ) {
      triggerEvent(event);
    }
  });
};

const triggerEvent = (event: CourseEvent) => {
  triggeredEventIds.value.add(event.id);

  // 随机生成 15% - 75% 之间的 X 坐标，避免贴边
  const randomX = Math.floor(Math.random() * 61) + 15;

  const newItem: ActiveItem = {
    ...event,
    uid: `${event.id}_${Date.now()}`,
    coordX: randomX,
    isPopping: false
  };

  activeItems.value.push(newItem);

  // 6秒内未点击，自动销毁，防止积压导致 DOM 卡顿
  newItem.timer = setTimeout(() => {
    removeActiveItem(newItem.uid);
  }, 6000);
};

// ================= 核心逻辑：交互与音频 =================
const handleItemClick = (item: ActiveItem) => {
  if (item.isPopping) return; // 防止连击

  item.isPopping = true;
  
  // 清除自动销毁的定时器
  if (item.timer) clearTimeout(item.timer);

  // 播放音效与发音（独立播放，不影响视频主音轨）
  playAudio(item.sound);
  setTimeout(() => playAudio(item.audio), 300); // 爆破音效后紧接单词发音

  // 抛出得分事件
  emit('onScore', item.word);

  // 延时300ms等待 CSS 破裂动画执行完毕后移出 DOM
  setTimeout(() => {
    removeActiveItem(item.uid);
  }, 300);
};

const removeActiveItem = (uid: string) => {
  const index = activeItems.value.findIndex(i => i.uid === uid);
  if (index > -1) {
    activeItems.value.splice(index, 1);
  }
};

// 播放本地音频的辅助函数（创建后必须 destroy 防止内存泄漏）
const playAudio = (src: string) => {
  if (!src) return;
  const innerAudioContext = uni.createInnerAudioContext();
  innerAudioContext.autoplay = true;
  innerAudioContext.src = src;
  
  innerAudioContext.onEnded(() => {
    innerAudioContext.destroy();
  });
  innerAudioContext.onError((res) => {
    console.error('音频播放错误', res);
    innerAudioContext.destroy();
  });
};

// ================= 生命周期 =================
onBeforeUnmount(() => {
  // 清理所有残留定时器
  activeItems.value.forEach(item => {
    if (item.timer) clearTimeout(item.timer);
  });
  activeItems.value = [];
});
</script>

<style scoped lang="scss">
.player-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #000;
}

.video-element {
  width: 100%;
  height: 100%;
}

/* 互动层：pointer-events: none 防止拦截视频控件点击 */
.interactive-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none; 
}

/* 漂浮贴纸容器：
   1. pointer-events: auto 恢复触控
   2. 极度宽大的触控热区 110px * 110px 
   3. 居中对齐内部小图片
   4. 应用 6s 匀速下落动画
*/
.floating-item {
  position: absolute;
  top: -110px; /* 初始位置在屏幕最上方之外 */
  width: 110px;
  height: 110px;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: auto;
  
  /* 使用 transform 执行硬件加速的动画 */
  animation: float-fall 6s linear forwards;
}

/* 内部真实图片大小 60px * 60px */
.item-image {
  width: 60px;
  height: 60px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

/* 点击爆破状态下的附加类 */
.is-popping {
  /* 覆盖原始下落动画，停留在当前位置并执行爆破 */
  animation: pop-explode 0.3s ease-out forwards !important;
}

/* ================= 关键帧动画 ================= */

/* 1. 掉落与悬浮动画 */
@keyframes float-fall {
  0% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(25vh) rotate(15deg);
  }
  50% {
    transform: translateY(50vh) rotate(-10deg);
  }
  75% {
    transform: translateY(75vh) rotate(20deg);
  }
  100% {
    transform: translateY(110vh) rotate(45deg);
  }
}

/* 2. 点击爆破消失动画 */
@keyframes pop-explode {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
</style>
