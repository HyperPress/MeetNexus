# MeetNexus Web 前端

本目录是 MeetNexus 的 React + TypeScript 前端工程，使用 Vite 构建，并通过 Tailwind CSS 与 daisyUI 约束界面样式。

## 常用命令

```powershell
npm ci
npm run dev
npm run lint
npm run build
```

## 开发约束

- 开始开发前阅读本目录的 `AGENTS.md` 和仓库根目录的 `AGENTS.md`。
- 用户可见的界面文案、提示、错误信息和无障碍文本必须使用简体中文。
- API 响应必须经过 Zod 运行时校验，不能只依赖 TypeScript 类型。
- 业务功能放在 `src/features/`，公共 API 和媒体能力放在 `src/lib/`。
- 端到端测试放在 `tests/e2e/`。
