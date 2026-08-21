# 架构与生命周期

## 独立性

Memory Center 只持久化自己的 `memory-center.json`：Conversation Archive、Trace、Memory、Dream、Recall、Audit、Boundary 和原生记忆编辑的版本历史都在此数据边界内。Hermes 原生记忆不参与 Capture、Dream、Decay 或 Recall 的写入路径。

唯一会调用 `NativeMemoryAdapter.write()` 的路径是 `writeNativeMemory()` / `copyMemoryToNative()`，两者都要求 `confirmed: true`，并由 WebUI 的明确用户操作触发。

## 数据流

```text
Hermes user-message hook
  -> HermesMemoryProvider.onUserMessage
  -> Capture: Conversation + Memory Trace + Recent
  -> Light: Trace 去重和近期材料整理
  -> REM: 重复/明确证据形成 Observed
  -> Deep: 冲突、Inbox、确认请求、Decay/Archive

Hermes before-answer hook
  -> HermesMemoryProvider.beforeAnswer
  -> Recall: 权威 + 状态 + 相关性排序
  -> 可读 context + RecallRecord
  -> HermesMemoryProvider.afterAnswer: 最终上下文使用结果
```

## 持久化和恢复

`JsonMemoryStore` 在同一进程内串行化事务，先写入临时文件再原子替换，并保留上一次状态的 `.bak` 副本。检测到主数据 JSON 损坏时会停止而不是覆盖该文件。外部文件系统的原子 rename 语义、并发多进程写入和备份轮换属于部署环境限制。

## 生命周期规则

- Recent：短期信号；到期且无价值时真正删除。
- Observed：候选缓冲层，可确认、继续观察、降回 Recent、冲突进入 Inbox 或过期。
- Long-term：稳定记忆；未确认且长期无活动时可归档。
- Pinned：用户锁定，永不自动衰退、归档或被 Dream 覆盖。
- Archived：默认不参加普通 Recall，可由用户恢复。

Boundary 在 Capture、Dream Promotion 和 Recall 过滤器中都执行。低权威候选不能静默覆盖用户确认或锁定的内容。
