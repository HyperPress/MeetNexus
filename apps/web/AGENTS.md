# Web 前端协作规则

- 本目录遵循仓库根目录 `AGENTS.md`。
- 页面组合和路由入口放在 `src/app/`，通用 UI 放在 `src/components/`。
- 业务代码按功能放在 `src/features/`，不得把房间、会议等业务堆入 `App.tsx`。
- HTTP 客户端、WebRTC 适配等基础设施放在 `src/lib/`；API 响应必须经过 `src/schemas/` 的 Zod 校验。
- 跨功能共享类型放在 `src/types/`，功能私有类型留在对应 feature 内。
- 端到端测试放在 `tests/e2e/`，测试不得依赖未标注的伪造服务。
