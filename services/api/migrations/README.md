# 数据库迁移

SQLx 数据库迁移目录。迁移按时间顺序新增，已经共享或执行的迁移不得重写。

在项目根目录配置 `DATABASE_URL` 后执行：

```powershell
sqlx migrate run --source services/api/migrations --database-url $env:DATABASE_URL
```

API 当前不会自动执行迁移；启动服务前必须先完成此步骤。

- `202608040001_add_room_lifecycle.sql`：记录成员离会和空房间关闭时间，保留会议历史数据。
