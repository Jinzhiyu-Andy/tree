# 粒子圣诞树 (Three.js)

一个基于 Three.js 的交互式粒子圣诞树示例，支持浏览器内实时渲染与相机控制。

在线演示： https://jinzhiyu-andy.github.io/tree/ 

[![pages-build-deployment](https://github.com/Jinzhiyu-Andy/tree/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Jinzhiyu-Andy/tree/actions/workflows/deploy-pages.yml)

> 注意：为使 GitHub Actions 能成功自动推送到 `gh-pages`，请在仓库 **Settings → Actions → General** 中确保允许 GitHub Actions 推送分支（默认通常允许）。如果你的组织策略限制了 Actions 的写权限，需在 **Settings → Pages** 中允许 Actions 部署或为 workflow 配置带有 repo 权限的 PAT（添加到 Secrets，例如 `GH_PAGES_PAT`）。
运行（本地）：

- 直接打开 `index.html`（在支持 ES module 的浏览器中）
- 或用简单静态服务器： `npx serve .` 或 `python -m http.server 8000`

交互与 GUI：
- 使用鼠标拖拽旋转相机，滚轮缩放。
- 右上角有控制面板（lil-gui）可调整：粒子尺寸、闪烁强度、彩灯开关/数量、雪粒数量与是否重新生成等。

文件结构简要：
- `index.html`：入口页面
- `src/styles.css`：简单样式
- `src/main.js`：Three.js 场景、粒子、彩灯与飘雪逻辑

性能与移动端：
- 会根据屏幕尺寸自动降低默认粒子数以改善移动端性能；可在 GUI 中手动调小 `粒子数量` 并点击 `重新生成树`。

下步计划：
- 部署到 GitHub Pages 并生成演示链接
- 增强着色器实现（更复杂的灯光与体积光）

作者: GitHub Copilot (Raptor mini (Preview))