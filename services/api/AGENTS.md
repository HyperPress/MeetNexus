# API 后端协作规则

- 本目录遵循仓库根目录 `AGENTS.md`。
- `domain/` 不依赖 Axum、SQLx、Redis 或 Live777；业务规则不能写进 HTTP handler。
- `application/` 编排用例并通过 trait 使用外部能力；`infrastructure/` 提供具体适配器。
- `http/` 只负责路由、鉴权上下文、请求解析和响应映射。
- 配置集中在 `config/`，结构化日志集中在 `telemetry/`，禁止散落读取环境变量。
- 数据库变更必须新增 `migrations/` 文件，不得修改已在其他环境执行的迁移。
- 公共接口变更必须先修改 `docs/openapi.yaml`，并补充相应测试。
