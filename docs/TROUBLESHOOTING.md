# 故障排查

## `b1ack-dream` 没有出现在 Hermes memory setup

确认安装目录是 `<HERMES_HOME>/plugins/b1ack-dream/`，其中有 `__init__.py` 和 `plugin.yaml`，然后重启 Hermes。运行 `python scripts/install_hermes_plugin.py --hermes-home <目录> --force` 可重新部署代码。不要把整个仓库嵌套在 `plugins/` 下。

## Provider 显示 unavailable

运行 `node --version`，必须为 20 或更高；然后确认 `<HERMES_HOME>/plugins/b1ack-dream/runtime/hermes-sidecar.js` 存在。重新在仓库执行 `npm ci; npm run build:plugin` 并 `--force` 安装。Provider 不可用时 Hermes 应继续运行，但不会保存/召回 B1ack Dream 记忆。

## WebUI 打不开或端口被占用

先启动 Hermes 且选择 active `b1ack-dream`，再运行 `hermes b1ack-dream ui` 查看地址。默认端口 `0` 会自动选择可用端口；若设置了固定 port，改回 `0` 或选择另一个 localhost port 后重启 Hermes。服务只绑定 `127.0.0.1`，不要把它改为公网地址。

## Recall 为空

单次信息通常仍是 Recent/Observed，不保证作为确定长期事实召回。先在 WebUI 查看 Evidence、Boundary、状态和 Dream Diary；检查是否在正确的 Hermes profile 中。Recall/sidecar 超时会 fail-open 为空，不会阻塞聊天。对于罕见同义表述，可在 WebUI 编辑为更清晰、用户确认的长期记忆。

## Dream 失败、退出或数据损坏

在 WebUI 的 Dream/Audit 页面查看失败原因。Dream 失败不会覆盖旧数据。若 `memory-center.json` 损坏，运行时会拒绝写入；关闭 Hermes 后将同目录 `memory-center.json.bak` 复制为主文件，或从 Hermes backup 恢复，再重启。保留损坏文件用于排查。

## USER.md / MEMORY.md 编辑器不可用或看似未生效

先在 Provider 配置中显式启用 `enable_native_memory_editor`，然后重启 Hermes。B1ack Dream 使用当前 profile 的 `memories/USER.md` 和 `memories/MEMORY.md`，写入都需要确认。若当前会话没有立即读取新内容，请按 Hermes 官方流程刷新/重启会话；不要期待插件记忆和原生文件自动同步。

## profile 数据不一致、升级或备份恢复

确认运行中的 Hermes 使用预期的 `HERMES_HOME`；每个 profile 都有独立的 `b1ack-dream/` 目录。升级只替换 plugin code，不会迁移失败时覆盖旧数据。恢复时还原整个 profile backup 或至少 `b1ack-dream/` 目录，然后重启 Hermes。若 schema 版本高于当前 runtime，请先升级插件，不要降级覆盖数据。
