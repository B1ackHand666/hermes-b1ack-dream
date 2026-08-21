# Hermes B1ack Dream 架构与生命周期

## 正式 Hermes 边界

`plugins/hermes/__init__.py` 是基于 Hermes 正式 `MemoryProvider` ABC 的薄适配器。它由 `<HERMES_HOME>/plugins/b1ack-dream/` 发现，`register(ctx)` 调用 `ctx.register_memory_provider()`。适配器不修改 Hermes 核心。

```text
Hermes MemoryManager
  ├─ initialize(session_id, hermes_home, agent_context)
  │    └─ Python Provider 启动一个 profile-scoped Node sidecar
  ├─ sync_turn(user, assistant) ──异步──> capture_turn
  ├─ prefetch(query) ────────────────> recall → 返回可注入字符串
  ├─ on_turn_start ──────────────────> scheduled Dream（到期时）
  ├─ on_pre_compress ────────────────> 补存最后完整 turn（幂等）
  ├─ on_session_end ─────────────────> flush + automatic Dream
  └─ shutdown ───────────────────────> flush + 关闭 sidecar/WebUI

Node sidecar (stdio JSON-RPC，stdout 仅协议数据)
  ├─ MemoryCenter 生命周期核心
  ├─ JsonMemoryStore
  └─ 本地 WebUI（127.0.0.1，动态端口）
```

选择 sidecar 而不是每个 hook 新开 Node 命令的原因是：它拥有一个稳定的 WebUI 生命周期、避免端口冲突、保持低延迟 Recall，并且通过标准输入输出而非公网/局域网端口交换 Provider 数据。

## 独立性与原生记忆

Memory Center 只持久化自己的 `memory-center.json`：Conversation Archive、Trace、Memory、Dream、Recall、Audit、Boundary 和原生编辑版本历史均在 `<HERMES_HOME>/b1ack-dream/`。

目标 Hermes 已实证的原生路径是 `<HERMES_HOME>/memories/USER.md` 与 `<HERMES_HOME>/memories/MEMORY.md`。它们不会进入 Capture、Dream、Decay、Recall、Pin、Boundary 或自动删除的写路径。仅当用户在 WebUI 触发 `writeNativeMemory()` / `copyMemoryToNative()` 且提供 `confirmed: true` 时，适配器才会把这两个路径传给 FileNativeMemoryAdapter。每一次写入会保留 `previousContent` 和 `nextContent`；“恢复此版本”恢复用户所选版本的 `nextContent`。

## 数据可靠性

- 写入先复制最近主文件为 `.bak`，再写 `.tmp`，最后原子 rename。
- JSON 解析或 schema 损坏会 fail closed，不会把坏数据覆盖为空数据。
- `schemaVersion` 通过 `migrateState()` 迁移；未知未来版本停止启动并保留原文件。
- 进程内事务队列加上 profile 文件的排他 `.lock`，每次事务持锁后重新读取，避免多 Hermes 进程的 stale read-modify-write。
- 锁的异常陈旧时间为 30 秒；超时不写入并报错。`.bak` 仅是最近成功写入前的单份恢复点，不替代 Hermes 的正式 backup。

## 生命周期

```text
Completed turn (仅 user 内容形成 Profile Trace；assistant/tool 仅归档 provenance)
  → Recent
  → Light Dream: 去重/整理
  → REM Dream: 重复或明确 Evidence → Observed
  → Deep Dream: 冲突 → Inbox；稳定证据 → Long-term（自动或用户确认）
  → Recall: authority + state + 可解释相关性
  → Decay: Recent 删除、Observed 回退/删除、未确认 Long-term 归档
```

- Pinned 永不自动衰退、归档或被较低权威候选覆盖。
- Observed 在 Recall 中标为“观察中，尚未确认”，不能被伪装为用户事实。
- `keep_old` 记录已处理冲突时的新记忆 evidence 数；同一证据不会再提示，新证据才可重新打开。
- `use_new` 在同一事务中归档可替换的旧 Long-term、晋升新 Observed 并标为 `user_confirmed`。Pinned / `user_locked` 必须手动编辑，绝不静默替换。
- Recall 的 `recalledCount` / `lastRecalledAt` 会进入长期记忆的 Decay 判断；Pinned 仍例外。
- Memory Style 改变 Observe 阈值、观察期、自动晋升、Recent/Observed Recall 权限和衰退速度。

## Recall 透明度

每个 Recall 先记录为 `selected`。Provider 返回非空 `prefetch()` 字符串后，sidecar 记录 `injected`，因为 Hermes 当前 MemoryManager 将该字符串纳入 prompt；若没有候选则记录 `not_injected`。这表示“Hermes 已把块加入上下文”，不表示模型一定采纳内容。WebUI 对用户呈现这一区别。

中文 Recall 为本地、可解释的混合分词：标准词、中文双字片段和明确别名（例如 `国考` / `行测` / `申论` → `公务员考试`；`展开讲` → `详细解释`）。不调用未配置的远程 embedding 服务。
