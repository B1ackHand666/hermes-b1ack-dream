# Hermes 适配记录

本轮已针对 NousResearch `hermes-agent` 主线提交 `fd3a783a3edbbda611cbc4e38d70202dca7b5852` 实际读取源码，并运行 Provider 与 Dashboard contract test。此记录不是接口猜测。

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
| Dashboard 发现 | `$HERMES_HOME/plugins/<name>/dashboard/manifest.json`，用户插件须在 `plugins.enabled` | 同一 `b1ack-dream` 插件安装 Dashboard manifest、IIFE bundle 与 API |
| Dashboard SDK | `window.__HERMES_PLUGIN_SDK__`、`window.__HERMES_PLUGINS__.register(name, Component)` | 不打包 React，不使用 iframe，注册 `/b1ack-dream`、`after:skills` Tab |
| Dashboard backend | `plugin_api.py` 的模块级 `router = APIRouter()`；Hermes 挂载 `/api/plugins/<name>/` 并置于 Dashboard auth 后 | 仅代理白名单 localhost sidecar API；Provider offline 返回结构化状态/503，不暴露数据目录 |
| Dashboard reload | `/api/dashboard/plugins/rescan` 重新扫描 manifest；API route 仍须重启 Dashboard 后挂载 | 安装/升级后重启 `hermes dashboard`，或只为刷新 Tab 调用 rescan |

## 运行时约束和降级

- `initialize()` 只有 `agent_context == "primary"` 时允许写入个人 profile；子代理、cron 或 flush context 不创建个人记忆。
- `sync_turn()` 不阻塞 Hermes 聊天线程；队列或 sidecar 异常只记录 warning，不影响主对话。
- `prefetch()` 限时 0.8 秒；异常返回空字符串，旧记忆不被损坏。
- `on_pre_compress()` 只检查最后一个完整 user/assistant 对；其 source ID 与 `sync_turn()` 相同，重复调用不会重复 Capture。
- Provider 的内部 scheduler 是每个实例一条可 join 线程，不依赖 `on_turn_start`；启动时最多一个 `startup_catchup`，Dream trigger 会持久化。
- `webui_enabled` 仅禁用 standalone HTML fallback。为支持原生 Dashboard，sidecar 的受限 loopback API 继续在 Provider 运行期间存在；浏览器只能经 Hermes auth 后的同源 API 访问它。
- 原生编辑器禁用时，FileNativeMemoryAdapter 不持有可写路径。即使启用，所有自动生命周期仍不会调用它。

## 复验流程

每次 Hermes 升级时，先更新 [COMPATIBILITY.md](COMPATIBILITY.md)，然后执行：

```powershell
npm run check
npm test
npm run test:python
python scripts/test_hermes_provider.py --hermes-source D:\path\to\hermes-agent
python scripts/test_hermes_dashboard.py --hermes-source D:\path\to\hermes-agent
```

需人工复核 `agent/memory_provider.py`、`plugins/memory/__init__.py`、`plugins/memory/config_schema.py`、`hermes_cli/backup.py`、`hermes_cli/web_server.py`、`website/docs/user-guide/features/extending-the-dashboard.md` 与原生记忆路径。如果任何一项不一致，只允许更新这层适配器或明确标为 unsupported；不得修改 Hermes 核心、猜测 hook 或破坏 `USER.md` / `MEMORY.md` 隔离。
