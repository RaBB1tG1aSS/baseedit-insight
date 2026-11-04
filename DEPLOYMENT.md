# 部署说明

BaseEdit Insight 按**单用户、本地优先**设计。Web 与 Worker 是两个独立进程，共享同一个 SQLite 文件（WAL 模式）。

> **重要限制**：`AI_PROVIDER=claude-cli` 依赖宿主机已登录的 Claude Code。Docker 容器内没有该登录态，
> 因此容器化部署必须使用 `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`，或在宿主机单独运行 worker。
> 不配置 AI 时应用仍可运行，但只生成摘要级内容和数据模板周报。

---

## 1. 本地生产模式（推荐）

```bash
npm ci
npm run build
npm start          # 终端 A：Web
npm run worker     # 终端 B：后台任务与调度
```

或使用一个命令（两个进程仍在同一 shell 下）：

```bash
npm run start:all
```

访问 <http://localhost:3000>。

### Windows 后台常驻

- **任务计划程序**：创建两个任务，分别运行 `npm start` 与 `npm run worker`，起始目录设为项目目录，勾选“不管用户是否登录都运行”。
- **NSSM / WinSW**：把 `node_modules\.bin\next.cmd start` 与 `node_modules\.bin\tsx.cmd worker/index.ts` 注册为服务。
- worker 必须独立于浏览器存在；关闭浏览器不影响定时任务。

---

## 2. Linux systemd

`/etc/systemd/system/baseedit-web.service`

```ini
[Unit]
Description=BaseEdit Insight Web
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/baseedit-insight
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=baseedit
Group=baseedit

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/baseedit-worker.service`

```ini
[Unit]
Description=BaseEdit Insight Worker (queue + cron)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/baseedit-insight
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
User=baseedit
Group=baseedit

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now baseedit-web baseedit-worker
sudo journalctl -u baseedit-worker -f
```

数据目录必须位于本机文件系统（不要 NFS/SMB）；建议单独挂载并定期备份。

---

## 3. Docker Compose

```bash
cp .env.example .env.local
# 编辑 .env.local：
#   DATABASE_PATH=./data/baseedit.db
#   AI_PROVIDER=anthropic
#   ANTHROPIC_API_KEY=...
docker compose up -d --build
docker compose logs -f worker
```

- `web` 暴露 3000；`worker` 只跑队列与 cron。
- 两个容器共享 `./data` 卷；请确保宿主机是本地磁盘。
- 升级：`docker compose build --pull && docker compose up -d`。
- SQLite 在容器 bind mount 上的锁行为取决于宿主文件系统；若出现 `SQLITE_BUSY`，请改为单个容器同时运行两个进程，或迁移到本地卷。

---

## 4. 反向代理与访问控制

应用本身没有账号体系（单用户设计）。公网暴露前必须加认证：

### Caddy（Basic Auth）

```caddy
baseedit.example.com {
    basicauth {
        admin $2a$14$REPLACE_WITH_BCRYPT_HASH
    }
    reverse_proxy 127.0.0.1:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name baseedit.example.com;

    auth_basic "BaseEdit Insight";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

同时建议：

- 仅监听内网或 VPN；
- 限制 `/api/*` 的写入接口来源；
- 定期备份 `data/`；
- 不要把 `.env.local` 提交到版本库。

---

## 5. 备份与恢复

### 在线备份（推荐）

```bash
npm run db:backup
# 或设置页 →「立即备份数据库」
```

生成 `data/backups/baseedit-YYYY-MM-DDTHH-MM-SS.db`，使用 SQLite Online Backup API，保证一致性。

建议 cron：

```
0 3 * * * cd /opt/baseedit-insight && npm run db:backup
```

同时保留最近 N 份（自行用 `find ... -mtime +30 -delete`）。

### 恢复

1. 停止 Web 与 Worker。
2. 将备份文件复制为 `data/baseedit.db`。
3. 删除 `data/baseedit.db-wal` 与 `data/baseedit.db-shm`。
4. 启动 Web；worker 启动后会自动重新排队遗留任务。

```bash
systemctl stop baseedit-web baseedit-worker
cp data/backups/baseedit-2026-11-04T12-00-00.db data/baseedit.db
rm -f data/baseedit.db-wal data/baseedit.db-shm
systemctl start baseedit-web baseedit-worker
```

---

## 6. 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_PATH` | SQLite 路径，Web 与 Worker 必须一致 |
| `APP_TIMEZONE` | 默认调度时区（可被设置页覆盖） |
| `SCHEDULER_ENABLED` | worker 是否持有 cron |
| `DAILY_RUN_TIME` / `WEEKLY_RUN_DAY` / `WEEKLY_RUN_TIME` | 默认调度时间 |
| `AI_PROVIDER` | `claude-cli` 或 `anthropic` |
| `ANTHROPIC_API_KEY` | anthropic 模式必填 |
| `AI_MAX_BUDGET_USD` | claude-cli 单次调用预算 |
| `NCBI_EMAIL` / `NCBI_API_KEY` | NCBI 礼貌池与速率 |
| `OPENALEX_MAILTO` | OpenAlex 礼貌池 |
| `SEMANTIC_SCHOLAR_API_KEY` | 可选补充引用 |
| `MIN_ACCEPT_SCORE` / `MIN_TOPIC_RELEVANCE` / `MAX_CANDIDATES_PER_RUN` | 首次写入数据库的默认门槛（设置页修改后以数据库为准） |

---

## 7. 健康检查与运行验证

```bash
curl http://localhost:3000/api/health
```

返回数据库路径、论文状态计数、worker 在线状态、AI 可用性。`worker.online=false` 说明 worker 未运行或心跳超过 25 秒。

真实定时任务验证方法：

1. 在设置页把「每日流水线时间」改为当前时间 + 2 分钟；
2. 确认 worker 正在运行；
3. 观察 Agent 页面出现 `requested_by=scheduler` 的任务；
4. 验证完成后改回 08:00。

worker 启动时会补偿当天已错过的时间点，但不会重复创建同一天的任务。

---

## 8. 升级

```bash
git pull                # 或替换代码
npm ci
npm run db:migrate      # 幂等；新增迁移会自动执行
npm run build
# 重启 web 与 worker
```

迁移 checksum 会阻止对已应用迁移文件的修改；新增字段请新建迁移文件，不要改旧文件。

---

## 9. 资源与限制

- 单 worker 串行执行任务；每日 7 篇论文的核验 + 2 篇精讲 + 4 张图分析约需 5–15 分钟（取决于网络与 AI）。
- AI 调用成本可在 Agent 日志中查看每次累计成本；`AI_MAX_BUDGET_USD` 限制单次调用。
- 图片由 PMC CDN 直接加载；离线环境会降级为「前往官方来源」。
