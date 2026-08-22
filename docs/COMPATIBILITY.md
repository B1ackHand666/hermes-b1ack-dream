# 兼容性声明

固定兼容性基线为 NousResearch `hermes-agent` 主线提交 `fd3a783a3edbbda611cbc4e38d70202dca7b5852`（2026-08-22 实际读取）。

| Hermes commit | OS | Node | Memory Provider | Dashboard Tab | Contract |
|---|---|---:|---|---|---|
| `fd3a783a3edbbda611cbc4e38d70202dca7b5852` | Windows 11 | 24.18.0 | 已通过 | 已通过 | 已在本机运行 Provider + Dashboard contract |
| `fd3a783a3edbbda611cbc4e38d70202dca7b5852` | Ubuntu latest | 20 | CI required | CI required | `.github/workflows/ci.yml` 固定契约矩阵 |
| `fd3a783a3edbbda611cbc4e38d70202dca7b5852` | Ubuntu latest | 22 | CI required | CI required | `.github/workflows/ci.yml` 固定契约矩阵 |
| `fd3a783a3edbbda611cbc4e38d70202dca7b5852` | Windows latest | 20 / 22 | CI required | bundle/manifest verified | Node + unit matrix |
| Hermes `main` | Ubuntu latest | 22 | informational | informational | `continue-on-error` upstream 预警 |

“已通过”表示运行了 `scripts/test_hermes_provider.py` 与 `scripts/test_hermes_dashboard.py`，而不是只比较 API 名称。测试复制正式插件至临时 `$HERMES_HOME/plugins/b1ack-dream/`，由 Hermes 发现和加载，再验证 initialize、非阻塞 Capture、prefetch、Recall 状态、idle scheduled/startup-catchup Dream、runtime shutdown、显式原生编辑、重启、双 profile 隔离、Dashboard manifest/SDK、真实 backend mount、认证 API、offline state 和同 Store mutation。

表中的 “CI required” 是已提交的验证矩阵，不是已经运行的结果。发布前必须由 GitHub Actions 实际跑通该行；在没有该运行记录前，Ubuntu 和 Node 20/22 仅属于待验证兼容性，不能标注为已通过。

同一 Windows 测试环境还运行了 `npm run benchmark`：100 / 1,000 / 5,000 条 synthetic Long-term Memory 的 Recall 分别为约 10.3 / 18.1 / 75.1 ms，Deep Dream 为约 10.7 / 40.6 / 178.3 ms，WebUI 长期列表加载为约 12.3 / 9.4 / 33.9 ms；5,000 条主数据约 3.6 MiB。这是本地容量基线，不是跨硬件性能承诺。

## 支持范围

本仓库不捆绑 Hermes 源码，也不修改 Hermes 核心。GitHub branch protection 应将 `node-and-unit` 与 `hermes-contract` 设为 required；latest-Hermes job 是 informational。使用其他提交或发行版前，请以 [HERMES_ADAPTATION.md](HERMES_ADAPTATION.md) 的复验流程重新确认；验证失败时请保持 Provider 未启用，而非强行安装。
