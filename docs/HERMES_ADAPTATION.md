# Hermes 适配记录

本轮已针对 NousResearch `hermes-agent` 主线提交 `6e5362833877ee370bf243f5b602f45318ae3f69` 实际读取源码并运行 Provider contract test。此记录不是接口猜测。

## 已验证接口

| 事项 | 已验证的 Hermes 行为 | B1ack Dream 对接 |
|---|---|---|
| 用户插件发现 | `$HERMES_HOME/plugins/<name>/`，有 `__init__.py`，并由 `plugins.memory` 动态加载 | 安装至 `$HERMES_HOME/plugins/b1ack-dream/` |
| 注册 | 插件公开 `register(ctx)`，collector 提供 `register_memory_provider(instance)` | `register()` 注册 `B1ackDreamMemoryProvider()` |
| Provider 必需项 | `name`、`is_available()`、`initialize()`、`get_tool_schemas()` | 全部实现；无 model-callable tool 时返回空 schema |
| Turn 归档 | `sync_turn(user_content, assistant_content, session_id, messages)` | 异步投递 Completed Turn，具幂等 source ID |
| 回答前召回 | `prefetch(query, session_id)` 返回字符串；`recall_status()` 供 UI 状态显示 | 本地 sidecar Recall，失败时 fail-open 空字符串 |
| 生命周期 | `on_turn_start`、`on_pre_compress`、`on_session_end`、`on_session_switch`、`shutdown` | 分别用于 scheduler、补存、Dream、清缓存和 flush/停服务 |
| 配置 | `config_schema.py` 声明式 flat JSON，位置 `<HERMES_HOME>/<provider>/config.json` | 声明风格、Dream、WebUI、原生编辑；Provider 读取同一文件 |
| 插件 CLI | active provider 的 `cli.py: register_cli(subparser)` 形成 `hermes <provider>` | `hermes b1ack-dream status/ui/dream` |
| backup | Hermes profile backup 自身递归包含 `HERMES_HOME`；`backup_paths()` 只收集外部路径 | 数据在 profile 内，返回 `[]` 避免重复备份 |
| 原生记忆 | Hermes 使用 `<HERMES_HOME>/memories/USER.md` 和 `MEMORY.md` | 仅在可选、明确确认的 editor 中使用这两个路径 |

## 运行时约束和降级

- `initialize()` 只有 `agent_context == "primary"` 时允许写入个人 profile；子代理、cron 或 flush context 不创建个人记忆。
- `sync_turn()` 不阻塞 Hermes 聊天线程；队列或 sidecar 异常只记录 warning，不影响主对话。
- `prefetch()` 限时 0.8 秒；异常返回空字符串，旧记忆不被损坏。
- `on_pre_compress()` 只检查最后一个完整 user/assistant 对；其 source ID 与 `sync_turn()` 相同，重复调用不会重复 Capture。
- 原生编辑器禁用时，FileNativeMemoryAdapter 不持有可写路径。即使启用，所有自动生命周期仍不会调用它。

## 复验流程

每次 Hermes 升级时，先更新 [COMPATIBILITY.md](COMPATIBILITY.md)，然后执行：

```powershell
npm run check
npm test
python scripts/test_hermes_provider.py --hermes-source D:\path\to\hermes-agent
```

需人工复核 `agent/memory_provider.py`、`plugins/memory/__init__.py`、`plugins/memory/config_schema.py`、`hermes_cli/backup.py` 与原生记忆路径。如果任何一项不一致，只允许更新这层适配器或明确标为 unsupported；不得修改 Hermes 核心、猜测 hook 或破坏 `USER.md` / `MEMORY.md` 隔离。
