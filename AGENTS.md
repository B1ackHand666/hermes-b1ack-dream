# Hermes B1ack Dream 开发守则

## 1. 项目定位与规格

本仓库用于开发 **Hermes B1ack Dream**：一个可独立安装、长期维护的 Hermes Memory Provider 插件及其 WebUI 管理中心。文档或代码中的 “Memory Center” 是其独立记忆子系统的技术名称，不是产品展示名称。

`docs/Hermes_Memory_Center_Codex_Prompt_v2.md` 是当前产品规格的唯一权威来源。开始任何功能设计、实现、测试或文档更新前，必须先阅读与当前变更有关的规格章节；实现与规格冲突时，以该文档第 55 节的两条最高产品定义为准。阶段性正式 Hermes 适配轮次另以 `docs/Hermes_B1ack_Dream_Formal_Hermes_Plugin_Round_Prompt.md` 为直接实施要求，但不得突破前述长期边界。

本仓库不是 Hermes 核心仓库。必须通过可配置的适配层和安装说明对接 Hermes，不得假定 Hermes 源码存在于本仓库或某个固定路径。

## 2. 不可违反的产品边界

Memory Center 与 Hermes 原生记忆 `USER.md`、`MEMORY.md` 是两套完全独立的系统：

- 不共用存储、生命周期或自动同步逻辑。
- Dream、Capture、Recall、Decay、Archive、Boundary 均不得静默读取后写回、修改、删除或晋升 Hermes 原生记忆。
- 唯一允许的连接是用户主动执行“复制到 Hermes 内置记忆”：必须选择目标文件、编辑建议内容、预览、明确确认后才可写入。
- 复制完成后两侧成为独立副本；任一侧的编辑、删除、归档或恢复都不得影响另一侧。
- Pinned Memory 仅是 Memory Center 中的稳定记忆，绝不等同于、也不得自动进入 `USER.md` 或 `MEMORY.md`。

不得将“复制”称为晋升、Core Promotion 或同步；不得提供自动同步开关。

## 3. 适配 Hermes 前的真实性检查

每次首次适配某个 Hermes 版本、或更新既有适配器前，先检查目标安装或源码的真实实现，并在适配说明中记录版本、证据和限制。至少确认：

1. Memory Provider 接口、注册方式、生命周期与调用点；
2. 会话如何加载 Provider Memory，以及可用的逐轮和会话结束 hook；
3. 会话记录和回答上下文的可访问范围；
4. `USER.md` / `MEMORY.md` 的真实路径、读取/写入/注入方式、长度限制与生效时机；
5. 插件、配置、用户数据目录、WebUI、API、日志和测试体系；
6. 前端框架、样式体系、构建和发布方式。

不得根据产品规格猜测 Hermes 接口，也不得为迎合规格名称而重构 Hermes 核心。真实接口未知或能力不足时，实施隔离的适配层、显式降级和已知限制；不要伪造完整追踪或修改核心代码来绕过限制。

## 4. 功能闭环与开发优先级

Memory Center 必须作为完整闭环演进，避免只完成 UI、数据库、Dream 或 Recall 中的单一部分：

```text
Conversation Archive → Memory Capture → Recent
→ Light Dream → REM Dream → Deep Dream
→ Observed / Long-term / Pinned → Recall → Hermes Answer
→ Recall Usage History → 下一次 Dream
```

按以下能力组织实现与验收：

1. 可靠的数据模型、Conversation Archive、Memory Trace、Capture 和 Recent；
2. Observed / Candidate 的可解释生命周期：继续观察、晋升、降回 Recent、衰退/过期、冲突进入 Inbox、忽略；
3. Light、REM、Deep Dream 及可读、可追溯的 Dream Diary；
4. Long-term、Pinned、权威等级、来源、Trace、Timeline、Audit、Decay 与 Archive；
5. Recall、排序、最终上下文使用结果、Usage History 和面向用户的透明解释；
6. Memory Inbox、冲突处理、用户确认/编辑/锁定，以及真正生效的 Memory Boundary；
7. WebUI、设置、搜索筛选、导出与基础备份；
8. 独立的 Hermes 原生记忆管理器：`USER.md` / `MEMORY.md` 的安全编辑、版本历史、恢复，以及手动复制流程。

V1 不优先引入复杂知识图谱、多用户、多 Agent 共享、情绪画像或花哨评分仪表盘，除非它们不增加核心闭环风险。

## 5. 领域规则与数据安全

- 不要将每条消息直接变成记忆；Capture 先生成可聚合、可追溯的 Memory Trace。
- Recent 是短期信号，Observed 是尚未确认的候选，不得以确定事实口吻呈现或覆盖高权威长期记忆。
- 权威顺序固定为：用户锁定/手动固定 > 用户确认/手动编辑 > 高稳定 Dream Long-term > Observed > Recent/临时推测。低层信息不得静默覆盖高层信息。
- 用户修改、确认、锁定和“不记住”优先于模型推断；Pinned 不自动衰退，且冲突必须进入 Inbox。
- 删除必须具有真实删除语义；“删除并阻止重新学习”必须同时创建并执行 Boundary；“删除所有相关记忆”必须清楚显示影响范围。插件删除不得操作原生记忆副本。
- Boundary 必须在 Capture、Observed、Dream、Long-term Promotion 和 Recall 的每个入口实际执行，不能只是 UI 标签。
- 所有状态变更必须可审计、可追溯、可恢复（适用时），并保留来源、关联会话、Trace、创建方式与变更原因。
- 任何失败（Provider、Capture、Dream、Recall、数据库、内置记忆读写、API）都不得破坏已有记忆。对可写操作采用原子提交、失败回滚或可恢复记录；部分 Dream 成功也必须如实记录。
- 默认最小化收集与暴露用户数据，不向无关第三方发送数据，也不在 WebUI 暴露不必要的文件系统路径。

## 6. WebUI 与可解释性

WebUI 必须让用户自然分辨 Recent、Observed、Long-term、Pinned、Archived 和 Inbox。它应优先显示可读卡片、来源、证据、状态、趋势、Recall 理由和下一步，而不是裸数据库字段或算法分数。

- Observed 必须明确标识为“观察中 / 尚未确认”，说明其依据、出现次数、跨天情况、最近证据和可选去向。
- 每次 Recall 记录召回了什么、状态、用户可读的相关原因、所属会话/回答、选择/排序依据，以及最终是否进入上下文；能力不足时必须明确限制。
- Dream Diary 应分别记录 Light 的整理、REM 的模式与候选、Deep 的长期状态变更。
- 内置记忆页面必须醒目说明其与 Memory Center 完全独立且不会自动同步；结构化编辑不能破坏无法可靠解析的 Markdown，完整 Markdown 高级编辑始终可用。
- 在原生记忆复制、编辑和恢复界面中清楚标出写入目标、预览、版本恢复点，以及“两个副本不会自动同步”的提示。

## 7. 质量、测试与文档

每项行为变更都应在现有测试体系中增加或更新比例适当的测试。至少覆盖：

- Recent/Observed/Long-term/Pinned/Archived 生命周期与权威覆盖；
- Boundary、删除、删除并阻止重新学习、归档与恢复；
- Dream 各阶段的去重、候选、冲突、部分失败与恢复；
- Recall 优先顺序、透明记录、Usage History 和无法完整追踪时的降级；
- 用户主动复制到原生记忆、确认前预览、独立副本保证、原生记忆版本历史与恢复；
- Provider 不可用、数据文件/数据库异常、原生记忆读写失败和 WebUI/API 失败时的数据安全。

将产品规格第 51 节的 28 项问题作为 V1 的持续验收清单。每次 Hermes 版本升级后，重新验证 Provider 生命周期及 `USER.md` / `MEMORY.md` 的隔离保证。

所有可交付版本必须同步维护：安装文档、使用文档、架构与生命周期说明、适配兼容性说明、数据导出/备份说明和已知限制。对无法由真实 Hermes 接口精确实现的功能，明确写出限制，不得宣称已经支持。

## 8. 开发协作要求

- 变更应优先复用 Hermes 已有插件、配置、日志、API 和 WebUI 机制，同时将 Hermes 依赖局限在适配边界内。
- 避免大规模侵入或破坏 Hermes 核心；兼容性策略、重大架构折衷和数据迁移必须记录在项目文档中。
- 修改存储格式、公共接口、生命周期或删除语义前，先评估向后兼容、迁移、备份和恢复路径。
- 交付前运行与改动相称的测试、类型检查和构建；报告实际验证结果与未验证的部分。
- 不以 Mock UI、静态数据或未接入的数据库代表功能完成；每项声明完成的能力必须贯通真实数据流。
