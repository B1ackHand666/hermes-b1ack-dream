# 已知限制

- 当前实现提供 host-neutral Provider 契约，尚未针对某个真实 Hermes 发行版绑定插件 manifest 或 hook；在完成 `HERMES_ADAPTATION.md` 的检查前不能声称即插即用。
- Capture 与 Dream 使用可测试的本地启发式规则，不会把用户数据发送给第三方模型。生产环境可在保持同一 Trace/Observation 边界和审计语义的前提下接入用户已配置的模型。
- JSON 存储适合单用户、单进程的 V1 基础运行；多进程协作、超大规模检索和加密静态存储需要后续迁移到带事务和锁的存储后端。
- WebUI 是独立本地管理界面；在验证目标 Hermes 的前端扩展 API 前，不会假装已嵌入其现有 WebUI。
- 原生记忆编辑器仅支持同时明确配置并验证的 `USER.md` 与 `MEMORY.md` 路径。它不推断路径、限制、注入时机或即时生效能力。
- 当前 Recall 使用关键词、权威、状态、时间和历史使用次数的透明排序；它不是向量语义检索。后续接入检索器时必须保留用户可读理由和完整 RecallRecord。
