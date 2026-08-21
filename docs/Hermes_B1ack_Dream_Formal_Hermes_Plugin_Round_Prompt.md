# Codex Round Prompt — Hermes B1ack Dream 正式 Hermes 插件化

## 本轮唯一目标

这一轮不要继续把重点放在“再增加一些 Memory Center 功能”。

本轮目标是：

> **把当前 `hermes-b1ack-dream` 仓库从“可独立运行的 Memory Center 原型 / host-neutral 实现”升级为一个可以被真实 Hermes 正式发现、安装、启用、运行、召回、写入、备份和管理的 Memory Provider 插件。**

完成本轮后，用户应当能够在一台实际运行 Hermes 的机器上：

1. 安装 B1ack Dream；
2. 在 Hermes 中选择 `b1ack-dream` 作为 Memory Provider；
3. 启动 Hermes 后无需手工启动另一个开发服务器；
4. 正常聊天；
5. B1ack Dream 自动接收完整 Turn；
6. 在回答前 Recall 相关记忆并注入 Hermes；
7. 在 Hermes 可见状态中明确显示本轮是否召回了记忆；
8. 在会话结束 / 合适时机运行 Dream；
9. 通过本地 WebUI 管理记忆；
10. 数据存储在当前 Hermes profile 的独立目录；
11. 能被 Hermes backup 机制正确包含；
12. Hermes `USER.md / MEMORY.md` 与 B1ack Dream 继续完全独立；
13. 安装后不需要用户理解当前仓库内部的 TypeScript server、hook mock 或开发结构。

本轮验收重点不是“代码看起来完整”，而是：

> **真实 Hermes 上可安装、可启用、可对话、可 Recall、可写入、可 Dream、可管理。**

---

# 0. 必须先读取的项目文件

开始任何改动前，先完整阅读：

- `AGENTS.md`
- `Hermes_Memory_Center_Codex_Prompt_v2.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/HERMES_ADAPTATION.md`
- `docs/KNOWN_LIMITATIONS.md`

并检查当前：

- `src/domain.ts`
- `src/memory-center.ts`
- `src/hermes-provider.ts`
- `src/native-memory.ts`
- `src/server.ts`
- `src/store.ts`
- `src/web-ui.ts`
- `tests/`

本轮不得破坏已经确定的 Memory Center 产品语义。

尤其不得违反：

> **B1ack Dream Memory Center 与 Hermes `USER.md / MEMORY.md` 完全独立。**

以及：

> **Observed / Candidate 是候选缓冲层，不是确定事实。**

---

# 1. 先验证当前 Hermes 官方真实接口

不要继续使用“假设中的 Hermes hook”。

本轮第一步必须针对 **当前实际 Hermes Agent** 做真实性检查。

至少检查并记录：

1. 当前 Hermes `MemoryProvider` ABC 的真实方法；
2. 插件发现机制；
3. 用户级 Memory Provider 安装目录；
4. `plugin.yaml` 真实格式；
5. `register(ctx)` 的真实注册方式；
6. `memory.provider` 的配置方式；
7. `initialize(session_id, **kwargs)` 实际提供哪些参数；
8. `prefetch()` 调用时机；
9. `queue_prefetch()` 调用时机；
10. `sync_turn()` 调用方式；
11. `on_session_end()`；
12. `on_pre_compress()`；
13. `on_session_switch()`；
14. `recall_status()`；
15. `backup_paths()`；
16. `get_tool_schemas()` / `handle_tool_call()`；
17. Provider 配置 schema；
18. `hermes memory setup` / Dashboard 对 Provider 配置的真实行为；
19. 当前 Hermes backup 行为；
20. 当前 Hermes profile / `HERMES_HOME` 隔离规则。

将实际验证结果写入：

`docs/HERMES_ADAPTATION.md`

必须记录：

- 验证日期；
- Hermes 仓库 / 安装版本；
- commit SHA 或 release version；
- 实际兼容性；
- 不支持或无法验证的能力；
- 使用了哪些 hook；
- 哪些能力明确没有使用。

不要再保留：

> “当前没有验证任何 Hermes 版本”

作为最终状态。

本轮结束时必须至少验证一个真实、明确的 Hermes 版本 / commit。

---

# 2. 当前 Hermes Provider API 作为目标，而不是自定义 Host Contract

当前仓库中的：

`src/hermes-provider.ts`

可以继续作为 Memory Center 内部抽象或测试边界，但它不能再被当作“正式 Hermes Provider”。

正式插件必须实现 Hermes 当前真实的 `MemoryProvider` 接口。

目标结构建议：

```text
Hermes
  │
  ▼
Official MemoryProvider Adapter
  │
  ▼
B1ack Dream Runtime Bridge
  │
  ▼
Memory Center Engine
  │
  ├── Capture
  ├── Recent
  ├── Observed
  ├── Dream
  ├── Long-term
  ├── Pinned
  ├── Recall
  ├── Audit
  └── WebUI
```

不要大规模修改 Hermes 核心代码。

---

# 3. 技术架构选择原则

当前 Memory Center 核心主要使用 TypeScript。

本轮不要因为 Hermes Provider 是 Python 就本能地重写整个项目。

优先原则：

> **保留已经可用的 Memory Center 内核，增加尽可能薄、稳定、可测试的 Hermes 官方适配层。**

可以选择：

- Python Provider + 本地 B1ack Dream runtime；
- Python Provider + 本地 IPC / HTTP bridge；
- 将少量关键运行逻辑迁移到 Python；
- 或其他更可靠的方案。

但必须满足：

1. 用户启用插件时不需要手动运行 `npm start`；
2. Provider 启动失败时 Hermes 不应崩溃；
3. B1ack Dream runtime 生命周期由插件自行管理；
4. shutdown 时正确退出；
5. 不遗留孤儿进程；
6. 不占用不确定端口导致 Hermes 无法启动；
7. WebUI 可以可靠启动；
8. 测试环境可控；
9. 安装流程简单；
10. 数据只写入当前 profile 范围。

如果重写整个 TypeScript 核心会显著增加本轮风险，则不要重写。

如果 sidecar 方案会造成明显的部署、生命周期、打包或跨平台问题，也不要为了“保留 TS”而强行坚持。

根据实际代码和 Hermes 生态做出工程判断，并在：

`docs/ARCHITECTURE.md`

记录最终选择及原因。

---

# 4. 正式插件目录与注册

本轮必须交付 Hermes 可以真实发现的插件目录 / Python package。

至少包含真实所需文件，例如：

```text
b1ack-dream/
├── __init__.py
├── plugin.yaml
├── README.md
├── config_schema.py      # 若当前 Hermes 支持/需要
├── cli.py                # 若当前 Hermes 支持且适合
└── ...
```

正式 Provider 名称统一：

`b1ack-dream`

用户最终应该可以在 Hermes 配置中选择：

```text
memory.provider: b1ack-dream
```

具体格式以当前 Hermes 真实代码为准。

必须实现真实：

```python
register(ctx)
```

并通过 Hermes 官方 Provider 注册机制注册。

---

# 5. Provider 生命周期必须正式映射

不要继续依赖仓库当前的：

- `onUserMessage()`
- `beforeAnswer()`
- `afterAnswer()`

作为真实 Hermes 生命周期。

将 B1ack Dream 功能映射到 Hermes 当前真实 hook。

---

# 6. initialize()

正式 Provider 初始化必须：

1. 接收真实 `session_id`；
2. 获取 Hermes 提供的 `hermes_home`；
3. 获取 `platform`；
4. 获取 `agent_context`（如果当前 Hermes 提供）；
5. 获取 profile / identity / workspace 等实际可用信息；
6. 初始化当前 profile 的 B1ack Dream 数据目录；
7. 初始化 runtime；
8. 检查数据文件；
9. 恢复必要状态；
10. 启动本地管理能力；
11. 不访问错误 profile；
12. 不硬编码 `~/.hermes`。

数据目录必须优先使用当前 Hermes 提供的：

`hermes_home`

例如逻辑上：

```text
<HERMES_HOME>/b1ack-dream/
```

或当前 Hermes 推荐的插件数据目录。

不要默认继续使用：

```text
项目根目录/.memory-center/
```

作为正式部署数据位置。

开发模式可以保留项目目录路径，但生产插件必须 profile-scoped。

---

# 7. 非 Primary Context 的写入安全

如果 Hermes 当前 `initialize()` 提供：

`agent_context`

则必须认真处理：

- primary
- subagent
- cron
- flush
- 其他真实值

默认原则：

> **只有明确属于主要用户会话的上下文才能正常写入个人长期记忆。**

不要让：

- cron system prompt
- 内部 maintenance agent
- flush agent
- subagent 临时任务

自动污染用户长期画像。

可以允许它们 Recall，但写入策略必须谨慎。

实际规则根据 Hermes 当前运行语义设计并写入文档。

---

# 8. sync_turn() 是正式 Conversation Archive / Capture 入口

Hermes 当前 `sync_turn()` 可以提供：

- user_content
- assistant_content
- session_id
- messages

正式插件必须优先用完整 completed Turn 作为 Capture 来源，而不是只记录用户消息。

目标：

```text
Completed Hermes Turn
│
├── User
├── Assistant
├── Tool Calls
└── Tool Results
      ↓
Conversation Archive
      ↓
Memory Capture
```

但不要把 tool output 自动全部记成用户画像。

需要区分：

- 用户说了什么；
- Hermes回答了什么；
- Tool只是什么工作上下文；
- 哪些内容适合形成 Memory Trace。

Conversation Archive 应尽量保留可审计上下文。

Memory Capture 应选择性提取。

---

# 9. sync_turn() 不得阻塞 Hermes 回答

Hermes 当前明确要求 `sync_turn()` 是非阻塞路径。

正式实现必须：

- 快速返回；
- 将 Capture / ingest / Dream 前处理放在后台队列或合适的异步机制；
- 异常只能记录，不得让 Hermes Turn 失败；
- 插件退出时应可靠 flush；
- 写入队列必须尽量防止进程崩溃导致整轮数据丢失。

如果当前 JSON Store 不适合这种写入模型，做必要加固。

不要为了本轮引入过度复杂的基础设施，但要达到正式使用可靠性。

---

# 10. prefetch() 是正式 Recall 注入口

B1ack Dream 的 Recall 必须通过 Hermes 当前真实：

`prefetch(query, *, session_id="")`

进入 Hermes。

要求：

1. 使用真实 Memory Center Recall；
2. 不再依赖 mock `beforeAnswer()`；
3. 返回 Hermes 要注入的可读 context；
4. Observed 必须标记为：
   - 观察中
   - 尚未确认
5. Recent 必须标记为近期信息；
6. Pinned / Long-term 保持不同语义；
7. Boundary 在 Recall 前生效；
8. Archived 默认不召回；
9. 不要把 Recall 内部评分裸暴露给模型；
10. 注入文本保持紧凑，避免大量占用上下文。

---

# 11. prefetch 必须快速且稳定

Hermes 官方对 prefetch 延迟敏感。

正式实现必须：

- 测量实际 Recall 延迟；
- 正常本地运行时足够快；
- 数据量增大时仍有合理行为；
- Provider 异常时返回空上下文，而不是让 Hermes 请求失败。

如果使用 sidecar：

- 避免每轮重新启动；
- 保持长期 runtime；
- 必须有超时；
- 超时后优雅降级；
- 不允许无限等待。

---

# 12. recall_status() 必须实现

正式 Provider 必须尽可能实现 Hermes 当前：

`recall_status()`

目标用户体验：

```text
🧠 B1ack Dream recalled 3 memories
```

或当前 Hermes UI 的等价状态。

要求：

- 只描述最近一次 prefetch；
- 没有 Recall 时返回 None / 等价空状态；
- count 必须真实；
- 不得显示上一次的陈旧 count；
- 不依赖模型自己主动解释；
- 保持确定性。

这将成为 B1ack Dream “Recall 透明”的正式 Hermes 入口之一。

---

# 13. RecallRecord 语义修正

当前实现创建 RecallRecord 时默认：

`includedInContext: true`

这在无法确认最终上下文使用结果时可能产生假阳性。

本轮修正数据模型。

推荐从 boolean 改成类似：

```text
selected
injected
not_injected
unknown
```

或：

```text
includedInContext: true | false | null
```

核心要求：

> **不知道就记录 unknown，绝不伪造 true。**

使用正式 Hermes `prefetch()` 后：

- Provider 返回的结果至少可标记为 selected / returned；
- 如果 Hermes 能确定实际注入则标 injected；
- 如果 API 无法知道模型最终真正消费了多少内容，则不要假装知道。

WebUI wording 必须准确。

---

# 14. queue_prefetch()

检查当前 Hermes 是否适合 B1ack Dream 使用：

`queue_prefetch()`

如果 Recall 已经足够快，不强制为了“使用 hook”而增加复杂度。

如果数据量 / 语义检索导致 prefetch 变慢，可以：

- after turn 预热；
- 缓存下一轮候选；
- 保持 session scoped cache。

是否使用由实际性能验证决定。

---

# 15. on_session_end()

正式使用 Hermes 当前：

`on_session_end(messages)`

至少承担：

- flush 待处理 Turn；
- 保存必要会话状态；
- 运行一次会话结束整理；
- 触发 Dream（如果策略允许）；
- 确保不会重复处理；
- 异常不破坏已有数据。

注意：

> Session End Dream 不等于“每日 Dream”。

二者必须在产品语义上区分。

---

# 16. Dream 调度本轮必须达到可正式使用

当前只有：

- 手动 Dream；
- session end Dream。

本轮至少实现以下策略之一，并优先同时支持：

## A. Session End Dream

用于及时整理当前会话。

## B. Scheduled Dream

用于跨会话、跨天 Consolidation。

例如用户可以配置：

- 每天某个本地时间；
- 每 N 小时；
- 关闭自动定时；
- 只手动。

不要硬编码凌晨 3 点。

默认可以提供合理配置。

要求：

- 重启后调度仍然正确；
- 避免一天重复跑多次相同 scheduled Dream；
- Dream 运行失败可恢复；
- 不阻塞正常 Hermes 对话；
- Dream Diary 保留来源和执行触发方式：
  - manual
  - session_end
  - scheduled

---

# 17. on_pre_compress()

如果当前 Hermes 在 context compression 前提供完整 messages：

本轮评估并优先使用 `on_pre_compress(messages)`。

用途：

> 在 Hermes 丢弃旧上下文前，让 B1ack Dream 有机会保存尚未 Capture / 尚未 Consolidate 的重要信息。

要求：

- 不重复创建大量 Memory；
- 有去重；
- 产生的内容仍走 Memory Center 生命周期；
- 不绕过 Recent / Observed；
- 不直接写 Long-term；
- 不修改 USER.md / MEMORY.md。

如果不需要使用，也要在适配文档解释原因。

---

# 18. on_memory_write() 明确不要做自动同步

Hermes 提供：

`on_memory_write(...)`

但 B1ack Dream 的产品原则是：

> **与 USER.md / MEMORY.md 完全独立。**

因此：

- 不允许通过 `on_memory_write()` 镜像 Hermes 内置记忆；
- 不允许自动同步；
- 不允许自动复制；
- 不允许 Core Promotion。

如果为了兼容必须实现该 hook：

应保持 no-op / audit-only，且不得把内容写入 Memory Center。

最好根本不 override，除非当前 Hermes API 有必要。

---

# 19. on_session_switch()

如果 Hermes 当前支持：

`on_session_switch(...)`

正式 Provider 必须处理：

- `/resume`
- `/new`
- `/reset`
- `/branch`
- context compression 导致的 session ID 变化
- gateway session rotation

要求：

- 新 Turn 不写入错误 session；
- Recall cache 不串 session；
- Conversation Archive session ID 正确；
- 不重复 Capture。

---

# 20. backup_paths()

正式 Provider 必须实现 Hermes 当前可用的：

`backup_paths()`

把 B1ack Dream 需要备份的 profile-scoped 数据路径交给 Hermes。

至少覆盖：

- Memory Center 数据
- 运行配置
- Dream Diary（若独立）
- Audit / Timeline（若独立）
- Boundary
- Native-memory editor 的版本历史
- 其他正式持久化文件

注意：

> Hermes 原生 USER.md / MEMORY.md 不属于 B1ack Dream Provider 数据，不要重复管理它们。

B1ack Dream 可以自己保留 WebUI 编辑造成的版本历史，但不要把 Hermes 原生文件伪装成插件主存储。

---

# 21. Provider 配置必须接入 Hermes

不要要求正式用户通过手工环境变量配置所有内容。

根据当前 Hermes 的真实插件机制，实现：

- `get_config_schema()`
- `save_config()`
- `config_schema.py`
- 或当前官方支持的等价方式。

正式安装至少应能配置：

- 是否自动 Dream
- Scheduled Dream 时间 / 周期
- Memory Style
- WebUI 是否启用
- WebUI port（可选）
- 原生记忆编辑是否启用（可选）
- 其他真正必要的设置

不要让 setup wizard 变成参数地狱。

高级参数继续留在 B1ack Dream 自己的 WebUI / config。

---

# 22. WebUI 正式部署方式

正式使用时，用户不应该执行：

```bash
npm start
```

才能管理插件。

本轮必须提供正式入口。

优先考虑：

```text
hermes b1ack-dream ui
```

或：

```text
hermes b1ack-dream
```

或当前 Hermes 插件 CLI 推荐方式。

也可以 Provider initialize 时启动本地 WebUI service，但必须考虑：

- 生命周期
- 重复进程
- 多 Hermes session
- 端口冲突
- headless 环境

最终方案必须简单、可靠。

---

# 23. WebUI 安全默认值

正式 WebUI 默认：

```text
127.0.0.1
```

不要默认：

```text
0.0.0.0
```

因为 Memory Center 包含大量个人长期记忆。

如果允许远程 bind：

- 必须显式配置；
- 清楚警告；
- 不要默认开启；
- 优先支持 SSH tunnel / reverse proxy 由用户自行控制。

不要无认证地默认暴露公网。

---

# 24. WebUI 必须继续管理 Hermes 内置记忆，但保持独立

保留：

- USER.md 查看
- MEMORY.md 查看
- 编辑
- 版本历史
- 恢复
- “复制到 Hermes 内置记忆”

但正式 Hermes 插件已经可以获得 `hermes_home` 后：

不再要求用户手工猜路径。

必须根据 **当前真实 Hermes 实现** 安全定位 USER.md / MEMORY.md。

前提：

- 已真实验证路径；
- 已验证读写方式；
- 已验证限制；
- 已验证生效时机。

若 Hermes 官方已经有内置 API / manager，优先调用官方能力，而不是绕过。

---

# 25. 仍然禁止自动同步原生记忆

即使正式插件已经能轻松拿到 USER.md / MEMORY.md：

仍然禁止：

- Capture 写原生记忆
- Dream 写原生记忆
- Decay 写原生记忆
- Recall 写原生记忆
- Pin 写原生记忆
- Boundary 修改原生记忆
- on_memory_write 镜像
- 自动双向同步

唯一允许：

> 用户在 B1ack Dream WebUI 明确点击“复制到 Hermes 内置记忆”或直接编辑内置记忆。

---

# 26. 修复当前生命周期已知问题

本轮正式插件化不能把明显逻辑问题带进生产。

必须修复至少以下问题。

---

## 26.1 Inbox keep_old 重复提示

当前：

> 用户选择“保持原记忆”

但新 Observed 仍可能在下一次 Dream 再次生成同一个冲突。

修正为：

- 记录用户已处理该冲突；
- 在没有新的实质证据前不重复提示；
- 允许新证据达到一定变化后重新打开。

---

## 26.2 use_new 必须完成完整替换

用户明确选择：

> 采用新记忆

应在一个事务中：

```text
旧高权威 Memory
→ Archived / Superseded

新 Observed
→ Long-term
→ user_confirmed
```

不能只归档旧 Memory，却让新 Memory 继续停留 Observed。

---

## 26.3 WebUI 加入“采用新记忆”

Inbox 冲突 UI 必须有完整操作：

- 保持旧记忆
- 采用新记忆
- 只是最近
- 继续观察
- 手动编辑

---

## 26.4 自动 Decay 不得记录成 user

当前自动过期 / 删除必须正确 actor：

- deep_dream
- system
- decay

不要写成：

> user deleted

Audit 必须真实。

---

## 26.5 Archive / Restore 保留原状态语义

不能出现：

```text
Recent → Archive → Restore → Long-term
```

修复：

- 保存 previous state；
- 或限制只有 Long-term 能进入正式 Archive；
- 恢复时回到合理状态。

---

## 26.6 Native-memory restore 语义

当前历史保存：

- previousContent
- nextContent

UI 若写：

> 恢复此版本

则必须恢复用户理解中的那个版本。

明确：

- Restore version
- Undo change

不要混淆。

加入测试。

---

# 27. Capture / Light / REM 本轮至少升级到“可长期使用”

本轮虽然重点是正式 Hermes 插件，但不能把明显不能长期用的 Capture 直接发布。

至少修复：

> “同一件事不同说法无法聚合”

问题。

例如：

```text
我准备参加 2027 国考
最近开始认真备考公务员考试
我在研究国考职位表
```

应有合理机会形成同一个主题 / 长期目标。

不能完全依赖：

`topic string exact equality`

可以引入：

- 中文分词
- normalized entities
- alias
- embedding
- 当前用户模型提供的语义判断
- hybrid matching
- 其他可解释方法

但必须保留：

- Evidence
- Trace
- 用户可读原因
- Audit

---

# 28. 中文 Recall 必须达到实际可用

这是正式使用的硬要求。

当前关键词 exact overlap 对中文不够。

至少要通过真实测试覆盖：

```text
Memory:
“用户正在准备国考”

Query:
“公务员考试怎么复习？”
```

应该能 Recall。

以及：

```text
Memory:
“用户更喜欢复杂问题详细分析”

Query:
“这道题能不能给我展开讲？”
```

应该有合理 Recall。

方案可以是：

- 中文 tokenizer
- BM25
- embedding
- hybrid
- 轻量语义模型
- 用户当前已配置模型
- 其他本地方式

但必须做到：

1. 中文有效；
2. Recall 仍然可解释；
3. 不向未知第三方发送数据；
4. 不因检索失败阻塞 Hermes；
5. Pinned / Long-term / Observed / Recent 权威语义保留。

---

# 29. Recall Usage 必须真正进入 Dream / Decay

当前已经有：

- recalledCount
- lastRecalledAt

本轮将其真正用于生命周期。

原则：

- 高频 Recall 的长期记忆更难 Dormant；
- 长期被实际使用应视为“仍有价值”；
- Decay 不能只看 lastReinforcedAt；
- 用户明确确认的信息比普通自动记忆更稳定；
- Pinned 不自动衰退；
- Observed 不能仅因 Recall 就自动变成用户事实，但 Recall 可以成为证据之一。

---

# 30. Memory Style 必须真正生效

当前：

- conservative
- balanced
- active

不能只是保存设置。

本轮至少让它影响：

- Recent → Observed 阈值
- Observed 观察时间
- 自动晋升策略
- Recall 对 Recent / Observed 的允许程度
- Decay 速度
- Inbox 确认频率

建议：

## Conservative
- 更少自动记
- 更高晋升门槛
- 更多用户确认
- Recent / Observed Recall 更克制

## Balanced
- 默认

## Active
- 更积极建立候选
- 更短观察期
- 允许更多自动晋升（仍遵守 Authority 和 Boundary）

具体参数内部化。

用户不需要看到算法分数。

---

# 31. WebUI 本轮必须补齐关键管理闭环

不要全面重做 UI，但正式可用至少补齐：

## Memory Detail

每条 Memory 可进入详情：

- 内容
- 状态
- Authority
- 生命周期
- 首次发现
- 最近强化
- 最近 Recall
- Evidence
- 来源会话
- Timeline
- Recall Usage
- 创建方式

## Edit

必须能编辑 Memory。

## Observed

必须有：

- 确认长期记住
- 继续观察
- 只是最近
- 不要记
- 编辑
- 查看来源

## Archive

必须有专门入口浏览和恢复。

## Delete

改为清晰对话：

> 你希望 B1ack Dream 怎么忘记它？

至少支持：

- 删除这条
- 删除并阻止重新学习
- 删除所有相关
- 取消

## Recall

能按：

- 会话
- Memory
- 时间

查看。

## Search / Filter

Long-term 至少支持：

- 搜索
- 状态
- 类型
- Pinned
- Archived
- 最近使用

---

# 32. WebUI 不要暴露开发者伪概念

正式用户界面不要出现：

- mock hook
- fake provider
- host-neutral
- dev demo
- raw internal score
- 未经解释的 actor enum

开发信息放 docs / debug。

---

# 33. 打包与安装

本轮必须提供真正可执行的安装方式。

用户体验目标：

```text
git clone ...
cd hermes-b1ack-dream
<一条或少量安装命令>
```

然后：

```text
hermes memory setup
```

或按 Hermes 当前真实方式选择：

`b1ack-dream`

最终不能要求用户：

- 手工复制一堆源码文件；
- 手工启动 Node server；
- 每次启动 Hermes 前先运行第二个命令；
- 自己猜 `USER.md` 路径；
- 自己修改 Python path；
- 自己建立 bridge。

可以提供：

- install script
- package install
- Hermes user plugin install
- 官方支持的 package entry point

选择当前最稳定的一种作为主安装方式。

---

# 34. 卸载 / 禁用

正式插件必须说明：

- 如何停用 `b1ack-dream`
- 如何切换其他 Memory Provider
- 如何卸载
- 卸载是否保留数据
- 如何彻底删除数据
- 如何备份后卸载

默认卸载不应偷偷删除用户长期记忆。

---

# 35. 升级兼容

本轮建立基础 migration 机制。

当前已有：

`SCHEMA_VERSION`

正式发布前：

- schema 变化必须可迁移；
- 旧数据不能直接被新版覆盖；
- migration 失败要停止并保留原文件；
- 更新 README / CHANGELOG。

至少为当前 schema 建立明确 migration 入口，即使 v1 暂时无需复杂迁移。

---

# 36. 数据可靠性

当前 JSON Store 可以继续用于单用户正式 V1，但必须验证：

- 原子写；
- backup；
- corruption 检测；
- concurrent access；
- sidecar + WebUI 是否会并发写；
- 多 Hermes 进程 / gateway 是否可能同时访问。

如果当前单进程 queue 无法覆盖实际 Hermes 运行模式：

需要加锁或调整存储。

不要等到数据损坏后再处理。

---

# 37. Profile Isolation

必须测试：

```text
HERMES_HOME A
```

和：

```text
HERMES_HOME B
```

的 B1ack Dream 数据完全分开。

不得：

- 跨 profile Recall；
- 跨 profile Dream；
- 跨 profile WebUI 数据；
- 跨 profile USER.md 编辑。

---

# 38. 真实 Hermes 集成测试

本轮必须不仅运行单元测试。

至少增加一个针对真实 Hermes Provider API 的兼容测试。

可以：

- 在测试环境 import Hermes `MemoryProvider`
- 注册 B1ack Dream
- 调用真实 MemoryManager / Provider 生命周期
- 或建立官方 API contract test

至少验证：

1. Hermes 能发现；
2. Hermes 能注册；
3. initialize 成功；
4. sync_turn 不阻塞 / 不报错；
5. prefetch 返回字符串；
6. recall_status 正确；
7. on_session_end 正确；
8. backup_paths 正确；
9. shutdown 正确；
10. 切 profile 不串数据。

---

# 39. 真实端到端场景验收

至少自动或半自动跑以下场景。

---

## 场景 A：跨会话长期记忆

Session 1：

> 我正在准备国考。

Session 2：

> 最近开始认真做行测。

Session 3：

> 给我安排一下公务员考试复习。

预期：

- Trace 可聚合；
- 进入 Observed；
- 满足规则后进入 Long-term 或 Inbox；
- 第 3 次相关问题可 Recall；
- UI 可查看来源。

---

## 场景 B：Observed 不确定性

用户只说一次：

> 最近突然想学摄影。

预期：

- Recent / Observed；
- 不直接变长期兴趣；
- Recall 时标记不确定；
- 长期无强化后衰退。

---

## 场景 C：用户纠正

旧：

> 用户喜欢简短回答。

新：

> 复杂问题以后给我详细讲。

预期：

- 不静默覆盖；
- 产生合理冲突 / 更新；
- 用户确认后完成切换；
- Audit 正确。

---

## 场景 D：Boundary

用户删除一条并选择：

> 不要再记这类内容。

预期：

- 删除；
- Boundary 创建；
- 后续类似 Capture 被阻止；
- Recall 不出现；
- Audit 记录。

---

## 场景 E：Pinned

用户 Pin：

> 某段长期经历。

预期：

- 永不自动 Decay；
- 不自动进入 USER.md / MEMORY.md；
- 相关问题可 Recall。

---

## 场景 F：Hermes 内置记忆独立

B1ack Dream 有：

> “准备国考”

用户手动复制到 USER.md。

然后：

- 修改插件 Memory；
- USER.md 不跟随变化；
- 修改 USER.md；
- 插件 Memory 不变化；
- 删除插件 Memory；
- USER.md 仍存在。

---

## 场景 G：Profile Isolation

两个 HERMES_HOME。

A 记：

> 喜欢咖啡。

B 不应 Recall。

---

## 场景 H：Restart

Hermes 退出重启。

预期：

- Memory 保留；
- Dream Diary 保留；
- Recall History 保留；
- 调度正常；
- 不重复 Capture。

---

# 40. 性能验收

至少测试：

- 100 Memory
- 1,000 Memory
- 5,000 Memory

观察：

- prefetch latency
- WebUI load
- Dream 时间
- store size
- startup

V1 不要求超大规模，但不能在几百条后明显不可用。

如果 5,000 条已经超过 JSON Store 合理范围：

清楚记录正式建议上限，并规划后续存储升级。

---

# 41. 安全验收

至少验证：

- WebUI 默认只绑定 localhost；
- API 错误不泄露真实敏感路径；
- 用户数据不自动发送到无关服务；
- Boundary 生效；
- 原生记忆写入必须用户明确确认；
- 插件不能因为 Capture/Dream 自动改 USER.md；
- 数据目录权限合理；
- 远程 bind 有清晰警告。

---

# 42. 正式 README

README 不再把项目描述成：

> “尚未绑定真实 Hermes”

完成本轮后改成正式使用文档。

首页至少包括：

1. B1ack Dream 是什么
2. 核心特点
3. 与 Hermes 内置记忆的关系
4. 支持的 Hermes 版本
5. 安装
6. 启用
7. WebUI
8. Dream
9. 数据目录
10. Backup
11. 卸载
12. 更新
13. 故障排查
14. 隐私
15. 已知限制

---

# 43. 正式兼容性声明

新增：

`docs/COMPATIBILITY.md`

至少记录：

| Hermes version / commit | 状态 | 平台 | 备注 |
|---|---|---|---|

不能只写“理论兼容”。

必须基于实际测试。

---

# 44. 正式故障排查

新增：

`docs/TROUBLESHOOTING.md`

至少覆盖：

- Provider not found
- Provider unavailable
- Node/runtime missing（如果最终仍需要）
- WebUI打不开
- port occupied
- Recall为空
- Dream失败
- 数据损坏
- USER.md editor不可用
- profile数据不一致
- 升级失败
- backup恢复

---

# 45. Release Readiness

完成后将版本从当前开发状态推进到一个明确的：

`0.1.0` 正式可用版本

或根据仓库当前语义选择：

`1.0.0`

不要仅凭数字；但必须有明确 release readiness。

建议本轮至少准备：

- CHANGELOG.md
- release notes 草稿
- compatibility
- install docs
- migration notes

如果当前工程成熟度更适合 `0.1.0`：

可以保持 `0.1.0`，但 README 要明确：

> 可正式使用的首个公开版本

而不是“prototype”。

---

# 46. 本轮不做的事情

不要把时间花在：

- 复杂知识图谱
- 多用户 SaaS
- 云同步
- 情绪画像
- AI 人格自动演化
- 花哨动画
- 社交关系网络
- 大规模多人权限系统

除非它们是正式 Hermes 插件化的直接阻塞项。

---

# 47. 优先级

严格按以下顺序。

## P0 — 必须完成

1. 官方 MemoryProvider 真接入
2. 正式安装 / 注册 / 启用
3. profile-scoped data
4. sync_turn
5. prefetch
6. recall_status
7. on_session_end
8. shutdown
9. backup_paths
10. WebUI 正式入口
11. 原生记忆独立性
12. 生命周期已知 bug 修复
13. 中文 Recall 最低可用
14. 真实 Hermes integration test
15. README / compatibility

## P1 — 本轮应完成

16. Scheduled Dream
17. on_pre_compress
18. Memory Style 生效
19. Recall Usage → Decay
20. Memory Detail
21. Edit
22. Archive page
23. 完整 Inbox conflict UI
24. search / filter
25. install / uninstall UX
26. migration

## P2 — 有余力再完善

27. queue_prefetch 优化
28. 更高级语义 Recall
29. 更漂亮结构化 USER.md editor
30. 更细性能优化

---

# 48. 本轮 Codex 工作方式

开始后：

1. 先审仓库；
2. 再审当前 Hermes 官方源码；
3. 写出不超过一屏的实施计划；
4. 立即开始改代码；
5. 不要只生成 TODO；
6. 不要只写文档；
7. 不要只做 adapter stub；
8. 每完成一个 P0 子闭环就加测试；
9. 实际运行 build / typecheck / tests；
10. 实际做 Hermes Provider compatibility test；
11. 报告真实成功 / 失败；
12. 如果遇到接口限制，使用官方能力优雅降级，不修改 Hermes 核心绕过；
13. 不向我反复询问小型工程决策，自行选择最可靠方案；
14. 如果某项无法完成，继续完成其他可完成项并在最终报告中明确说明。

---

# 49. 最终交付验收

本轮最终必须能给出以下真实结果：

```text
[PASS/FAIL] Hermes 可发现 b1ack-dream
[PASS/FAIL] Hermes 可启用 b1ack-dream
[PASS/FAIL] Hermes 启动后 Provider initialize
[PASS/FAIL] 正常聊天可 sync_turn
[PASS/FAIL] Recall 通过 prefetch 注入
[PASS/FAIL] recall_status 可见
[PASS/FAIL] 跨会话记忆存在
[PASS/FAIL] Observed 不被当作确定事实
[PASS/FAIL] Dream 可运行
[PASS/FAIL] Scheduled Dream 可运行
[PASS/FAIL] Boundary 生效
[PASS/FAIL] Pinned 不自动衰退
[PASS/FAIL] USER.md / MEMORY.md 不被自动修改
[PASS/FAIL] 用户可以手动复制到 USER.md / MEMORY.md
[PASS/FAIL] 两边复制后不自动同步
[PASS/FAIL] WebUI 可正式启动
[PASS/FAIL] WebUI 默认 localhost
[PASS/FAIL] Hermes backup 包含 B1ack Dream 数据
[PASS/FAIL] profile isolation
[PASS/FAIL] restart 后数据保留
[PASS/FAIL] 中文 Recall 基础可用
[PASS/FAIL] build / typecheck / unit tests
[PASS/FAIL] real Hermes integration test
```

任何 FAIL 都必须说明：

- 原因；
- 是否阻塞正式使用；
- 临时解决办法；
- 后续修复路径。

---

# 50. 正式完成定义

本轮只有达到下面的状态才算完成：

> 用户安装 Hermes 后，可以按照 README 安装 B1ack Dream，在 Hermes 中选择它作为 Memory Provider，然后正常使用 Hermes。B1ack Dream 会自动保存 completed turns、执行长期记忆生命周期、在回答前 Recall 相关记忆、向 Hermes 显示真实 Recall 状态、在本地 WebUI 中可透明管理，并在 Hermes backup 中被正常备份。

而且始终保持：

> **B1ack Dream 的 Memory Center 与 Hermes `USER.md / MEMORY.md` 是两套独立记忆系统。**

以及：

> **B1ack Dream 绝不通过 Dream、Capture、Recall 或其他自动流程修改 Hermes 原生记忆。**

---

# 51. 本轮最重要的工程原则

如果遇到“快速实现”和“正式可靠”冲突：

> 优先正式可靠。

如果遇到“重写全部”和“保留现有可用内核”冲突：

> 优先最小、安全适配。

如果遇到“更多功能”和“真实 Hermes 集成”冲突：

> 优先真实 Hermes 集成。

如果遇到“看起来支持”和“真实接口无法验证”冲突：

> 宁可明确 unsupported，也不要伪造完成。

---

# 52. 现在开始

现在执行：

1. 阅读本仓库产品规格与现有实现；
2. 检查当前 Hermes 官方 `MemoryProvider`、插件发现、配置和 backup 机制；
3. 记录真实兼容版本；
4. 给出简洁实施计划；
5. 直接开始把 `hermes-b1ack-dream` 改造成正式可安装、可启用、可长期使用的 Hermes Memory Provider；
6. 完成本 Prompt 的 P0；
7. 尽可能完成 P1；
8. 实际运行并验证；
9. 更新 README、ARCHITECTURE、HERMES_ADAPTATION、KNOWN_LIMITATIONS；
10. 输出最终 PASS/FAIL 验收表。
