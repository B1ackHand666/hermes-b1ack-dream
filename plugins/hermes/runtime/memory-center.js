import { randomUUID } from "node:crypto";
const DAY = 24 * 60 * 60 * 1000;
const now = () => new Date().toISOString();
const id = () => randomUUID();
const normalize = (value) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const semanticAliases = [
    { canonical: "公务员考试", terms: ["国考", "公务员考试", "行测", "申论", "备考公务员"] },
    { canonical: "详细解释", terms: ["详细", "展开讲", "展开说明", "复杂问题", "深入分析", "讲清楚"] },
    { canonical: "简洁回答", terms: ["简短", "简洁", "言简意赅", "少说", "精炼"] },
];
const words = (value) => {
    const content = normalize(value);
    const found = new Set(content.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []);
    for (const alias of semanticAliases)
        if (alias.terms.some((term) => content.includes(term)))
            found.add(alias.canonical);
    for (const run of content.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
        for (let index = 0; index < run.length - 1; index += 1)
            found.add(run.slice(index, index + 2));
    }
    return [...found];
};
const unique = (values) => [...new Set(values)];
const dateDaysFrom = (value, days) => new Date(new Date(value).getTime() + days * DAY).toISOString();
const typeFor = (text) => {
    const content = normalize(text);
    if (/(国考|公务员考试|行测|申论|备考)/.test(content))
        return "goal";
    if (/(详细|展开讲|展开说明|复杂问题|深入分析|讲清楚|简短|简洁|言简意赅|少说|精炼)/.test(content))
        return "preference";
    if (/(喜欢|偏好|prefer|like|讨厌|不喜欢)/.test(content))
        return "preference";
    if (/(目标|计划|准备|goal|plan|intend)/.test(content))
        return "goal";
    if (/(项目|project|仓库|repo|开发)/.test(content))
        return "project";
    if (/(学习|课程|考试|learn|study)/.test(content))
        return "learning";
    if (/(习惯|每天|每周|habit)/.test(content))
        return "habit";
    if (/(协作|工作流|合作|workflow)/.test(content))
        return "collaboration";
    return "fact";
};
const titleFor = (text, fallbackType) => {
    const concise = text.replace(/\s+/g, " ").trim().replace(/[。！？.!?].*$/u, "");
    if (concise.length <= 48)
        return concise || fallbackType;
    return `${concise.slice(0, 45)}…`;
};
const topicFor = (text) => {
    const content = normalize(text);
    const alias = semanticAliases.find((candidate) => candidate.terms.some((term) => content.includes(term)));
    if (alias)
        return alias.canonical;
    const terms = words(text).filter((word) => !new Set(["用户", "hermes", "memory", "center", "这个", "那个", "我们", "的是", "可以", "需要"]).has(word));
    return terms.slice(0, 5).join(" ") || normalize(text).slice(0, 40);
};
const authorityWeight = {
    inferred: 0.45,
    observed: 0.6,
    dream_stable: 0.8,
    user_confirmed: 1,
    user_locked: 1.2,
};
const stateWeight = {
    recent: 0.45,
    observed: 0.65,
    long_term: 0.9,
    pinned: 1.15,
    archived: 0.05,
};
export class MemoryCenter {
    store;
    nativeMemory;
    dreamQueue = Promise.resolve();
    constructor(store, nativeMemory) {
        this.store = store;
        this.nativeMemory = nativeMemory;
    }
    async state() {
        return this.store.read();
    }
    async dashboard() {
        const state = await this.store.read();
        const inDays = dateDaysFrom(now(), 7);
        const count = (target) => state.memories.filter((memory) => memory.state === target).length;
        return {
            recent: count("recent"),
            observed: count("observed"),
            longTerm: count("long_term"),
            pinned: count("pinned"),
            archived: count("archived"),
            inbox: state.inbox.filter((item) => item.status === "open").length,
            expiringObserved: state.memories.filter((memory) => memory.state === "observed" && memory.observation && memory.observation.expiresAt <= inDays).length,
            latestDream: state.dreams.at(-1),
            recentChanges: state.audit.slice(-10).reverse(),
        };
    }
    async capture(input) {
        const at = input.at ?? now();
        const message = { id: input.messageId ?? id(), role: "user", content: input.content, createdAt: at };
        const traces = this.extractTraces(input.conversationId, message);
        await this.store.transaction((state) => {
            this.upsertConversation(state, input.conversationId, input.title, message);
            for (const trace of traces) {
                if (state.traces.some((existing) => existing.messageId === trace.messageId))
                    continue;
                if (this.isBlocked(state, trace)) {
                    this.audit(state, "capture_blocked_by_boundary", "capture", "Memory Trace was rejected by a Memory Boundary.", undefined, input.conversationId, { topic: trace.topic, type: trace.type });
                    continue;
                }
                state.traces.push(trace);
                const evidence = this.evidenceFrom(trace);
                const matching = state.memories.find((memory) => memory.state !== "archived" && this.sameTopic(memory, trace));
                if (matching) {
                    this.addEvidence(matching, evidence);
                    matching.lastReinforcedAt = at;
                    matching.updatedAt = at;
                    this.timeline(state, matching.id, "evidence_added", "capture", `New trace reinforced “${matching.title}”.`, at);
                    this.audit(state, "memory_reinforced", "capture", `New trace reinforced “${matching.title}”.`, matching.id, input.conversationId);
                    continue;
                }
                const memory = this.newRecentMemory(trace, at);
                state.memories.push(memory);
                this.timeline(state, memory.id, "recent_created", "capture", "Created from a captured Memory Trace.", at);
                this.audit(state, "recent_created", "capture", `Created Recent memory “${memory.title}”.`, memory.id, input.conversationId);
            }
        });
        return traces;
    }
    /** Archive a full completed Hermes turn while profiling only user-authored content. */
    async captureCompletedTurn(input) {
        const at = input.at ?? now();
        const messageId = `turn:${input.sourceId}`;
        const traces = await this.capture({
            conversationId: input.conversationId,
            content: input.userContent,
            messageId,
            title: input.title,
            at,
        });
        await this.store.transaction((state) => {
            const assistant = { id: `${messageId}:assistant`, role: "assistant", content: input.assistantContent, createdAt: at };
            this.upsertConversation(state, input.conversationId, input.title, assistant);
            const toolMessages = (input.messages ?? []).filter((message) => message.role === "tool" || message.role === "function");
            for (const [index, tool] of toolMessages.entries()) {
                const content = typeof tool.content === "string" ? tool.content : JSON.stringify(tool.content ?? null);
                if (!content)
                    continue;
                // Hermes can provide the complete transcript. A deterministic id keeps
                // already-seen tool provenance from being copied on every later turn.
                const provenanceId = `provenance:${input.conversationId}:${tool.role}:${normalize(content).slice(0, 500)}`;
                this.upsertConversation(state, input.conversationId, input.title, { id: provenanceId || `${messageId}:tool:${index}`, role: tool.role, content: content.slice(0, 5_000), createdAt: at });
            }
            const toolCount = toolMessages.length;
            this.audit(state, "turn_archived", "capture", "Archived a completed Hermes turn; tool output was retained as provenance only.", undefined, input.conversationId, { sourceId: input.sourceId, toolMessageCount: toolCount });
        });
        return traces;
    }
    async listMemories(options = {}) {
        const state = await this.store.read();
        const query = options.query ? normalize(options.query) : undefined;
        return state.memories
            .filter((memory) => (options.state ? memory.state === options.state : options.includeArchived || memory.state !== "archived"))
            .filter((memory) => !query || normalize(`${memory.title} ${memory.content} ${memory.topic}`).includes(query))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    async getMemory(memoryId) {
        return (await this.store.read()).memories.find((memory) => memory.id === memoryId);
    }
    async updateMemory(memoryId, change, actor = "user") {
        return this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            if (this.isBlocked(state, { topic: memory.topic, type: change.type, normalizedText: change.content, memoryId: memory.id })) {
                throw new Error("This change is blocked by a Memory Boundary.");
            }
            memory.title = change.title.trim();
            memory.content = change.content.trim();
            memory.type = change.type;
            memory.authority = actor === "user" ? "user_confirmed" : memory.authority;
            memory.userConfirmed ||= actor === "user";
            memory.lastConfirmedAt = actor === "user" ? now() : memory.lastConfirmedAt;
            memory.updatedAt = now();
            this.timeline(state, memory.id, "edited", actor, "Memory content was manually edited.");
            this.audit(state, "memory_edited", actor, `Edited “${memory.title}”.`, memory.id);
            return structuredClone(memory);
        });
    }
    async decideObserved(memoryId, action) {
        await this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            if (memory.state !== "observed")
                throw new Error("Only observed memories can be decided here.");
            const at = now();
            if (action === "confirm") {
                this.promote(state, memory, "user", "User confirmed this observation as a long-term memory.", at);
            }
            else if (action === "continue") {
                if (memory.observation)
                    memory.observation.expiresAt = dateDaysFrom(at, state.settings.observedDays);
                memory.updatedAt = at;
                this.timeline(state, memory.id, "continued_observation", "user", "User chose to continue observing this candidate.", at);
                this.audit(state, "observed_continued", "user", `Continued observing “${memory.title}”.`, memory.id);
            }
            else if (action === "recent") {
                memory.state = "recent";
                memory.authority = "inferred";
                memory.observation = undefined;
                memory.updatedAt = at;
                this.timeline(state, memory.id, "demoted_to_recent", "user", "User marked this as recent rather than long-term.", at);
                this.audit(state, "observed_demoted", "user", `Demoted “${memory.title}” to Recent.`, memory.id);
            }
            else {
                this.deleteFromState(state, memory, "user", "User chose not to remember this candidate.", at);
            }
        });
    }
    async pin(memoryId) {
        return this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            const at = now();
            memory.state = "pinned";
            memory.pinned = true;
            memory.authority = "user_locked";
            memory.userConfirmed = true;
            memory.lastConfirmedAt = at;
            memory.updatedAt = at;
            memory.observation = undefined;
            this.timeline(state, memory.id, "pinned", "user", "User pinned this Memory Center memory permanently.", at);
            this.audit(state, "memory_pinned", "user", `Pinned “${memory.title}”.`, memory.id);
            return structuredClone(memory);
        });
    }
    async unpin(memoryId) {
        return this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            if (memory.state !== "pinned")
                throw new Error("Memory is not pinned.");
            const at = now();
            memory.state = "long_term";
            memory.pinned = false;
            memory.authority = memory.userConfirmed ? "user_confirmed" : "dream_stable";
            memory.updatedAt = at;
            this.timeline(state, memory.id, "unpinned", "user", "User removed the pin; it remains a long-term memory.", at);
            this.audit(state, "memory_unpinned", "user", `Unpinned “${memory.title}”.`, memory.id);
            return structuredClone(memory);
        });
    }
    async archive(memoryId) {
        await this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            if (memory.state !== "long_term")
                throw new Error("Only Long-term memories can be archived; handle Recent or Observed through their lifecycle first.");
            const at = now();
            memory.archivedFromState = memory.state;
            memory.state = "archived";
            memory.lifecycle = "dormant";
            memory.archivedAt = at;
            memory.updatedAt = at;
            this.timeline(state, memory.id, "archived", "user", "User archived this memory.", at);
            this.audit(state, "memory_archived", "user", `Archived “${memory.title}”.`, memory.id);
        });
    }
    async restore(memoryId) {
        await this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            if (memory.state !== "archived")
                throw new Error("Only archived memories can be restored.");
            const at = now();
            memory.state = memory.archivedFromState ?? "long_term";
            memory.lifecycle = memory.state === "recent" ? "active" : "stable";
            memory.archivedAt = undefined;
            memory.archivedFromState = undefined;
            memory.updatedAt = at;
            this.timeline(state, memory.id, "restored", "user", "User restored this memory from archive.", at);
            this.audit(state, "memory_restored", "user", `Restored “${memory.title}”.`, memory.id);
        });
    }
    async deleteMemory(memoryId, options = {}) {
        return this.store.transaction((state) => {
            const memory = this.requireMemory(state, memoryId);
            const targets = options.related ? state.memories.filter((candidate) => candidate.topic === memory.topic) : [memory];
            const at = now();
            if (options.preventRelearning) {
                const boundary = { id: id(), scope: "topic", value: memory.topic, createdAt: at, createdBy: "user", reason: "Created while deleting memory and blocking relearning." };
                state.boundaries.push(boundary);
                this.audit(state, "boundary_created", "user", `Created boundary for topic “${memory.topic}”.`, memory.id, undefined, { boundaryId: boundary.id });
            }
            for (const target of targets)
                this.deleteFromState(state, target, "user", "User deleted this Memory Center memory.", at);
            return targets.length;
        });
    }
    async createBoundary(scope, value, reason) {
        return this.store.transaction((state) => {
            const boundary = { id: id(), scope, value: normalize(value), createdAt: now(), createdBy: "user", reason };
            state.boundaries.push(boundary);
            this.audit(state, "boundary_created", "user", `Created ${scope} boundary.`, undefined, undefined, { boundaryId: boundary.id });
            return structuredClone(boundary);
        });
    }
    async removeBoundary(boundaryId) {
        await this.store.transaction((state) => {
            const index = state.boundaries.findIndex((boundary) => boundary.id === boundaryId);
            if (index < 0)
                throw new Error("Boundary not found.");
            state.boundaries.splice(index, 1);
            this.audit(state, "boundary_removed", "user", "Removed Memory Boundary.", undefined, undefined, { boundaryId });
        });
    }
    async runDream(trigger = "manual") {
        // The provider, Dashboard and standalone UI share one engine. Serialize
        // whole runs so stage transitions cannot interleave across triggers.
        const execute = () => this.runDreamNow(trigger);
        const work = this.dreamQueue.then(execute, execute);
        this.dreamQueue = work.then(() => undefined, () => undefined);
        return work;
    }
    async runDreamNow(trigger) {
        const run = { id: id(), trigger, startedAt: now(), status: "completed", entries: [] };
        await this.store.transaction((state) => state.dreams.push(run));
        for (const stage of ["light", "rem", "deep"]) {
            try {
                const entry = await this.store.transaction((state) => this.runDreamStage(state, run.id, stage));
                run.entries.push(entry);
            }
            catch (error) {
                run.status = run.entries.length ? "partial" : "failed";
                const entry = { stage, at: now(), summary: `Stage failed: ${error.message}`, actions: [], status: "failed" };
                run.entries.push(entry);
                await this.store.transaction((state) => {
                    const saved = state.dreams.find((item) => item.id === run.id);
                    if (saved) {
                        saved.status = run.status;
                        saved.entries.push(entry);
                        saved.completedAt = now();
                    }
                    this.audit(state, "dream_stage_failed", "system", entry.summary, undefined, undefined, { stage });
                });
                break;
            }
        }
        return this.store.transaction((state) => {
            const saved = state.dreams.find((item) => item.id === run.id);
            if (!saved)
                throw new Error("Dream run disappeared.");
            saved.status = run.status;
            saved.completedAt ??= now();
            return structuredClone(saved);
        });
    }
    async recall(conversationId, query, limit) {
        return this.store.transaction((state) => {
            const max = limit ?? state.settings.recallLimit;
            const candidates = state.memories
                .filter((memory) => memory.state !== "archived")
                .filter((memory) => !this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: `${memory.title} ${memory.content}`, memoryId: memory.id }))
                .filter((memory) => this.isRecallAllowed(memory, state.settings))
                .map((memory) => ({ memory, ...this.scoreRecall(memory, query) }))
                .filter((candidate) => candidate.score > this.recallThreshold(state.settings))
                .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
                .slice(0, max);
            const at = now();
            const results = candidates.map(({ memory, score, reason }) => {
                const record = { id: id(), at, conversationId, query, memoryId: memory.id, memoryState: memory.state, score, reason, contextStatus: "selected" };
                state.recalls.push(record);
                memory.recalledCount += 1;
                memory.lastRecalledAt = at;
                memory.updatedAt = at;
                this.audit(state, "memory_recalled", "system", `Recalled “${memory.title}”: ${reason}`, memory.id, conversationId, { score, recordId: record.id });
                return { memory: structuredClone(memory), score, reason, recordId: record.id };
            });
            const context = results.map(({ memory }) => {
                const marker = memory.state === "observed" ? "观察中，尚未确认" : memory.state === "recent" ? "最近信息" : memory.state === "pinned" ? "固定记忆" : "长期记忆";
                return `- [${marker}] ${memory.title}: ${memory.content}`;
            }).join("\n");
            return { context, memories: results };
        });
    }
    async markRecallOutcome(recordIds, contextStatus) {
        await this.store.transaction((state) => {
            for (const record of state.recalls) {
                if (!recordIds.includes(record.id))
                    continue;
                record.contextStatus = contextStatus;
                this.audit(state, "recall_outcome_recorded", "system", `Recall context status is ${contextStatus}.`, record.memoryId, record.conversationId, { recordId: record.id });
            }
        });
    }
    async resolveInbox(inboxId, action) {
        await this.store.transaction((state) => {
            const inbox = state.inbox.find((item) => item.id === inboxId && item.status === "open");
            if (!inbox)
                throw new Error("Open Inbox item not found.");
            const memory = this.requireMemory(state, inbox.memoryId);
            const at = now();
            if (action === "confirm")
                this.promote(state, memory, "user", "User confirmed this Inbox candidate.", at);
            if (action === "continue") {
                memory.state = "observed";
                memory.observation ??= this.observation(memory, state.settings, at, "User requested continued observation.");
            }
            if (action === "recent") {
                memory.state = "recent";
                memory.authority = "inferred";
                memory.observation = undefined;
            }
            if (action === "keep_old" && inbox.conflictingMemoryId) {
                memory.resolvedConflictEvidence ??= {};
                memory.resolvedConflictEvidence[inbox.conflictingMemoryId] = memory.evidence.length;
            }
            if (action === "use_new" && inbox.conflictingMemoryId) {
                const old = this.requireMemory(state, inbox.conflictingMemoryId);
                if (old.state !== "pinned" && old.authority !== "user_locked")
                    this.archiveMemory(state, old, "user", "User chose newer conflicting information.", at);
                else
                    throw new Error("Pinned or locked memory must be manually edited; it cannot be silently replaced.");
                this.promote(state, memory, "user", "User chose this new memory over the prior conflicting memory.", at);
            }
            inbox.status = "resolved";
            this.audit(state, "inbox_resolved", "user", `Resolved Inbox item with “${action}”.`, memory.id, undefined, { inboxId });
        });
    }
    async updateSettings(next) {
        return this.store.transaction((state) => {
            state.settings = { ...state.settings, ...next };
            this.audit(state, "settings_updated", "user", "Updated Memory Center settings.");
            return structuredClone(state.settings);
        });
    }
    async nativeMemoryView(target) {
        const state = await this.store.read();
        const history = state.nativeMemoryHistory.filter((version) => version.target === target).sort((a, b) => b.at.localeCompare(a.at));
        if (!this.nativeMemory || !this.nativeMemory.available)
            return { available: false, limitation: this.nativeMemory?.limitation ?? "No Hermes native-memory adapter has been configured.", history };
        return { available: true, content: await this.nativeMemory.read(target), history };
    }
    /** This method is only reachable from an explicit UI/API user action. */
    async writeNativeMemory(target, nextContent, confirmation) {
        if (!confirmation.confirmed)
            throw new Error("Native memory write requires explicit user confirmation.");
        if (!this.nativeMemory?.available)
            throw new Error(this.nativeMemory?.limitation ?? "No Hermes native-memory adapter has been configured.");
        const previousContent = await this.nativeMemory.read(target);
        await this.nativeMemory.write(target, nextContent);
        await this.store.transaction((state) => {
            const version = { id: id(), target, at: now(), action: confirmation.action ?? "write", previousContent, nextContent, actor: "user", sourceMemoryId: confirmation.sourceMemoryId };
            state.nativeMemoryHistory.push(version);
            this.audit(state, confirmation.action === "copy" ? "copied_to_native_memory" : "native_memory_edited", "user", `Explicitly wrote Hermes ${target === "user" ? "USER.md" : "MEMORY.md"}.`, confirmation.sourceMemoryId, undefined, { versionId: version.id });
        });
    }
    async restoreNativeMemory(target, versionId, confirmed) {
        const state = await this.store.read();
        const version = state.nativeMemoryHistory.find((item) => item.id === versionId && item.target === target);
        if (!version)
            throw new Error("Native memory version not found.");
        // A history row represents the content after that user action. “恢复此版本”
        // therefore restores nextContent; undoing a change is a separate future UX.
        await this.writeNativeMemory(target, version.nextContent, { confirmed, action: "write" });
        await this.store.transaction((next) => {
            const latest = next.nativeMemoryHistory.at(-1);
            if (latest)
                latest.action = "restore";
        });
    }
    async copyMemoryToNative(memoryId, target, editedContent, confirmed) {
        const memory = await this.getMemory(memoryId);
        if (!memory || !["long_term", "pinned"].includes(memory.state))
            throw new Error("Only Long-term or Pinned Memory Center memories can be copied to Hermes native memory.");
        await this.writeNativeMemory(target, editedContent, { confirmed, sourceMemoryId: memoryId, action: "copy" });
    }
    async exportData() {
        return this.store.read();
    }
    extractTraces(conversationId, message) {
        const sentences = message.content.split(/(?<=[。！？.!?])\s*/u).map((text) => text.trim()).filter((text) => text.length >= 6);
        return sentences
            .filter((text) => !/(不要记|别记住|do not remember|don't remember)/i.test(text))
            .slice(0, 8)
            .map((text) => ({
            id: id(),
            conversationId,
            messageId: message.id,
            excerpt: text.slice(0, 500),
            normalizedText: normalize(text),
            topic: topicFor(text),
            type: typeFor(text),
            explicit: /(记住|remember|长期|一直|总是|偏好|喜欢|目标|计划)/i.test(text),
            createdAt: message.createdAt,
        }));
    }
    upsertConversation(state, conversationId, title, message) {
        const existing = state.conversations.find((conversation) => conversation.id === conversationId);
        if (existing) {
            if (!existing.messages.some((item) => item.id === message.id))
                existing.messages.push(message);
            existing.updatedAt = message.createdAt;
            if (title)
                existing.title = title;
            return;
        }
        const conversation = { id: conversationId, createdAt: message.createdAt, updatedAt: message.createdAt, title, messages: [message] };
        state.conversations.push(conversation);
    }
    newRecentMemory(trace, at) {
        const evidence = this.evidenceFrom(trace);
        return {
            id: id(), title: titleFor(trace.excerpt, trace.type), content: trace.excerpt, type: trace.type,
            state: "recent", lifecycle: "active", authority: "inferred", createdAt: at, updatedAt: at,
            firstDiscoveredAt: at, lastReinforcedAt: at, recalledCount: 0, userConfirmed: false, pinned: false,
            topic: trace.topic, evidence: [evidence], relatedTraceIds: [trace.id], relatedConversationIds: [trace.conversationId], createdBy: "capture",
        };
    }
    evidenceFrom(trace) {
        return { traceId: trace.id, conversationId: trace.conversationId, messageId: trace.messageId, excerpt: trace.excerpt, observedAt: trace.createdAt };
    }
    addEvidence(memory, evidence) {
        if (!memory.relatedTraceIds.includes(evidence.traceId))
            memory.relatedTraceIds.push(evidence.traceId);
        if (!memory.relatedConversationIds.includes(evidence.conversationId))
            memory.relatedConversationIds.push(evidence.conversationId);
        if (!memory.evidence.some((item) => item.traceId === evidence.traceId))
            memory.evidence.push(evidence);
    }
    isBlocked(state, candidate) {
        const content = normalize(`${candidate.topic} ${candidate.normalizedText}`);
        return state.boundaries.some((boundary) => {
            if (boundary.scope === "memory")
                return boundary.value === candidate.memoryId;
            if (boundary.scope === "type")
                return boundary.value === candidate.type;
            return content.includes(normalize(boundary.value));
        });
    }
    sameTopic(memory, trace) {
        if (memory.topic === trace.topic)
            return true;
        const left = new Set(words(`${memory.topic} ${memory.content}`));
        const right = new Set(words(`${trace.topic} ${trace.normalizedText}`));
        const overlap = [...left].filter((term) => right.has(term)).length;
        return overlap >= 2 || [...left].some((term) => semanticAliases.some((alias) => alias.canonical === term && right.has(alias.canonical)));
    }
    observationThreshold(memory, settings) {
        const base = memory.type === "project" || memory.type === "goal" ? 2 : 3;
        if (settings.memoryStyle === "conservative")
            return base + 1;
        if (settings.memoryStyle === "active")
            return Math.max(1, base - 1);
        return base;
    }
    isRecallAllowed(memory, settings) {
        if (settings.memoryStyle !== "conservative")
            return true;
        return memory.state !== "recent" && memory.state !== "observed";
    }
    recallThreshold(settings) {
        return settings.memoryStyle === "conservative" ? 0.1 : settings.memoryStyle === "active" ? 0.025 : 0.05;
    }
    runDreamStage(state, runId, stage) {
        const at = now();
        const actions = [];
        if (stage === "light") {
            const seen = new Set();
            const before = state.traces.length;
            state.traces = state.traces.filter((trace) => {
                const key = `${trace.conversationId}:${trace.normalizedText}`;
                if (seen.has(key))
                    return false;
                seen.add(key);
                return true;
            });
            const removed = before - state.traces.length;
            if (removed)
                actions.push(`合并了 ${removed} 条重复 Trace。`);
            actions.push(`整理了 ${state.memories.filter((memory) => memory.state === "recent").length} 条近期记忆。`);
        }
        if (stage === "rem") {
            for (const memory of state.memories.filter((item) => item.state === "recent")) {
                if (this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: memory.content, memoryId: memory.id }))
                    continue;
                const evidenceDays = unique(memory.evidence.map((evidence) => evidence.observedAt.slice(0, 10))).length;
                const threshold = this.observationThreshold(memory, state.settings);
                if (memory.evidence.length >= threshold || (memory.evidence.length >= 2 && evidenceDays >= 2) || memory.relatedTraceIds.some((traceId) => state.traces.find((trace) => trace.id === traceId)?.explicit)) {
                    memory.state = "observed";
                    memory.authority = "observed";
                    memory.observation = this.observation(memory, state.settings, at, "REM Dream found repeated or explicit evidence; this remains unconfirmed.");
                    memory.updatedAt = at;
                    this.timeline(state, memory.id, "entered_observed", "rem_dream", memory.observation.reason, at);
                    this.audit(state, "observed_created", "rem_dream", `Dream created observation “${memory.title}”.`, memory.id);
                    actions.push(`将“${memory.title}”置为观察中。`);
                }
            }
            if (!actions.length)
                actions.push("未发现足够稳定的新候选。");
        }
        if (stage === "deep") {
            for (const memory of state.memories.filter((item) => item.state === "observed")) {
                if (this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: memory.content, memoryId: memory.id }))
                    continue;
                if (memory.observation && memory.observation.expiresAt < at) {
                    memory.state = "recent";
                    memory.authority = "inferred";
                    memory.observation = undefined;
                    memory.updatedAt = at;
                    this.timeline(state, memory.id, "observed_expired", "deep_dream", "Observation received no new evidence and returned to Recent.", at);
                    actions.push(`“${memory.title}”因缺少新证据而降回近期记忆。`);
                    continue;
                }
                const hasStrongEvidence = memory.evidence.length >= 3 && unique(memory.evidence.map((evidence) => evidence.observedAt.slice(0, 10))).length >= 2;
                if (!hasStrongEvidence)
                    continue;
                const conflict = this.conflictWith(state, memory);
                if (conflict) {
                    this.openInbox(state, memory, conflict, "conflict", "New observed evidence conflicts with a higher-authority memory.", at);
                    actions.push(`“${memory.title}”与既有记忆冲突，已进入待确认。`);
                    continue;
                }
                if (state.settings.autoPromoteObserved || state.settings.memoryStyle === "active") {
                    this.promote(state, memory, "deep_dream", "Deep Dream found stable cross-day evidence.", at);
                    actions.push(`将“${memory.title}”晋升为长期记忆。`);
                }
                else {
                    this.openInbox(state, memory, undefined, "promotion", "Deep Dream found stable cross-day evidence; user confirmation is required.", at);
                    actions.push(`“${memory.title}”满足晋升证据，已请求用户确认。`);
                }
            }
            this.applyDecay(state, at, actions);
            if (!actions.length)
                actions.push("未发生长期状态变更。");
        }
        const entry = { stage, at, summary: actions.join(" "), actions, status: "completed" };
        const run = state.dreams.find((item) => item.id === runId);
        if (!run)
            throw new Error("Dream run not found.");
        run.entries.push(entry);
        this.audit(state, `dream_${stage}_completed`, stage === "light" ? "light_dream" : stage === "rem" ? "rem_dream" : "deep_dream", entry.summary, undefined, undefined, { runId });
        return structuredClone(entry);
    }
    observation(memory, settings, at, reason) {
        const multiplier = settings.memoryStyle === "conservative" ? 1.5 : settings.memoryStyle === "active" ? 0.7 : 1;
        return { reason, appearances: memory.evidence.length, distinctDays: unique(memory.evidence.map((evidence) => evidence.observedAt.slice(0, 10))).length, nextStep: "等待更多跨场景或跨天证据，或由用户确认。", expiresAt: dateDaysFrom(at, Math.max(1, Math.round(settings.observedDays * multiplier))) };
    }
    promote(state, memory, actor, detail, at) {
        if (this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: memory.content, memoryId: memory.id }))
            throw new Error("Promotion is blocked by a Memory Boundary.");
        memory.state = "long_term";
        memory.lifecycle = "stable";
        memory.authority = actor === "user" ? "user_confirmed" : "dream_stable";
        memory.userConfirmed ||= actor === "user";
        memory.lastConfirmedAt = actor === "user" ? at : memory.lastConfirmedAt;
        memory.observation = undefined;
        memory.updatedAt = at;
        this.timeline(state, memory.id, "promoted_to_long_term", actor, detail, at);
        this.audit(state, "memory_promoted", actor, `Promoted “${memory.title}” to Long-term.`, memory.id);
    }
    conflictWith(state, candidate) {
        const candidateWords = new Set(words(candidate.content));
        const candidateDetailed = candidateWords.has("详细解释");
        const candidateConcise = candidateWords.has("简洁回答");
        return state.memories.find((memory) => {
            if (memory.id === candidate.id || !["long_term", "pinned"].includes(memory.state) || authorityWeight[memory.authority] < authorityWeight["dream_stable"] || memory.type !== candidate.type)
                return false;
            const existingWords = new Set(words(memory.content));
            const oppositePreference = (candidateDetailed && existingWords.has("简洁回答")) || (candidateConcise && existingWords.has("详细解释"));
            const sharedTopic = [...existingWords].some((word) => candidateWords.has(word));
            const explicitNegation = /(?:不喜欢|不想|不要|不是|\b(?:not|never|no)\b)/i.test(`${memory.content} ${candidate.content}`);
            return oppositePreference || (sharedTopic && explicitNegation);
        });
    }
    openInbox(state, memory, conflicting, kind = "promotion", detail = "", at = now()) {
        if (state.inbox.some((item) => item.memoryId === memory.id && item.status === "open" && item.kind === kind))
            return;
        if (conflicting && memory.resolvedConflictEvidence?.[conflicting.id] !== undefined && memory.resolvedConflictEvidence[conflicting.id] >= memory.evidence.length)
            return;
        const item = { id: id(), kind: conflicting?.state === "pinned" ? "pinned_conflict" : kind, memoryId: memory.id, conflictingMemoryId: conflicting?.id, createdAt: at, status: "open", detail };
        state.inbox.push(item);
        this.timeline(state, memory.id, "inbox_created", "deep_dream", detail, at);
        this.audit(state, "inbox_created", "deep_dream", detail, memory.id, undefined, { inboxId: item.id, conflictingMemoryId: conflicting?.id });
    }
    applyDecay(state, at, actions) {
        for (const memory of state.memories) {
            if (memory.state === "pinned" || memory.state === "archived")
                continue;
            const ageSource = memory.state === "long_term" ? (memory.lastRecalledAt ?? memory.lastReinforcedAt ?? memory.updatedAt) : (memory.lastReinforcedAt ?? memory.updatedAt);
            const age = new Date(at).getTime() - new Date(ageSource).getTime();
            const multiplier = state.settings.memoryStyle === "conservative" ? 1.25 : state.settings.memoryStyle === "active" ? 0.75 : 1;
            if (memory.state === "recent" && age > state.settings.recentDays * multiplier * DAY) {
                memory.lifecycle = "expired";
                this.deleteFromState(state, memory, "deep_dream", "Recent memory expired without sufficient long-term value.", at);
                actions.push(`清理了过期近期记忆“${memory.title}”。`);
            }
            else if (memory.state === "observed" && memory.observation && memory.observation.expiresAt < at) {
                memory.lifecycle = "expired";
                this.deleteFromState(state, memory, "deep_dream", "Observed candidate expired without reinforcement.", at);
                actions.push(`清理了过期候选“${memory.title}”。`);
            }
            else if (memory.state === "long_term" && age > state.settings.archiveDays * multiplier * DAY && !memory.userConfirmed) {
                this.archiveMemory(state, memory, "deep_dream", "Long-term memory was inactive and not user-confirmed.", at);
                actions.push(`归档了长期未使用记忆“${memory.title}”。`);
            }
            else if (memory.state === "long_term" && age > state.settings.dormantDays * multiplier * DAY) {
                memory.lifecycle = "dormant";
            }
        }
    }
    archiveMemory(state, memory, actor, detail, at) {
        if (memory.state !== "archived")
            memory.archivedFromState = memory.state;
        memory.state = "archived";
        memory.lifecycle = "dormant";
        memory.archivedAt = at;
        memory.updatedAt = at;
        this.timeline(state, memory.id, "archived", actor, detail, at);
        this.audit(state, "memory_archived", actor, `Archived “${memory.title}”.`, memory.id);
    }
    deleteFromState(state, memory, actor, detail, at) {
        state.memories = state.memories.filter((item) => item.id !== memory.id);
        state.inbox = state.inbox.filter((item) => item.memoryId !== memory.id && item.conflictingMemoryId !== memory.id);
        this.timeline(state, memory.id, "deleted", actor, detail, at);
        this.audit(state, "memory_deleted", actor, `Deleted “${memory.title}”.`, memory.id);
    }
    scoreRecall(memory, query) {
        const queryWords = new Set(words(query));
        const haystack = new Set(words(`${memory.title} ${memory.content} ${memory.topic}`));
        const overlap = [...queryWords].filter((word) => haystack.has(word));
        const relevance = queryWords.size ? overlap.length / queryWords.size : 0;
        const recencyAge = Math.max(0, Date.now() - new Date(memory.updatedAt).getTime());
        const recency = Math.max(0.1, 1 - recencyAge / (365 * DAY));
        const score = (relevance * 0.7 + recency * 0.15 + Math.min(memory.recalledCount / 20, 0.15)) * authorityWeight[memory.authority] * stateWeight[memory.state];
        const rank = memory.state === "pinned" ? "固定且高权威" : memory.state === "long_term" ? "长期且稳定" : memory.state === "observed" ? "观察中、尚未确认" : "近期信息";
        return { score, reason: `${rank}；与问题共享关键词：${overlap.slice(0, 4).join("、") || "语义相关性较低"}。` };
    }
    requireMemory(state, memoryId) {
        const memory = state.memories.find((item) => item.id === memoryId);
        if (!memory)
            throw new Error("Memory not found.");
        return memory;
    }
    timeline(state, memoryId, action, actor, detail, at = now()) {
        const event = { id: id(), memoryId, at, action, actor, detail };
        state.timeline.push(event);
    }
    audit(state, action, actor, detail, memoryId, conversationId, metadata) {
        const event = { id: id(), at: now(), action, actor, memoryId, conversationId, detail, metadata };
        state.audit.push(event);
    }
}
export const createMemoryCenter = (store, nativeMemory) => new MemoryCenter(store, nativeMemory);
