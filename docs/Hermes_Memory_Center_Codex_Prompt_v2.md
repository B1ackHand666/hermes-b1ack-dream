# Codex Project Prompt — Hermes B1ack Dream V1.0

## 0. 任务目标

你现在负责完整实现一个可长期使用的 **Hermes B1ack Dream V1.0**。

这不是 Demo、概念验证或最小 MVP，而是一套完整的 Hermes 长期记忆插件 / Memory Provider + WebUI 管理中心。

产品的核心目标不是“尽可能多地记住用户”，而是：

> 让 Hermes 在长期使用中逐渐形成准确、可追溯、可纠正、可遗忘的用户理解，同时让用户始终拥有最终控制权。

整个系统参考 OpenClaw Dream / Dreaming 的产品思想，但不要机械复制实现。重点参考：

> **近期信息 → 观察 / 候选 → Dream 多阶段整理 → 长期记忆 → Recall → 使用反馈 → 再评估 / 衰退 / 归档**

---

# 1. 最重要的架构原则：插件记忆与 Hermes 内置记忆完全独立

这是不可违反的核心要求。

Hermes B1ack Dream 自己维护一套完整、独立的记忆系统：

- Recent Memory
- Observed / Candidate Memory
- Long-term Memory
- Pinned Memory
- Dream
- Recall
- Usage History
- Decay
- Archive
- Timeline
- Memory Boundary
- Audit History

Hermes 原生记忆：

- `USER.md`
- `MEMORY.md`

继续由 Hermes 自己原有机制负责。

两套系统：

- 不共用存储；
- 不共用生命周期；
- 不自动同步；
- 不自动覆盖；
- 不自动晋升；
- 不自动降级；
- 插件 Dream 不得静默修改 `USER.md` 或 `MEMORY.md`。

Memory Center 的 WebUI 可以提供一个 **Hermes 内置记忆管理页面**，让用户方便查看和编辑 `USER.md / MEMORY.md`，但这个页面只是一个独立的 Editor / Manager。

正确关系：

```text
                    Hermes
                      │
        ┌─────────────┴─────────────┐
        │                           │
Hermes B1ack Dream              Hermes 内置记忆
独立 Memory Provider             USER.md / MEMORY.md
        │                           │
Recent / Observed                  │
Long-term / Pinned                 │
Dream / Recall                     │
Archive / Timeline                 │
        │                           │
        └────── 都可供 Hermes 使用 ─┘
```

禁止设计成：

```text
Memory Center Long-term
        ↓ 自动晋升
USER.md / MEMORY.md
```

---

# 2. 两套记忆之间唯一允许的连接：用户主动复制

Memory Center 中的某条长期记忆可以由用户主动执行：

> **复制到 Hermes 内置记忆**

用户必须明确选择：

- `USER.md`
- `MEMORY.md`

并预览最终写入内容。

这是一种“复制”，不是“晋升”。

复制完成后，两边是两个完全独立的副本。

后续：

- 修改插件记忆，不自动修改 Hermes 内置记忆；
- 修改 `USER.md / MEMORY.md`，不自动修改插件记忆；
- 删除任何一边，也不自动删除另一边。

UI 应明确提示：

> 此内容同时存在于 Memory Center 和 Hermes 内置记忆，两者不会自动同步。

不要实现自动双向同步。

---

# 3. 开始编码前必须先检查 Hermes 当前真实实现

不要直接根据本 Prompt 猜测 Hermes 内部结构。

首先检查当前工作区 / 仓库，确认：

1. Hermes 当前 Memory Provider 接口。
2. Provider 生命周期与调用点。
3. Hermes 如何在会话中加载 Provider Memory。
4. `USER.md` 与 `MEMORY.md` 的真实：
   - 路径
   - 读取
   - 写入
   - 注入
   - 长度限制
   - 生效时机
5. 会话记录是否可访问。
6. 每轮消息是否有 Memory Provider hook。
7. 会话结束是否有 callback / hook。
8. Hermes 当前：
   - 插件系统
   - 配置系统
   - WebUI
   - API
   - 用户配置目录
   - 测试体系
   - 日志体系
9. 当前前端框架、样式体系、构建方式。

如果当前 Hermes 的真实实现和本 Prompt 中的名词不一致：

> 以当前仓库实际结构为准，适配产品目标，不要为了匹配 Prompt 名称强行重构 Hermes。

完成检查后：

1. 输出一份简洁的实现计划；
2. 然后继续直接实施；
3. 不要只停在设计阶段；
4. 非关键技术选择自行做合理决策。

---

# 4. 产品名称

用户界面名称：

**Hermes B1ack Dream**

简称：

**B1ack Dream**

---

# 5. 产品定位

Hermes B1ack Dream 是：

> **一套独立的长期个人记忆系统 + Hermes 原生记忆的可视化管理器**

为保持既有技术术语清晰，本规范其余部分中的 “Memory Center” 指 Hermes B1ack Dream 的独立记忆子系统，而非旧产品名称。

Hermes B1ack Dream 本身需要完整覆盖：

1. Conversation Archive
2. Memory Capture
3. Recent Memory
4. Observed / Candidate Memory
5. Light Dream
6. REM Dream
7. Deep Dream
8. Long-term Memory
9. Pinned Memory
10. Recall
11. Recall Usage History
12. Memory Timeline
13. Memory Inbox
14. Conflict Handling
15. Decay / Archive
16. Memory Boundary
17. Audit History
18. WebUI
19. 设置
20. 数据导出 / 备份基础能力

此外，WebUI 还需要单独提供：

21. Hermes `USER.md / MEMORY.md` 管理页面

但第 21 项与 1–20 项逻辑上独立。

---

# 6. 产品原则

以下规则视为本项目的产品宪法。

## 6.1 用户拥有最终解释权

AI 可以观察、归纳和推测，但不得把自己的推断默认为用户事实。

## 6.2 一次聊天不轻易形成长期记忆

单次提及优先进入 Recent，而不是 Long-term。

## 6.3 每条记忆必须可追溯

用户必须知道：

- 来自哪些会话；
- 哪些 Trace 组成；
- 谁创建；
- 是用户明确说过还是 Dream 推测。

## 6.4 Recall 透明

用户不仅要知道系统记住什么，也要知道：

> 这次回答使用了哪些记忆。

## 6.5 用户纠正优先于 AI 推断

用户手动编辑、确认、锁定的信息权威更高。

## 6.6 删除是真正的删除语义

不能只在 UI 隐藏。

## 6.7 短期状态不能污染长期画像

“最近在做某事”不能自动变成“长期兴趣”。

## 6.8 Dream 不只负责记住

还负责：

- 整理
- 强化
- 合并
- 纠正
- 冲突发现
- 衰退
- 归档
- 忽略

## 6.9 Pinned 不等于 Hermes 内置记忆

Pinned：

> 永久保留在 Memory Center，按需 Recall。

Hermes `USER.md / MEMORY.md`：

> Hermes 原生机制始终携带 / 使用的独立内置记忆。

## 6.10 低权威信息不能静默覆盖高权威信息

---

# 7. 整体工作流

```text
用户与 Hermes 对话
        │
        ▼
Conversation Archive
        │
        ▼
Memory Capture
        │
        ▼
○ Recent Memory
        │
        ▼
Light Dream
        │
        ▼
REM Dream
        │
        ▼
Deep Dream
        │
   ┌────┼─────────────┐
   │    │             │
   ▼    ▼             ▼
忽略  ◐ Observed    ● Long-term
        │             │
        │             ├── 📌 Pinned
        │             │
        │             ▼
        │           Recall
        │             │
        │             ▼
        │        Hermes 回答
        │             │
        │             ▼
        │      Recall Usage History
        │             │
        └─────────────┴──→ 下一次 Dream
```

Observed / Candidate 不是最终状态，而是长期记忆前的缓冲区。

---

# 8. Memory Capture

不要让“每条消息 = 一条记忆”。

先生成：

> Memory Trace / 记忆痕迹

Capture 需要识别：

- 目标
- 项目
- 偏好
- 计划
- 习惯
- 重要事实
- 长期相关人物
- 地点
- 事件
- 学习状态
- 用户纠正
- 明确“记住”
- 明确“不要记”
- Hermes 与用户协作经验

相似 Trace 应尽可能归入同一主题。

例如：

```text
OpenClaw Dream
Hermes Memory
WebUI
Memory Provider
内置记忆管理
```

应尽量聚合为：

> Hermes B1ack Dream / AI Memory 项目

不要产生大量零碎 Memory。

---

# 9. Recent Memory

Recent 表示：

> 最近发生或刚刚提到的信息。

特征：

- 有较强时效性；
- 尚未被判断为长期事实；
- 可以参与 Recall；
- 默认权重低于长期记忆；
- 应自动过期或进入后续观察。

例如：

> 最近正在研究某项技术。

不能立即转化成：

> 用户长期喜欢这项技术。

Recent 可以经过 Light / REM / Deep 后：

- 被忽略；
- 进入 Observed；
- 极少数明确高价值信息可进入 Long-term；
- 过期清理。

---

# 10. Observed / Candidate Memory

Observed 是整个系统的重要缓冲区。

它表示：

> Hermes 认为某件事“可能值得长期记住”，但证据还不够。

UI 用：

**◐ 观察 / 候选记忆**

不要把它展示成确定事实。

例如：

> 用户可能正在长期准备公务员考试。

而不是：

> 用户正在准备公务员考试。

Observed 可以参与 Recall，但 Recall 权重必须低于 Long-term。

使用 Observed 时，回答语义要保持不确定性：

> “根据你最近似乎在……”

而不能说：

> “你一直……”

---

# 11. Observed 的完整后续生命周期

Observed 必须至少有五种去向。

## 11.1 晋升为 Long-term

```text
◐ Observed
      ↓
● Long-term
```

可能条件：

- 跨多天重复出现；
- 在多个不同上下文出现；
- 用户明确确认；
- 对回答持续有价值；
- 有持续行为 / 行动支持；
- 被多次 Recall；
- Dream 多次强化；
- 不是一次性任务。

## 11.2 继续观察

证据不足时：

> 保持 Observed

等待新证据。

## 11.3 降回 Recent / 临时状态

用户明确选择：

> “只是最近”

则不要长期画像化。

可以降回 Recent，然后自然过期。

## 11.4 衰退 / 过期 / 清理

长期没有出现，也没有实际价值：

```text
Observed
   ↓
Dormant Candidate
   ↓
Expired
   ↓
清理
```

低价值候选不必进入长期 Archive。

## 11.5 冲突 → Inbox

如果 Observed 与已有高权威 Long-term / Pinned Memory 冲突：

不能自动覆盖。

进入：

> Memory Inbox / 待确认

---

# 12. Observed 用户操作

用户在“观察中”页面可以直接：

- 确认长期记住
- 继续观察
- 只是最近
- 编辑
- 不要记
- 固定为长期记忆（需要合理确认）
- 查看来源

这些操作都应记录 Audit History。

---

# 13. Observed 观察期限

内部应支持合理的候选期限。

不同类型可以有不同默认观察时间，例如：

- 高频项目 / 目标：较短
- 一般兴趣：中等
- 稳定偏好：较长

具体数值根据实现设计。

普通用户不要面对过多算法参数。

UI 只需要显示：

- 最近仍在观察
- 证据正在增加
- 长期无新证据
- 即将过期

高级设置允许调整。

---

# 14. Dream 系统

Dream 分三阶段：

1. Light
2. REM
3. Deep

---

# 15. Light Dream

职责：

- 去重
- 清洗
- 聚类
- 合并 Trace
- 清理明显无价值信息
- 更新近期主题
- 标准化表达
- 避免重复候选

Light 的核心是：

> 整理近期材料

Light 不应该直接把自己的推断写成长久事实。

---

# 16. REM Dream

职责：

- 理解上下文
- 发现多日重复
- 识别趋势
- 发现变化
- 建立主题联系
- 识别可能的长期偏好
- 识别长期目标
- 判断时效性
- 形成 Candidate / Observation

REM 的输出是：

> Observation

不是用户事实。

UI 必须显示：

- 明确事实
- Dream 推测

两者不能混淆。

---

# 17. Deep Dream

Deep 才允许真正改变 Memory Center 的长期记忆。

至少支持：

- 新增
- 强化
- 合并
- 更新
- 冲突
- 降级
- 归档
- 忽略

判断因素包括：

- 多次出现
- 跨天出现
- 不同场景出现
- 最近仍然活跃
- 实际 Recall 次数
- 是否影响过回答
- 用户确认
- 与已有记忆是否一致
- 时效性
- 是否一次性任务
- 是否已经过时
- 是否被 Memory Boundary 禁止

---

# 18. Dream Diary

必须实现可读的 Dream 日志。

每次 Dream 至少显示：

## Light
- 合并了什么
- 清理了什么
- 重组了什么

## REM
- 发现哪些模式
- 哪些趋势
- 哪些潜在长期目标
- 哪些可能的偏好
- 哪些需要继续观察

## Deep
- 新增长期记忆
- 晋升 Observed
- 更新
- 合并
- 归档
- 忽略
- 冲突
- 进入 Inbox

用户能查看历史 Dream。

---

# 19. Long-term Memory

长期记忆使用可读卡片管理。

每条至少包含：

- 标题
- 内容
- 类型
- 状态
- 权威等级
- 首次发现
- 最近强化
- 最近确认
- 来源
- 相关会话
- 相关 Trace
- 创建方式
- 是否用户确认
- 是否 Pinned
- 最近 Recall
- Recall 次数
- 生命周期状态
- 变更历史

用户操作：

- 查看
- 编辑
- 删除
- 固定
- 取消固定
- 归档
- 恢复
- 查看来源
- 查看 Timeline
- 查看 Usage History
- 复制到 Hermes 内置记忆
- 创建 Memory Boundary

---

# 20. Pinned Memory

Pinned 是 Memory Center 内部最高稳定级别之一。

意义：

> 用户要求永久保留，但仍然是 Provider Memory，只有相关时才 Recall。

规则：

- 不自动 Decay；
- 不自动删除；
- Dream 不得静默改变核心含义；
- 冲突时进入 Inbox；
- 用户可取消固定；
- 不等于 USER.md / MEMORY.md。

---

# 21. Memory Authority

实现以下权威优先级：

```text
🔒 用户锁定 / 用户手动固定
        ↓
✓ 用户确认 / 用户手动编辑
        ↓
● Dream 高稳定长期记忆
        ↓
◐ Observed / Candidate
        ↓
○ Recent / 临时推测
```

低层不能静默覆盖高层。

---

# 22. Memory Inbox

统一处理需要用户干预的项目。

至少包括：

## 新长期记忆确认
例如：

> Hermes 认为你可能正在长期准备公务员考试。

操作：

- 确认
- 修改
- 继续观察
- 只是最近
- 不要记

## 冲突
显示：

旧记忆：
> 用户喜欢简短回答

新迹象：
> 最近多次要求详细回答

操作：

- 以后以新的为准
- 只是最近
- 保持原记忆
- 手动编辑

## Pinned 冲突

Pinned 不允许 Dream 自动覆盖。

## Hermes 内置记忆复制提示

仅当用户主动触发复制时出现确认流程。

---

# 23. Recall Transparency

必须实现。

每次 Memory Center 为 Hermes 检索相关记忆时，应记录：

- 哪些 Memory 被召回
- Memory 状态
- 为什么相关
- Recall 时间
- 所属会话 / 回答
- 排序 / 选择依据（用户可读形式）
- 最终是否参与上下文

用户界面可以看到：

> Memory · 3

展开：

- 准备2027国考
- 最近重点学习判断推理
- 偏好先理解原理

Observed 需要明显标记：

> 观察中 / 尚未确认

如果当前 Hermes API 不能完整追踪某个步骤：

尽可能实现最可靠的追踪，并在文档中明确限制。

---

# 24. Recall 优先顺序

产品语义上优先考虑：

```text
Pinned / 高权威 Long-term
        ↓
Long-term
        ↓
Observed
        ↓
Recent
```

但实际实现还要结合：

- 当前问题相关性
- 时间
- 状态
- 用户确认
- Recall 历史
- Memory Boundary

Observed 和 Recent 不得因为纯相关性高就覆盖长期稳定事实。

---

# 25. Recall Usage History

每条 Memory 能看到：

- 过去 7 天 Recall 次数
- 过去 30 天 Recall 次数
- 总 Recall
- 最近一次 Recall
- 用在哪些会话
- 是否长期未使用

这些数据也应影响：

- Strengthen
- Decay
- Archive

---

# 26. Memory Timeline

每条 Memory 提供生命周期时间线，例如：

```text
首次提及
↓
Recent
↓
进入 Observed
↓
多日重复
↓
REM 发现稳定模式
↓
Deep 晋升 Long-term
↓
用户确认
↓
Pinned
↓
长期无使用
↓
仍保留 / 归档
```

用户需要理解：

> 这条记忆是怎样形成和变化的。

---

# 27. Decay / Archive

实现基础生命周期：

```text
Active
↓
Stable
↓
Dormant
↓
Archived
```

原则：

- Recent 衰退最快；
- Observed 若长期没有新证据则过期；
- 长期稳定偏好衰退慢；
- 用户确认更慢；
- Pinned 不自动衰退；
- 高频 Recall 可强化；
- Archived 默认不主动参与普通 Recall，除非特殊历史检索或用户明确搜索；
- Archive 不等于删除。

---

# 28. Ignore

Dream 判断某信息不值得形成长期记忆时：

> Ignore

例如：

- 一次性安装报错
- 临时餐厅选择
- 很快过期的计划
- 无实际长期价值的细节

Ignore 不需要强制进入永久 Archive。

可以只保留必要 Audit 记录。

---

# 29. Memory Boundary

必须实现。

用户可以禁止系统长期记住某类内容。

支持：

- 具体 Memory
- 某个主题
- 某个类型
- 自定义规则

例如：

> 不长期记录我的具体位置。

> 不记住和 XXX 相关的信息。

> 删除这条以后不要重新学习。

Boundary 必须真正作用在：

- Capture
- Observed
- Dream
- Long-term Promotion
- Recall

不能只做 UI 标签。

---

# 30. 删除语义

删除时至少提供：

## 删除当前记忆

以后可以重新学习。

## 删除并阻止重新学习

删除 + 创建 Boundary。

## 删除所有相关记忆

按主题 / 关联清理。

## 从归档彻底删除

真正删除。

注意：

由于 Memory Center 与 Hermes 内置记忆完全独立：

> 删除 Memory Center Memory 不得自动删除 USER.md / MEMORY.md 中的同类内容。

反之亦然。

UI 可提示存在独立副本。

---

# 31. Hermes 内置记忆管理器

WebUI 单独提供：

> **Hermes 内置记忆**

功能对象：

- USER.md
- MEMORY.md

这是 Editor / Manager，不属于 Dream Memory 生命周期。

---

# 32. 内置记忆页面

页面必须明确写出：

> Hermes 内置记忆与 Memory Center 插件记忆完全独立，不会自动同步。

分两个 Tab：

## USER.md

可以使用用户友好名称：

> 关于我

## MEMORY.md

可以使用：

> Hermes 的长期笔记

同时保留原文件名标识。

---

# 33. 内置记忆编辑模式

提供：

## 结构化编辑

尽量将内容拆成可读区域：

USER.md 示例：

- 基本信息
- 长期目标
- 偏好
- 沟通方式
- 用户明确要求

MEMORY.md 示例：

- 环境
- 项目
- 协作经验
- 长期约定
- Hermes 经验

## 高级编辑

直接编辑完整 Markdown。

如果无法可靠结构化某段内容：

不要破坏原始 Markdown。

高级编辑永远可以作为完整保底入口。

---

# 34. 内置记忆版本历史

每次由 Memory Center WebUI 修改 USER.md / MEMORY.md 时，记录：

- 修改时间
- 原内容
- 新内容
- 修改来源
- 用户操作
- 恢复点

支持：

> 恢复历史版本

注意：

历史记录由 Memory Center 管理，但不能改变 Hermes 自己的原生记忆逻辑。

---

# 35. 内置记忆容量 / 生效提示

必须根据当前 Hermes 实际实现检测：

- 字符 / Token / 文件限制
- 读取方式
- 写入限制
- 当前会话是否立即生效
- 是否要新建会话才完全生效

UI 必须准确提示。

不要硬编码本 Prompt 中不存在的固定数字。

---

# 36. “复制到 Hermes 内置记忆”流程

Memory Center 的 Long-term / Pinned Memory 菜单提供：

> 复制到 Hermes 内置记忆

流程：

1. 用户主动点击；
2. 选择 USER.md 或 MEMORY.md；
3. 系统生成建议写入文本；
4. 用户可以编辑；
5. 预览；
6. 用户确认；
7. 写入内置记忆；
8. 记录 Audit；
9. 提示：
   > 两个副本不会自动同步。

禁止自动触发。

禁止 Dream 自动触发。

禁止将此操作称为“Core Promotion”。

---

# 37. WebUI 一级导航

建议：

1. 仪表盘
2. 近期记忆
3. 观察中
4. 长期记忆
5. 固定记忆
6. Recall
7. Inbox
8. Dream
9. Timeline / 历史
10. 设置
11. Hermes 内置记忆

可以根据现有前端布局适度合并，但不能丢失核心入口。

---

# 38. Dashboard

首页应在 10 秒内告诉用户：

> 最近记忆系统发生了什么。

建议显示：

- Recent 数量
- Observed 数量
- Long-term 数量
- Pinned 数量
- 待确认数量
- 最近 Dream 状态
- 最近新增
- 最近更新
- 最近 Recall
- 过期候选数量

不要做成数据库管理员监控后台。

---

# 39. Recent 页面

展示近期主题，而不是大量原始消息。

例如：

> Hermes B1ack Dream 项目

包含：

- Dream 机制
- WebUI
- 内置记忆编辑
- 独立 Memory Provider

状态：

> Recent / 最近活跃

支持：

- 查看来源
- 提前进入观察
- 标记临时
- 删除
- 不要记

---

# 40. Observed 页面

这是重点页面。

每条候选显示：

- 候选内容
- 为什么进入观察
- 首次发现
- 最近证据
- 出现次数
- 跨多少天
- 是否被 Recall
- 当前趋势
- 预计下一步（用户可读）

操作：

- 确认长期记住
- 继续观察
- 只是最近
- 编辑
- 不要记
- 查看来源

---

# 41. Long-term 页面

支持：

- 搜索
- 分类
- 状态筛选
- 来源筛选
- 权威等级
- 最近使用
- 最近更新
- Recall 次数
- Archive 状态

记忆卡片必须可读，不要直接显示数据库字段。

---

# 42. Pinned 页面

单独查看所有用户固定内容。

明确说明：

> Pinned Memory 永久保留在 Memory Center，但不会自动复制到 Hermes USER.md / MEMORY.md。

---

# 43. Recall 页面

提供：

- 最近 Recall 记录
- 按会话查看
- 按 Memory 查看
- 使用理由
- Observed / Recent 是否参与
- 最终上下文使用情况

---

# 44. Audit / History

统一记录：

- Capture
- Recent 创建
- Observed 创建
- Long-term 晋升
- 用户确认
- 编辑
- Pin
- Unpin
- Archive
- Restore
- Delete
- Boundary
- Recall
- Dream 修改
- 冲突
- Inbox 处理
- 手动复制到 USER.md / MEMORY.md
- 内置记忆编辑
- 内置记忆恢复

---

# 45. 设置

普通模式：

## 记忆风格

- 保守
- 平衡
- 积极

默认：

> 平衡

## Dream

- 自动 Dream
- Dream 时间
- 手动执行

## Observed

- 是否允许自动晋升
- 候选过期策略

## Long-term

- 自动归档
- Recall 范围

## Boundary

- 管理禁止记忆规则

## Hermes 内置记忆

只提供：

- 编辑相关设置
- 版本历史保留

不要提供自动同步开关。

因为：

> 自动同步不属于本产品架构。

---

# 46. 高级设置

可提供：

- Light 开关
- REM 开关
- Deep 开关
- Candidate 观察周期
- Recall 强度
- Decay 速度
- Archive 策略
- Conflict Policy
- Dream Diary 保留时间
- Audit 保留时间

避免普通用户面对算法参数。

---

# 47. 数据导出与备份

尽量支持：

- 导出 Memory Center 全部记忆
- 导出 Dream Diary
- 导出 Timeline
- 导出 Audit
- 导出 Boundary
- 导出配置
- 导出 USER.md / MEMORY.md 快照

注意：

插件记忆备份和 Hermes 内置记忆备份应明确分开。

---

# 48. 隐私原则

1. 不把用户数据默认发送给无关第三方。
2. 遵循 Hermes 当前模型 / Provider 配置。
3. 不在 WebUI 暴露不必要的文件系统路径。
4. 自动行为必须可追踪。
5. 用户修改不能被静默覆盖。
6. 删除语义必须真实。
7. Memory Boundary 必须真实生效。
8. 插件与 USER.md / MEMORY.md 的独立关系必须在文档写清楚。

---

# 49. 错误恢复

优雅处理：

- Provider 不可用
- Dream 某阶段失败
- Capture 失败
- Recall 失败
- 数据文件损坏
- DB 缺失
- USER.md / MEMORY.md 读取失败
- 内置记忆写入失败
- WebUI 某接口失败
- Dream 只完成部分阶段

原则：

> 一次失败不能破坏已有记忆。

需要尽可能保证：

- 原子性
- 可恢复
- 可审计

技术方案自行结合当前栈实现。

---

# 50. V1 不优先实现

除非非常容易，否则不优先：

- 复杂知识图谱
- 多 Agent 共享
- 多用户系统
- 情绪画像
- AI 人格自动演化
- 无限分类层级
- 花哨评分仪表盘
- 社交关系大图

这些不影响核心记忆闭环。

---

# 51. 验收标准

V1 完成后，用户必须能自然回答：

1. Hermes B1ack Dream 现在记得我什么？
2. 哪些是 Recent？
3. 哪些正在 Observed？
4. 为什么某条进入了 Observed？
5. Observed 后续可能发生什么？
6. 哪些已经是 Long-term？
7. 哪些是 Pinned？
8. 这条记忆来自哪里？
9. 为什么系统认为它值得长期保存？
10. 这次回答 Recall 了哪些记忆？
11. Observed 是否参与了这次回答？
12. 某条记忆最近使用过多少次？
13. AI 理解错了怎么改？
14. 删除后会不会重新学习？
15. 如何阻止某类内容被记住？
16. Dream 昨晚做了什么？
17. 某条记忆如何从 Recent 变成 Long-term？
18. 某条 Observed 为什么过期？
19. 某条 Long-term 是否已经 Dormant？
20. 能否 Pin 一条记忆？
21. Pin 后是否会进入 USER.md / MEMORY.md？
   - 正确答案必须是：不会自动进入。
22. 插件记忆和 Hermes 内置记忆是不是一套系统？
   - 正确答案必须是：不是，完全独立。
23. 能否在 WebUI 编辑 USER.md / MEMORY.md？
24. 插件会不会自动修改 USER.md / MEMORY.md？
   - 正确答案必须是：不会。
25. 如何把一条插件记忆放到 USER.md？
   - 用户主动“复制到 Hermes 内置记忆”。
26. 复制之后两边会不会自动同步？
   - 正确答案必须是：不会。
27. USER.md / MEMORY.md 修改后能否恢复历史版本？
28. 能否分别备份插件记忆和 Hermes 内置记忆？

只要其中核心问题无法从 WebUI 自然得到答案，就认为产品闭环没有完成。

---

# 52. 实现过程要求

1. 先读当前 Hermes 项目。
2. 先确认真实 Memory Provider 与 USER.md / MEMORY.md 行为。
3. 给出简短架构 / 实施计划。
4. 然后立即实现。
5. 不要只做 UI Mock。
6. 不要只做数据库。
7. 不要只实现 Dream 而缺 Recall。
8. 不要只实现 Recall 而缺透明追踪。
9. 不要只做 Long-term 而忽略 Observed 生命周期。
10. 不要把 USER.md / MEMORY.md 纳入 Dream 生命周期。
11. 不要实现自动 Core Promotion。
12. 不要实现插件与内置记忆自动同步。
13. 尽可能复用 Hermes 现有插件系统、配置、API 和 WebUI。
14. 避免大规模破坏 Hermes 核心代码。
15. 为关键流程写测试。
16. 编写完整安装和使用文档。
17. 明确已知限制。
18. 对无法精确实现的功能不能假装成功。
19. 可以内部拆阶段，但最终交付目标是完整 V1。
20. 重大架构折衷写入项目文档。

---

# 53. 必须交付的模块

最终至少交付：

1. Memory Provider 插件
2. Memory Capture
3. Recent Memory
4. Observed / Candidate Memory
5. Observed 生命周期
6. Light Dream
7. REM Dream
8. Deep Dream
9. Dream Diary
10. Long-term Memory
11. Pinned Memory
12. Recall
13. Recall Transparency
14. Recall Usage History
15. Memory Inbox
16. Conflict Handling
17. Memory Timeline
18. Decay / Archive
19. Memory Boundary
20. Audit History
21. WebUI
22. Settings
23. 数据导出 / 基础备份
24. Hermes USER.md 管理
25. Hermes MEMORY.md 管理
26. USER.md / MEMORY.md WebUI 编辑
27. USER.md / MEMORY.md 版本历史
28. 手动“复制到 Hermes 内置记忆”
29. 安装文档
30. 使用文档
31. 架构与生命周期文档
32. 测试
33. 已知限制

---

# 54. 最终完整数据流

```text
Conversation
    │
    ▼
Memory Capture
    │
    ▼
Recent
    │
    ▼
Light Dream
    │
    ▼
REM Dream
    │
    ▼
Deep Dream
    │
    ├───────────────┐
    │               │
    ▼               ▼
Observed         Long-term
    │               │
    ├─继续观察       ├─Pinned
    ├─晋升──────────→│
    ├─只是最近       │
    ├─衰退/过期      │
    ├─冲突→Inbox     │
    └─忽略           │
                    ▼
                  Recall
                    │
                    ▼
               Hermes Answer
                    │
                    ▼
             Usage History
                    │
                    ▼
                Next Dream
```

旁边独立存在：

```text
┌──────────────────────────────┐
│ Hermes 原生记忆              │
│                              │
│ USER.md                      │
│ MEMORY.md                    │
│                              │
│ 完全独立                     │
│ 不自动同步                   │
│ 不参与 Dream 生命周期         │
└──────────────────────────────┘
```

两边唯一连接：

```text
Memory Center Long-term / Pinned
              │
              │ 用户手动操作
              ▼
     “复制到 Hermes 内置记忆”
              │
        ┌─────┴─────┐
        ▼           ▼
     USER.md      MEMORY.md
```

复制后：

> 两边成为独立副本。

---

# 55. 最重要的产品定义

如果任何工程实现选择与本 Prompt 发生冲突，以以下两句话为最高判断标准：

> **Memory Center 是一套独立于 Hermes `USER.md / MEMORY.md` 的完整长期记忆系统。**

以及：

> **Observed / Candidate 是“先观察、再决定”的缓冲层；它必须能够晋升、继续观察、降级、衰退、冲突或被忽略，而不是永久堆积。**

最后：

> **这个系统的目标不是收集更多用户数据，而是形成准确、透明、可纠正、可遗忘、可追溯的长期理解，同时让用户始终拥有最终控制权。**

现在开始：

1. 检查当前 Hermes 仓库；
2. 确认真实 Memory Provider 和内置记忆机制；
3. 输出简洁实施计划；
4. 然后直接开始实现完整 V1.0。
