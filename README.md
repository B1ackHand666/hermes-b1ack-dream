# Hermes B1ack Dream

Hermes B1ack Dream 是一个可正式安装的 [Hermes](https://github.com/NousResearch/hermes-agent) Memory Provider：它保存可审计的长期记忆、在回答前召回相关内容，并提供本地 WebUI。首个公开可用版本为 `0.1.0`。

它与 Hermes 原生 `USER.md` / `MEMORY.md` 是两套独立系统。Capture、Dream、Recall、Decay、删除、Pin 和 Boundary **绝不**自动创建、修改、同步或删除原生记忆。只有用户在 WebUI 明确确认“复制到 Hermes 内置记忆”或直接编辑原生文件时才会写入，并会留下可恢复版本。

## 功能

- Completed-turn Capture、Recent → Observed → Light / REM / Deep Dream → Long-term / Pinned 生命周期。
- 有 Evidence、来源会话、Timeline、Audit、Recall 记录和 Inbox 的可追溯记忆。
- 支持中文别名与双字检索：例如“国考”可回应“公务员考试怎么复习？”。
- Boundary、真实删除、可恢复归档、用户确认冲突替换，以及 Recall 使用量参与衰退。
- 只绑定 `127.0.0.1` 的本地管理界面：详情、编辑、观察决策、搜索、归档、Inbox、Dream Diary、原生记忆编辑及版本恢复。

## 兼容性与要求

本版本依据 Hermes 主线提交 `6e5362833877ee370bf243f5b602f45318ae3f69` 的正式 `MemoryProvider`、用户插件发现、配置 schema、CLI 和备份行为实现并测试。详细平台结果见 [兼容性说明](docs/COMPATIBILITY.md)。

- 已安装 Hermes；Python 使用 Hermes 自己的运行环境。
- Node.js 20 或更高版本（运行随插件打包的本地 TypeScript/Node runtime；测试环境为 Node `24.18.0`）。
- 不需要 npm server、环境变量桥接、手工复制 provider 文件或猜测 `USER.md` 路径。

## 安装与启用

```powershell
git clone https://github.com/B1ackHand666/hermes-b1ack-dream.git
cd hermes-b1ack-dream
npm ci
npm run build:plugin
python scripts/install_hermes_plugin.py
hermes memory setup
```

在 `hermes memory setup` 中选择 `b1ack-dream`。Hermes 会从 `<HERMES_HOME>/plugins/b1ack-dream/` 发现它；Provider 数据位于同一 profile 的 `<HERMES_HOME>/b1ack-dream/`。

已有版本时，升级代码（数据不会删除）：

```powershell
git pull
npm ci
npm run build:plugin
python scripts/install_hermes_plugin.py --force
```

然后重启 Hermes。安装脚本只替换插件代码，绝不会替换 `<HERMES_HOME>/b1ack-dream/` 内的个人数据。

## 使用

正常启动 Hermes 后，B1ack Dream 会在主用户会话中异步归档完整的 user/assistant turn，并在回答前通过 Hermes 的 `prefetch()` 注入召回内容。Hermes 的 Recall 状态会显示 B1ack Dream 实际提供的条数。

默认启用本地 WebUI。查看地址：

```powershell
hermes b1ack-dream ui
hermes b1ack-dream ui --open
```

WebUI 随 active Provider 生命周期启动和停止；端口默认自动选择，地址只会是 `127.0.0.1`。没有运行中的 Hermes 时，`hermes b1ack-dream status` 会说明状态。不要把该 UI 直接暴露到公网。

在 Hermes 的 Provider 配置界面可设置 Memory Style、自动 Dream、Scheduled Dream 周期、WebUI 开关/端口和是否启用原生记忆编辑。高级的生命周期设置也可在 B1ack Dream WebUI 中管理。

## Dream、数据与备份

Dream 在主会话结束时运行，也会按配置的周期在回合开始时调度。失败会记录为可见 Dream Diary/Audit 条目，不会覆盖已存在的记忆。

所有插件数据都在 profile 内：

```text
<HERMES_HOME>/b1ack-dream/
  memory-center.json       # 主数据，原子写入
  memory-center.json.bak   # 最近成功写入前的备份
  config.json              # Hermes Provider 配置
  runtime.json             # 临时的本地 WebUI 状态
```

Hermes 的 profile backup 会包含这些内部文件；因此 `backup_paths()` 正确返回空列表，避免 Hermes 将同一目录重复作为“外部”数据备份。原生 `memories/USER.md` 与 `memories/MEMORY.md` 仍由 Hermes 独立管理。

## 停用、卸载与恢复

- 在 `hermes memory setup` 选择另一个 Provider 或内置 memory，即可停用 B1ack Dream。
- 删除 `<HERMES_HOME>/plugins/b1ack-dream/` 可卸载代码，默认**保留** `<HERMES_HOME>/b1ack-dream/` 数据。
- 需要彻底遗忘前，先运行 Hermes backup，或复制整个 `<HERMES_HOME>/b1ack-dream/` 目录；之后由用户自行删除该数据目录。
- JSON 损坏时运行时会停止而不覆盖主文件。使用同目录 `.bak` 恢复后再重启 Hermes。

## 开发与验证

```powershell
npm run check
npm test
python scripts/test_hermes_provider.py --hermes-source D:\path\to\hermes-agent
```

也可先设定 `HERMES_SOURCE` 后运行 `npm run test:hermes`。

最后一条是针对真实 Hermes 源码的 Provider contract test，不是模拟宿主。它验证发现、注册、initialize、非阻塞 `sync_turn`、prefetch、Recall 状态、session/scheduled Dream、localhost WebUI、原生记忆显式写入、重启和 profile 隔离。

详见 [架构](docs/ARCHITECTURE.md)、[Hermes 适配记录](docs/HERMES_ADAPTATION.md)、[故障排查](docs/TROUBLESHOOTING.md)、[迁移与变更](CHANGELOG.md) 和 [已知限制](docs/KNOWN_LIMITATIONS.md)。产品规格仍以 [Hermes Memory Center 规格](docs/Hermes_Memory_Center_Codex_Prompt_v2.md) 为准。

## 隐私

本版本的 Capture、Recall 和 Dream 均在本机运行，不会向未配置的第三方服务发送记忆数据。WebUI 默认只监听 localhost。请像保护 Hermes profile 一样保护 B1ack Dream 数据和备份。
