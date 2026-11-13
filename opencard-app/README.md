# OpenCard 应用

Vue 3 + TypeScript + Vite 前端，桌面壳为 Tauri 2。

开发、构建与测试命令见仓库根 `README.md` 的「从源码构建」。

## 性能页

`performance/interaction.html` 在浏览器里挂真实的文件树和卡片编辑器，不需要 Tauri：

```bash
npx vite --config scripts/performance-vite-config.ts
```

打开 `/performance/interaction.html?files=10000`，`files` 是模拟的项目文件数。
