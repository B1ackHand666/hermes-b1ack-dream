# Changelog

## 0.1.0 — 2026-08-22

首个公开可用的正式 Hermes B1ack Dream Memory Provider。

- 对接 Hermes 正式用户 Provider 发现、`MemoryProvider` 生命周期、配置 schema、CLI 与 profile backup 规则。
- 加入 profile-scoped Python ↔ Node stdio sidecar、自动 localhost WebUI、正式安装脚本和真实 Hermes contract test。
- 实现 completed-turn Capture、prefetch Recall、Recall 状态、session/scheduled Dream、shutdown、profile isolation 和 restart persistence。
- 保持 `USER.md` / `MEMORY.md` 独立；新增显式复制/编辑、版本历史和用户语义正确的版本恢复。
- 修复 conflict `keep_old` 重复提示、`use_new` 非原子替换、自动 Decay actor、归档原状态和中文 Recall/同义聚合问题。
- schema 升至 2，v1 Recall 状态迁移为 fail-closed `unknown`。
