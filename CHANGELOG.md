# Changelog

## 0.1.1 — 2026-08-22

- Provider 现在真实执行 `node --version`，仅 Node.js 20+ 可用；`start()` 也会二次验证，缺失、18/19 或异常输出均 fail closed 并给出具体原因。
- Scheduled Dream 改为 Provider 生命周期内的独立 timer：无需新 turn、重启后单次 `startup_catchup`、同实例单 scheduler、shutdown join、失败记录与后续重试；Dream Diary schema 升至 3 并保存 trigger。
- `runtime.json` 记录 running、Provider/sidecar PID、开始/停止时间与 WebUI 状态；CLI 会验证 PID 和 localhost ping，强杀后的 stale state 不再误报或打印失效 URL。
- 新增 Hermes 原生 Dashboard **B1ack Dream** Tab、SDK IIFE bundle、认证 `/api/plugins/b1ack-dream/` 后端和离线提示；Dashboard 与 standalone fallback 操作同一 Node Memory Center Store。
- `webui_enabled` 现在只控制 standalone HTML fallback；Dashboard 的 localhost engine API 仍保持在 Provider 生命周期内可用。
- 新增 Windows/Ubuntu Node 20/22 单元 CI、固定 Hermes contract CI、informational latest-Hermes job、Node/runtime 测试和真实 Dashboard contract test。

## 0.1.0 — 2026-08-22

首个公开可用的正式 Hermes B1ack Dream Memory Provider。

- 对接 Hermes 正式用户 Provider 发现、`MemoryProvider` 生命周期、配置 schema、CLI 与 profile backup 规则。
- 加入 profile-scoped Python ↔ Node stdio sidecar、自动 localhost WebUI、正式安装脚本和真实 Hermes contract test。
- 实现 completed-turn Capture、prefetch Recall、Recall 状态、session/scheduled Dream、shutdown、profile isolation 和 restart persistence。
- 保持 `USER.md` / `MEMORY.md` 独立；新增显式复制/编辑、版本历史和用户语义正确的版本恢复。
- 修复 conflict `keep_old` 重复提示、`use_new` 非原子替换、自动 Decay actor、归档原状态和中文 Recall/同义聚合问题。
- schema 升至 2，v1 Recall 状态迁移为 fail-closed `unknown`。
