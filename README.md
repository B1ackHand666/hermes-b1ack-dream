# Hermes B1ack Dream

Hermes B1ack Dream 是独立于 Hermes `USER.md` / `MEMORY.md` 的长期记忆 Provider 和本地 WebUI。其 Memory Center 子系统实现可追溯的 Capture、Recent、Observed、三阶段 Dream、Long-term、Pinned、Recall 透明记录、Inbox、Boundary、Audit、Timeline、衰退/归档和基础导出。

> `Hermes_Memory_Center_Codex_Prompt_v2.md` 是本项目当前产品规格。Hermes B1ack Dream 永远不会自动同步、复制或修改 Hermes 原生记忆。

## 本地运行

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run build
npm start
```

打开 `http://127.0.0.1:4317`。默认数据文件为项目根目录下、已忽略的运行时目录 `.memory-center/memory-center.json`；设置 `MEMORY_CENTER_DATA_DIR` 可改为用户配置目录或其他受保护位置。

```powershell
$env:MEMORY_CENTER_DATA_DIR = 'D:\HermesData\memory-center'
$env:PORT = '4318'
npm start
```

## 对接 Hermes

在尚未验证具体 Hermes 版本前，使用 `src/hermes-provider.ts` 的 `HermesMemoryProvider` 作为唯一集成边界：

1. 将实际的用户消息 hook 映射到 `onUserMessage`；
2. 将回答前的 Provider hook 映射到 `beforeAnswer`，把返回的 `context` 注入已验证的 Provider 插槽；
3. 在最终上下文是否实际使用后调用 `afterAnswer`；
4. 仅在已确认存在的会话结束 hook 调用 `onSessionEnd`。

不要猜测 Hermes 的模块名、插件 manifest、hook 名称或内置记忆路径。完整验证步骤见 [Hermes 适配指南](docs/HERMES_ADAPTATION.md)。

## 原生记忆编辑器（可选）

原生记忆编辑默认禁用。只有在已验证目标 Hermes 的真实路径、读写和生效行为后，才同时设置两项显式配置：

```powershell
$env:HERMES_USER_MEMORY_PATH = 'D:\verified-hermes\USER.md'
$env:HERMES_LONG_TERM_MEMORY_PATH = 'D:\verified-hermes\MEMORY.md'
npm start
```

WebUI 会要求确认后才写入，并在 Memory Center 自己的存储中保留恢复版本。点击“复制到内置记忆”前可以编辑内容；复制后的两个副本绝不自动同步。

## 验证

```powershell
npm run check
npm test
```

架构、数据流、已知限制和验收方式见 [架构文档](docs/ARCHITECTURE.md)、[已知限制](docs/KNOWN_LIMITATIONS.md) 和产品规格第 51 节。
