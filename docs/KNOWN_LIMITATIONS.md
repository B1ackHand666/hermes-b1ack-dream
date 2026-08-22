# 已知限制

- 正式兼容性基线为 Hermes 主线 `fd3a783a3edbbda611cbc4e38d70202dca7b5852`。较早/较新的发行版必须按 [适配记录](HERMES_ADAPTATION.md) 复验，不应仅因插件能被复制就假定兼容；Ubuntu/Windows Node 20/22 最终以 CI 运行结果为准。
- Node.js 是运行 sidecar 的硬依赖，最低版本为 20。未安装或 runtime 文件不完整时 Hermes 会把 Provider 标为 unavailable，不会回退到未定义的行为。
- JSON Store 是单用户 V1 存储。它有原子写、`.bak` 和跨进程锁，但不适合高频多机共享或极大规模数据。5,000 条以上建议先备份并评估后续 SQLite 存储迁移。
- Recall 是本地的关键词、中文双字和显式别名混合排序，具有可读理由；它不是 embedding/向量检索，因此高度隐喻或罕见同义表述可能无法召回。没有数据会被自动发送到第三方服务。
- Hermes 当前的 `prefetch()` 合同能确认“Provider 返回了注入字符串”，但不能证明模型在回答中实际采纳了哪条记忆。WebUI 因此使用“已注入 Hermes 上下文”，不声称“模型已使用”。
- Dashboard 是首选入口，必须运行 `hermes dashboard` 且用户插件已在 Hermes `plugins.enabled` 中启用；安装或升级后台 API 后需要重启 Dashboard（manifest 静态资源可 rescan）。standalone UI 是 Provider 进程的本地 fallback；Hermes 未运行时不会独立常驻。默认只绑定 `127.0.0.1`，本版本不提供无认证远程 bind。
- 原生记忆编辑使用已验证的 profile 路径，但仍受 Hermes 的加载/刷新时机约束；编辑后如当前 Hermes 会话未立即反映，重启或按 Hermes 官方方式刷新会话。B1ack Dream 不会试图绕过这一机制。
