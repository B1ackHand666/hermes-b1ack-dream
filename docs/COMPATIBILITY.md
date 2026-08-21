# 兼容性声明

| Hermes 版本 / 提交 | 状态 | 平台与运行时 | 实证范围 |
|---|---|---|---|
| `6e5362833877ee370bf243f5b602f45318ae3f69`（NousResearch `hermes-agent` 主线，2026-08-22 读取） | 已通过 | Windows 11；Python 3.14.6；Node 24.18.0 | 用户插件发现/注册、`MemoryProvider` 生命周期、配置 schema、active Provider CLI、profile backup 规则、`USER.md` / `MEMORY.md` 路径、真实 contract test |

“已通过”表示运行了 `scripts/test_hermes_provider.py`，而不是只比较 API 名称。测试复制正式插件至临时 `$HERMES_HOME/plugins/b1ack-dream/`，由 Hermes 发现和加载，再验证 initialize、非阻塞 Capture、prefetch、Recall 状态、session 与 scheduled Dream、WebUI localhost、显式原生编辑、重启和双 profile 隔离。

同一 Windows 测试环境还运行了 `npm run benchmark`：100 / 1,000 / 5,000 条 synthetic Long-term Memory 的 Recall 分别为约 10.3 / 18.1 / 75.1 ms，Deep Dream 为约 10.7 / 40.6 / 178.3 ms，WebUI 长期列表加载为约 12.3 / 9.4 / 33.9 ms；5,000 条主数据约 3.6 MiB。这是本地容量基线，不是跨硬件性能承诺。

## 支持范围

本仓库不捆绑 Hermes 源码，也不修改 Hermes 核心。使用其他提交或发行版前，请以 [HERMES_ADAPTATION.md](HERMES_ADAPTATION.md) 的复验流程重新确认；验证失败时请保持 Provider 未启用，而非强行安装。
