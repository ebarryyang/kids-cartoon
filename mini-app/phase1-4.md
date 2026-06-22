## 产品 PRD 设计

### 核心功能点
1. **互动视频播放器（C端-幼儿）**
   - 0-4岁幼儿专属界面，全屏播放，视频不暂停
   - 根据时间戳自动掉落超大触控热区的卡通贴纸
   - 贴纸点击爆破特效、独立音效及单词发音
   - 极简、防误触操作设计，保护沉浸式心流
2. **网盘流媒体对接**
   - 授权网盘资源，提取临时直链播放，规避侵权风险
   - 兼容投屏操作（手机端显示遥控器形态）
3. **教案管理后台（B端-管理员）**
   - 左右双栏布局（左侧视频预览，右侧时间轴编辑）
   - AI模拟预览：实时演示交互点的触发效果
   - 交互教案数据导出（JSON格式）

### 页面列表
| 页面名称 | 目录名 | 页面类型 | 功能点列表 |
|---------|--------|----------|----------|
| 播放大厅 | index | tabBar页面 | 核心播放器、云盘资源列表、投屏控制 |
| 管理后台 | admin | tabBar页面 | 视频预览、时间轴编辑、JSON教案导出 |

---

## 全局视觉设计方案

### 视觉风格
- **C端（播放大厅）**：卡通化、低幼友好、大色块、圆润边界，极简操作，减少视觉干扰，色彩明快鲜艳。
- **B端（管理后台）**：B端经典的中后台风格，注重效率、空间利用与表单易用性。

### 配色方案
- 主题色：#FFD13B (卡通黄，吸引幼儿注意力)
- 辅助色：#FF7D00 (活力橙) / #00B42A (通过绿)
- 背景色：页面 #F5F7FA / 卡片 #FFFFFF / 播放器 #000000
- 文本色：主要 #1D2129 / 次要 #4E5969 / 辅助 #86909C
- 边框色：#E5E6EB

### 设计规范
- 间距系统：8的倍数（16rpx, 24rpx, 32rpx）
- 圆角设计：按钮 48rpx（全圆角胶囊），卡片 24rpx（超大圆角显得柔和）
- 触控热区：C端所有可点击元素确保最小 110rpx x 110rpx

---

## 依赖库选择

- UI 组件：Taro 内置组件（View, Text, Image, Video, ScrollView, Input 等）
- 状态管理：React Hooks (useState, useEffect, useRef)
- 样式处理：CSS Modules (*.module.scss)
- 工具库：classnames

---

## 项目文件结构规划

```
mini-app/src/
├── app.config.ts
├── app.ts
├── app.scss
├── styles/
│   ├── theme.scss
│   └── variables.scss
├── types/
│   └── index.ts
├── pages/
│   ├── index/ (C端：互动播放大厅)
│   │   ├── index.tsx
│   │   ├── index.module.scss
│   │   └── index.config.ts
│   └── admin/ (B端：管理后台)
│       ├── index.tsx
│       ├── index.module.scss
│       └── index.config.ts
├── components/
│   ├── InteractiveVideoPlayer/
│   │   ├── index.tsx
│   │   └── index.module.scss
│   └── TimelineEditor/
│       ├── index.tsx
│       └── index.module.scss
├── services/
│   └── cloudDriveHelper.ts
└── data/
    └── mock.ts
```