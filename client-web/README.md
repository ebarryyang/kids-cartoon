# 英语宝贝动画宝 - C端网页版

面向家长和儿童的英语动画播放器，与百度网盘深度整合。

## 功能特性

- 邮箱注册/登录
- 百度网盘 OAuth 授权
- 网盘视频在线播放（自动绕过防盗链）
- 平台托管字幕与生词表
- 互动练习预留接口
- 儿童友好 UI 设计

## 技术栈

- React 19 + Vite 8 + TypeScript
- Tailwind CSS
- Zustand 状态管理
- React Router v7
- Python Flask 视频代理

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 环境要求

- Node.js >= 18
- Python 3.8+ (视频代理服务)

## 部署

本项目已配置 Vercel 自动部署，连接 GitHub 仓库即可。

## 版权说明

视频资源来自用户个人百度网盘，字幕及教学资料由平台托管。
