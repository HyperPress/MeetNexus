# ECS 公网部署说明

本文记录 MeetNexus 在 Linux ECS 上的直接部署方式。项目服务不使用 Docker 或 Compose；Nginx、API、Live777、PostgreSQL 和 Redis 均作为主机服务运行。

## 部署边界

- Nginx 对公网提供前端静态文件、同源 API、WebSocket 与 HTTPS。
- API 仅监听 `127.0.0.1:8080`，Live777 仅监听 `127.0.0.1:7777`；二者不得直接暴露到公网。
- PostgreSQL 与 Redis 仅监听回环地址。
- API、Live777 分别由 `meetnexus-api.service` 与 `meetnexus-live777.service` 管理，并设为开机自启。
- 生产配置和密钥保存在服务器 `/etc/meetnexus/api.env`，权限应为 `640 root:admin`；不得提交到 Git。

当前服务器中的主要路径如下：

| 项目 | 路径 |
| --- | --- |
| 项目代码与前端产物 | `/opt/meetnexus`、`/opt/meetnexus/apps/web/dist` |
| API 配置 | `/etc/meetnexus/api.env` |
| Live777 配置 | `/etc/meetnexus/live777.toml` |
| Nginx 配置 | `/etc/nginx/conf.d/meetnexus.conf` |
| HTTPS 证书 | `/var/lib/meetnexus/tls` |
| 录制文件 | `/var/lib/meetnexus/recordings` |

## 公网防火墙

在 ECS 控制台的“防火墙”页面配置入方向规则：

| 协议 | 端口范围 | 来源 | 用途 |
| --- | --- | --- | --- |
| TCP | `22` | 管理者固定 IP 优先 | SSH 运维 |
| TCP | `80` | `0.0.0.0/0` | HTTP 到 HTTPS 跳转和 ACME 验证 |
| TCP | `443` | `0.0.0.0/0` | 网站、API 与 WebSocket HTTPS |
| UDP | `32768/60999` | `0.0.0.0/0` | Live777 WebRTC 媒体传输 |

Live777 当前版本未提供固定媒体 UDP 端口范围配置，使用操作系统的临时 UDP 端口。因此第四条是双人音视频在不同网络间通信的必要条件。服务器的 API 和 Live777 HTTP 端口保持回环监听，不应额外开放 `8080` 或 `7777`。

## HTTPS 与续期

本次部署为公网 IP 申请了 Let's Encrypt IP 证书，并由 Nginx 在 `443` 提供服务。HTTP 的 `/.well-known/acme-challenge/` 路径保留给续期验证，其他 HTTP 请求永久重定向到 HTTPS。

IP 证书有效期较短；`acme.sh` 以 `admin` 用户的 crontab 定时运行，证书续期阈值设置为 4 天。续期会自动安装新证书并重载 Nginx。检查方式：

```bash
sudo -Hu admin crontab -l
sudo grep '^Le_RenewalDays' /home/admin/.acme.sh/<公网-IP>_ecc/<公网-IP>.conf
sudo systemctl status nginx
```

## 日常检查与排障

```bash
sudo systemctl status nginx meetnexus-api meetnexus-live777 redis postgresql-15
curl -fsS https://<公网-IP>/health
curl -fsS https://<公网-IP>/ready
sudo journalctl -u meetnexus-api -u meetnexus-live777 -n 100 --no-pager
sudo nginx -t
```

`/health` 表示 API 进程存活；`/ready` 同时检查 PostgreSQL、Redis 和 Live777。服务修改后，应先执行 `nginx -t` 或 `systemd-analyze verify`，再重载或重启对应服务。

## 上线验收

1. 在两台不同网络、具备真实摄像头与麦克风的设备上访问 `https://<公网-IP>/`。
2. 一台创建会议，另一台使用会议号加入。
3. 双方启动摄像头和麦克风，确认本地预览、远端音视频、成员实时事件、屏幕共享、离开清理均正常。
4. 若 HTTPS 页面与房间操作正常但媒体连接失败，先检查 UDP `32768/60999` 规则；仍失败时再依据浏览器 WebRTC 日志评估部署 TURN 服务的必要性。

TURN 是针对严格 NAT、企业网络等无法建立直连的中继方案，不是本次基础部署的替代品；它需要独立服务和额外凭据，应在实际验收失败后单独评估。
