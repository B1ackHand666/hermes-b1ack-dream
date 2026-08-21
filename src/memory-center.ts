import { randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  type Actor,
  type AuditEvent,
  type Authority,
  type Boundary,
  type Conversation,
  type ConversationMessage,
  type DreamEntry,
  type DreamRun,
  type InboxItem,
  type LifecycleState,
  type MemoryCenterState,
  type MemoryItem,
  type MemoryState,
  type MemoryTrace,
  type MemoryType,
  type NativeMemoryVersion,
  type RecallRecord,
  type Settings,
  type TimelineEvent,
} from "./domain.js";
import { JsonMemoryStore } from "./store.js";

export interface NativeMemoryAdapter {
  readonly available: boolean;
  readonly limitation?: string;
  read(target: "user" | "memory"): Promise<string>;
  write(target: "user" | "memory", content: string): Promise<void>;
}

export interface CaptureInput {
  conversationId: string;
  content: string;
  title?: string;
  messageId?: string;
  at?: string;
}

export interface RecallResult {
  context: string;
  memories: Array<{ memory: MemoryItem; score: number; reason: string; recordId: string }>;
}

export interface Dashboard {
  recent: number;
  observed: number;
  longTerm: number;
  pinned: number;
  archived: number;
  inbox: number;
  expiringObserved: number;
  latestDream?: DreamRun;
  recentChanges: AuditEvent[];
}

export interface NativeMemoryView {
  available: boolean;
  limitation?: string;
  content?: string;
  history: NativeMemoryVersion[];
}

const DAY = 24 * 60 * 60 * 1000;
const now = (): string => new Date().toISOString();
const id = (): string => randomUUID();
const normalize = (value: string): string => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const words = (value: string): string[] => normalize(value).match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
const unique = <T>(values: T[]): T[] => [...new Set(values)];
const dateDaysFrom = (value: string, days: number): string => new Date(new Date(value).getTime() + days * DAY).toISOString();

const typeFor = (text: string): MemoryType => {
  const content = normalize(text);
  if (/(喜欢|偏好|prefer|like|讨厌|不喜欢)/.test(content)) return "preference";
  if (/(目标|计划|准备|goal|plan|intend)/.test(content)) return "goal";
  if (/(项目|project|仓库|repo|开发)/.test(content)) return "project";
  if (/(学习|课程|考试|learn|study)/.test(content)) return "learning";
  if (/(习惯|每天|每周|habit)/.test(content)) return "habit";
  if (/(协作|工作流|合作|workflow)/.test(content)) return "collaboration";
  return "fact";
};

const titleFor = (text: string, fallbackType: MemoryType): string => {
  const concise = text.replace(/\s+/g, " ").trim().replace(/[。！？.!?].*$/u, "");
  if (concise.length <= 48) return concise || fallbackType;
  return `${concise.slice(0, 45)}…`;
};

const topicFor = (text: string): string => {
  const terms = words(text).filter((word) => !new Set(["用户", "hermes", "memory", "center", "这个", "那个", "我们", "的是", "可以", "需要"]).has(word));
  return terms.slice(0, 5).join(" ") || normalize(text).slice(0, 40);
};

const authorityWeight: Record<Authority, number> = {
  inferred: 0.45,
  observed: 0.6,
  dream_stable: 0.8,
  user_confirmed: 1,
  user_locked: 1.2,
};
const stateWeight: Record<MemoryState, number> = {
  recent: 0.45,
  observed: 0.65,
  long_term: 0.9,
  pinned: 1.15,
  archived: 0.05,
};

export class MemoryCenter {
  constructor(
    private readonly store: JsonMemoryStore,
    private readonly nativeMemory?: NativeMemoryAdapter,
  ) {}

  async state(): Promise<MemoryCenterState> {
    return this.store.read();
  }

  async dashboard(): Promise<Dashboard> {
    const state = await this.store.read();
    const inDays = dateDaysFrom(now(), 7);
    const count = (target: MemoryState): number => state.memories.filter((memory) => memory.state === target).length;
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

  async capture(input: CaptureInput): Promise<MemoryTrace[]> {
    const at = input.at ?? now();
    const message: ConversationMessage = { id: input.messageId ?? id(), role: "user", content: input.content, createdAt: at };
    const traces = this.extractTraces(input.conversationId, message);
    if (traces.length === 0) return [];

    await this.store.transaction((state) => {
      this.upsertConversation(state, input.conversationId, input.title, message);
      for (const trace of traces) {
        if (this.isBlocked(state, trace)) {
          this.audit(state, "capture_blocked_by_boundary", "capture", "Memory Trace was rejected by a Memory Boundary.", undefined, input.conversationId, { topic: trace.topic, type: trace.type });
          continue;
        }
        state.traces.push(trace);
        const evidence = this.evidenceFrom(trace);
        const matching = state.memories.find((memory) => memory.state !== "archived" && memory.topic === trace.topic && memory.type === trace.type);
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

  async listMemories(options: { state?: MemoryState; query?: string; includeArchived?: boolean } = {}): Promise<MemoryItem[]> {
    const state = await this.store.read();
    const query = options.query ? normalize(options.query) : undefined;
    return state.memories
      .filter((memory) => (options.state ? memory.state === options.state : options.includeArchived || memory.state !== "archived"))
      .filter((memory) => !query || normalize(`${memory.title} ${memory.content} ${memory.topic}`).includes(query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getMemory(memoryId: string): Promise<MemoryItem | undefined> {
    return (await this.store.read()).memories.find((memory) => memory.id === memoryId);
  }

  async updateMemory(memoryId: string, change: Pick<MemoryItem, "title" | "content" | "type">, actor: Actor = "user"): Promise<MemoryItem> {
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

  async decideObserved(memoryId: string, action: "confirm" | "continue" | "recent" | "ignore"): Promise<void> {
    await this.store.transaction((state) => {
      const memory = this.requireMemory(state, memoryId);
      if (memory.state !== "observed") throw new Error("Only observed memories can be decided here.");
      const at = now();
      if (action === "confirm") {
        this.promote(state, memory, "user", "User confirmed this observation as a long-term memory.", at);
      } else if (action === "continue") {
        if (memory.observation) memory.observation.expiresAt = dateDaysFrom(at, state.settings.observedDays);
        memory.updatedAt = at;
        this.timeline(state, memory.id, "continued_observation", "user", "User chose to continue observing this candidate.", at);
        this.audit(state, "observed_continued", "user", `Continued observing “${memory.title}”.`, memory.id);
      } else if (action === "recent") {
        memory.state = "recent";
        memory.authority = "inferred";
        memory.observation = undefined;
        memory.updatedAt = at;
        this.timeline(state, memory.id, "demoted_to_recent", "user", "User marked this as recent rather than long-term.", at);
        this.audit(state, "observed_demoted", "user", `Demoted “${memory.title}” to Recent.`, memory.id);
      } else {
        this.deleteFromState(state, memory, false, "User chose not to remember this candidate.", at);
      }
    });
  }

  async pin(memoryId: string): Promise<MemoryItem> {
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

  async unpin(memoryId: string): Promise<MemoryItem> {
    return this.store.transaction((state) => {
      const memory = this.requireMemory(state, memoryId);
      if (memory.state !== "pinned") throw new Error("Memory is not pinned.");
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

  async archive(memoryId: string): Promise<void> {
    await this.store.transaction((state) => {
      const memory = this.requireMemory(state, memoryId);
      if (memory.state === "pinned") throw new Error("Pinned memories cannot be automatically or manually archived without unpinning first.");
      const at = now();
      memory.state = "archived";
      memory.lifecycle = "dormant";
      memory.archivedAt = at;
      memory.updatedAt = at;
      this.timeline(state, memory.id, "archived", "user", "User archived this memory.", at);
      this.audit(state, "memory_archived", "user", `Archived “${memory.title}”.`, memory.id);
    });
  }

  async restore(memoryId: string): Promise<void> {
    await this.store.transaction((state) => {
      const memory = this.requireMemory(state, memoryId);
      if (memory.state !== "archived") throw new Error("Only archived memories can be restored.");
      const at = now();
      memory.state = "long_term";
      memory.lifecycle = "stable";
      memory.archivedAt = undefined;
      memory.updatedAt = at;
      this.timeline(state, memory.id, "restored", "user", "User restored this memory from archive.", at);
      this.audit(state, "memory_restored", "user", `Restored “${memory.title}”.`, memory.id);
    });
  }

  async deleteMemory(memoryId: string, options: { preventRelearning?: boolean; related?: boolean } = {}): Promise<number> {
    return this.store.transaction((state) => {
      const memory = this.requireMemory(state, memoryId);
      const targets = options.related ? state.memories.filter((candidate) => candidate.topic === memory.topic) : [memory];
      const at = now();
      if (options.preventRelearning) {
        const boundary: Boundary = { id: id(), scope: "topic", value: memory.topic, createdAt: at, createdBy: "user", reason: "Created while deleting memory and blocking relearning." };
        state.boundaries.push(boundary);
        this.audit(state, "boundary_created", "user", `Created boundary for topic “${memory.topic}”.`, memory.id, undefined, { boundaryId: boundary.id });
      }
      for (const target of targets) this.deleteFromState(state, target, false, "User deleted this Memory Center memory.", at);
      return targets.length;
    });
  }

  async createBoundary(scope: Boundary["scope"], value: string, reason?: string): Promise<Boundary> {
    return this.store.transaction((state) => {
      const boundary: Boundary = { id: id(), scope, value: normalize(value), createdAt: now(), createdBy: "user", reason };
      state.boundaries.push(boundary);
      this.audit(state, "boundary_created", "user", `Created ${scope} boundary.`, undefined, undefined, { boundaryId: boundary.id });
      return structuredClone(boundary);
    });
  }

  async removeBoundary(boundaryId: string): Promise<void> {
    await this.store.transaction((state) => {
      const index = state.boundaries.findIndex((boundary) => boundary.id === boundaryId);
      if (index < 0) throw new Error("Boundary not found.");
      state.boundaries.splice(index, 1);
      this.audit(state, "boundary_removed", "user", "Removed Memory Boundary.", undefined, undefined, { boundaryId });
    });
  }

  async runDream(): Promise<DreamRun> {
    const run: DreamRun = { id: id(), startedAt: now(), status: "completed", entries: [] };
    await this.store.transaction((state) => state.dreams.push(run));
    for (const stage of ["light", "rem", "deep"] as const) {
      try {
        const entry = await this.store.transaction((state) => this.runDreamStage(state, run.id, stage));
        run.entries.push(entry);
      } catch (error) {
        run.status = run.entries.length ? "partial" : "failed";
        const entry: DreamEntry = { stage, at: now(), summary: `Stage failed: ${(error as Error).message}`, actions: [], status: "failed" };
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
      if (!saved) throw new Error("Dream run disappeared.");
      saved.status = run.status;
      saved.completedAt ??= now();
      return structuredClone(saved);
    });
  }

  async recall(conversationId: string, query: string, limit?: number): Promise<RecallResult> {
    return this.store.transaction((state) => {
      const max = limit ?? state.settings.recallLimit;
      const candidates = state.memories
        .filter((memory) => memory.state !== "archived")
        .filter((memory) => !this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: `${memory.title} ${memory.content}`, memoryId: memory.id }))
        .map((memory) => ({ memory, ...this.scoreRecall(memory, query) }))
        .filter((candidate) => candidate.score > 0.05)
        .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
        .slice(0, max);
      const at = now();
      const results = candidates.map(({ memory, score, reason }) => {
        const record: RecallRecord = { id: id(), at, conversationId, query, memoryId: memory.id, memoryState: memory.state, score, reason, includedInContext: true };
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

  async markRecallOutcome(recordIds: string[], includedInContext: boolean): Promise<void> {
    await this.store.transaction((state) => {
      for (const record of state.recalls) {
        if (!recordIds.includes(record.id)) continue;
        record.includedInContext = includedInContext;
        this.audit(state, "recall_outcome_recorded", "system", `Recall context ${includedInContext ? "was" : "was not"} used in the final answer.`, record.memoryId, record.conversationId, { recordId: record.id });
      }
    });
  }

  async resolveInbox(inboxId: string, action: "confirm" | "continue" | "recent" | "keep_old" | "use_new"): Promise<void> {
    await this.store.transaction((state) => {
      const inbox = state.inbox.find((item) => item.id === inboxId && item.status === "open");
      if (!inbox) throw new Error("Open Inbox item not found.");
      const memory = this.requireMemory(state, inbox.memoryId);
      const at = now();
      if (action === "confirm") this.promote(state, memory, "user", "User confirmed this Inbox candidate.", at);
      if (action === "continue") {
        memory.state = "observed";
        memory.observation ??= this.observation(memory, state.settings, at, "User requested continued observation.");
      }
      if (action === "recent") {
        memory.state = "recent";
        memory.authority = "inferred";
        memory.observation = undefined;
      }
      if (action === "use_new" && inbox.conflictingMemoryId) {
        const old = this.requireMemory(state, inbox.conflictingMemoryId);
        if (old.state !== "pinned" && old.authority !== "user_locked") this.archiveMemory(state, old, "user", "User chose newer conflicting information.", at);
        else throw new Error("Pinned or locked memory must be manually edited; it cannot be silently replaced.");
      }
      inbox.status = "resolved";
      this.audit(state, "inbox_resolved", "user", `Resolved Inbox item with “${action}”.`, memory.id, undefined, { inboxId });
    });
  }

  async updateSettings(next: Partial<Settings>): Promise<Settings> {
    return this.store.transaction((state) => {
      state.settings = { ...state.settings, ...next };
      this.audit(state, "settings_updated", "user", "Updated Memory Center settings.");
      return structuredClone(state.settings);
    });
  }

  async nativeMemoryView(target: "user" | "memory"): Promise<NativeMemoryView> {
    const state = await this.store.read();
    const history = state.nativeMemoryHistory.filter((version) => version.target === target).sort((a, b) => b.at.localeCompare(a.at));
    if (!this.nativeMemory || !this.nativeMemory.available) return { available: false, limitation: this.nativeMemory?.limitation ?? "No Hermes native-memory adapter has been configured.", history };
    return { available: true, content: await this.nativeMemory.read(target), history };
  }

  /** This method is only reachable from an explicit UI/API user action. */
  async writeNativeMemory(target: "user" | "memory", nextContent: string, confirmation: { confirmed: boolean; sourceMemoryId?: string; action?: "write" | "copy" }): Promise<void> {
    if (!confirmation.confirmed) throw new Error("Native memory write requires explicit user confirmation.");
    if (!this.nativeMemory?.available) throw new Error(this.nativeMemory?.limitation ?? "No Hermes native-memory adapter has been configured.");
    const previousContent = await this.nativeMemory.read(target);
    await this.nativeMemory.write(target, nextContent);
    await this.store.transaction((state) => {
      const version: NativeMemoryVersion = { id: id(), target, at: now(), action: confirmation.action ?? "write", previousContent, nextContent, actor: "user", sourceMemoryId: confirmation.sourceMemoryId };
      state.nativeMemoryHistory.push(version);
      this.audit(state, confirmation.action === "copy" ? "copied_to_native_memory" : "native_memory_edited", "user", `Explicitly wrote Hermes ${target === "user" ? "USER.md" : "MEMORY.md"}.`, confirmation.sourceMemoryId, undefined, { versionId: version.id });
    });
  }

  async restoreNativeMemory(target: "user" | "memory", versionId: string, confirmed: boolean): Promise<void> {
    const state = await this.store.read();
    const version = state.nativeMemoryHistory.find((item) => item.id === versionId && item.target === target);
    if (!version) throw new Error("Native memory version not found.");
    await this.writeNativeMemory(target, version.previousContent, { confirmed, action: "write" });
    await this.store.transaction((next) => {
      const latest = next.nativeMemoryHistory.at(-1);
      if (latest) latest.action = "restore";
    });
  }

  async copyMemoryToNative(memoryId: string, target: "user" | "memory", editedContent: string, confirmed: boolean): Promise<void> {
    const memory = await this.getMemory(memoryId);
    if (!memory || !["long_term", "pinned"].includes(memory.state)) throw new Error("Only Long-term or Pinned Memory Center memories can be copied to Hermes native memory.");
    await this.writeNativeMemory(target, editedContent, { confirmed, sourceMemoryId: memoryId, action: "copy" });
  }

  async exportData(): Promise<MemoryCenterState> {
    return this.store.read();
  }

  private extractTraces(conversationId: string, message: ConversationMessage): MemoryTrace[] {
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

  private upsertConversation(state: MemoryCenterState, conversationId: string, title: string | undefined, message: ConversationMessage): void {
    const existing = state.conversations.find((conversation) => conversation.id === conversationId);
    if (existing) {
      if (!existing.messages.some((item) => item.id === message.id)) existing.messages.push(message);
      existing.updatedAt = message.createdAt;
      if (title) existing.title = title;
      return;
    }
    const conversation: Conversation = { id: conversationId, createdAt: message.createdAt, updatedAt: message.createdAt, title, messages: [message] };
    state.conversations.push(conversation);
  }

  private newRecentMemory(trace: MemoryTrace, at: string): MemoryItem {
    const evidence = this.evidenceFrom(trace);
    return {
      id: id(), title: titleFor(trace.excerpt, trace.type), content: trace.excerpt, type: trace.type,
      state: "recent", lifecycle: "active", authority: "inferred", createdAt: at, updatedAt: at,
      firstDiscoveredAt: at, lastReinforcedAt: at, recalledCount: 0, userConfirmed: false, pinned: false,
      topic: trace.topic, evidence: [evidence], relatedTraceIds: [trace.id], relatedConversationIds: [trace.conversationId], createdBy: "capture",
    };
  }

  private evidenceFrom(trace: MemoryTrace) {
    return { traceId: trace.id, conversationId: trace.conversationId, messageId: trace.messageId, excerpt: trace.excerpt, observedAt: trace.createdAt };
  }

  private addEvidence(memory: MemoryItem, evidence: MemoryItem["evidence"][number]): void {
    if (!memory.relatedTraceIds.includes(evidence.traceId)) memory.relatedTraceIds.push(evidence.traceId);
    if (!memory.relatedConversationIds.includes(evidence.conversationId)) memory.relatedConversationIds.push(evidence.conversationId);
    if (!memory.evidence.some((item) => item.traceId === evidence.traceId)) memory.evidence.push(evidence);
  }

  private isBlocked(state: MemoryCenterState, candidate: Pick<MemoryTrace, "topic" | "type" | "normalizedText"> & { memoryId?: string }): boolean {
    const content = normalize(`${candidate.topic} ${candidate.normalizedText}`);
    return state.boundaries.some((boundary) => {
      if (boundary.scope === "memory") return boundary.value === candidate.memoryId;
      if (boundary.scope === "type") return boundary.value === candidate.type;
      return content.includes(normalize(boundary.value));
    });
  }

  private runDreamStage(state: MemoryCenterState, runId: string, stage: "light" | "rem" | "deep"): DreamEntry {
    const at = now();
    const actions: string[] = [];
    if (stage === "light") {
      const seen = new Set<string>();
      const before = state.traces.length;
      state.traces = state.traces.filter((trace) => {
        const key = `${trace.conversationId}:${trace.normalizedText}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      const removed = before - state.traces.length;
      if (removed) actions.push(`合并了 ${removed} 条重复 Trace。`);
      actions.push(`整理了 ${state.memories.filter((memory) => memory.state === "recent").length} 条近期记忆。`);
    }
    if (stage === "rem") {
      for (const memory of state.memories.filter((item) => item.state === "recent")) {
        if (this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: memory.content, memoryId: memory.id })) continue;
        const evidenceDays = unique(memory.evidence.map((evidence) => evidence.observedAt.slice(0, 10))).length;
        const threshold = memory.type === "project" || memory.type === "goal" ? 2 : 3;
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
      if (!actions.length) actions.push("未发现足够稳定的新候选。" );
    }
    if (stage === "deep") {
      for (const memory of state.memories.filter((item) => item.state === "observed")) {
        if (this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: memory.content, memoryId: memory.id })) continue;
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
        if (!hasStrongEvidence) continue;
        const conflict = this.conflictWith(state, memory);
        if (conflict) {
          this.openInbox(state, memory, conflict, "conflict", "New observed evidence conflicts with a higher-authority memory.", at);
          actions.push(`“${memory.title}”与既有记忆冲突，已进入待确认。`);
          continue;
        }
        if (state.settings.autoPromoteObserved) {
          this.promote(state, memory, "deep_dream", "Deep Dream found stable cross-day evidence.", at);
          actions.push(`将“${memory.title}”晋升为长期记忆。`);
        } else {
          this.openInbox(state, memory, undefined, "promotion", "Deep Dream found stable cross-day evidence; user confirmation is required.", at);
          actions.push(`“${memory.title}”满足晋升证据，已请求用户确认。`);
        }
      }
      this.applyDecay(state, at, actions);
      if (!actions.length) actions.push("未发生长期状态变更。" );
    }
    const entry: DreamEntry = { stage, at, summary: actions.join(" "), actions, status: "completed" };
    const run = state.dreams.find((item) => item.id === runId);
    if (!run) throw new Error("Dream run not found.");
    run.entries.push(entry);
    this.audit(state, `dream_${stage}_completed`, stage === "light" ? "light_dream" : stage === "rem" ? "rem_dream" : "deep_dream", entry.summary, undefined, undefined, { runId });
    return structuredClone(entry);
  }

  private observation(memory: MemoryItem, settings: Settings, at: string, reason: string): NonNullable<MemoryItem["observation"]> {
    return { reason, appearances: memory.evidence.length, distinctDays: unique(memory.evidence.map((evidence) => evidence.observedAt.slice(0, 10))).length, nextStep: "等待更多跨场景或跨天证据，或由用户确认。", expiresAt: dateDaysFrom(at, settings.observedDays) };
  }

  private promote(state: MemoryCenterState, memory: MemoryItem, actor: Actor, detail: string, at: string): void {
    if (this.isBlocked(state, { topic: memory.topic, type: memory.type, normalizedText: memory.content, memoryId: memory.id })) throw new Error("Promotion is blocked by a Memory Boundary.");
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

  private conflictWith(state: MemoryCenterState, candidate: MemoryItem): MemoryItem | undefined {
    const candidateWords = new Set(words(candidate.content));
    return state.memories.find((memory) => memory.id !== candidate.id && ["long_term", "pinned"].includes(memory.state) && authorityWeight[memory.authority] >= authorityWeight["dream_stable"] && memory.type === candidate.type && words(memory.content).some((word) => candidateWords.has(word)) && /(^|\s)(不|不是|不要|not|never|no)(\s|$)/i.test(`${memory.content} ${candidate.content}`));
  }

  private openInbox(state: MemoryCenterState, memory: MemoryItem, conflicting?: MemoryItem, kind: InboxItem["kind"] = "promotion", detail = "", at = now()): void {
    if (state.inbox.some((item) => item.memoryId === memory.id && item.status === "open" && item.kind === kind)) return;
    const item: InboxItem = { id: id(), kind: conflicting?.state === "pinned" ? "pinned_conflict" : kind, memoryId: memory.id, conflictingMemoryId: conflicting?.id, createdAt: at, status: "open", detail };
    state.inbox.push(item);
    this.timeline(state, memory.id, "inbox_created", "deep_dream", detail, at);
    this.audit(state, "inbox_created", "deep_dream", detail, memory.id, undefined, { inboxId: item.id, conflictingMemoryId: conflicting?.id });
  }

  private applyDecay(state: MemoryCenterState, at: string, actions: string[]): void {
    for (const memory of state.memories) {
      if (memory.state === "pinned" || memory.state === "archived") continue;
      const age = new Date(at).getTime() - new Date(memory.lastReinforcedAt ?? memory.updatedAt).getTime();
      if (memory.state === "recent" && age > state.settings.recentDays * DAY) {
        memory.lifecycle = "expired";
        this.deleteFromState(state, memory, false, "Recent memory expired without sufficient long-term value.", at);
        actions.push(`清理了过期近期记忆“${memory.title}”。`);
      } else if (memory.state === "observed" && memory.observation && memory.observation.expiresAt < at) {
        memory.lifecycle = "expired";
        this.deleteFromState(state, memory, false, "Observed candidate expired without reinforcement.", at);
        actions.push(`清理了过期候选“${memory.title}”。`);
      } else if (memory.state === "long_term" && age > state.settings.archiveDays * DAY && !memory.userConfirmed) {
        this.archiveMemory(state, memory, "deep_dream", "Long-term memory was inactive and not user-confirmed.", at);
        actions.push(`归档了长期未使用记忆“${memory.title}”。`);
      } else if (memory.state === "long_term" && age > state.settings.dormantDays * DAY) {
        memory.lifecycle = "dormant";
      }
    }
  }

  private archiveMemory(state: MemoryCenterState, memory: MemoryItem, actor: Actor, detail: string, at: string): void {
    memory.state = "archived";
    memory.lifecycle = "dormant";
    memory.archivedAt = at;
    memory.updatedAt = at;
    this.timeline(state, memory.id, "archived", actor, detail, at);
    this.audit(state, "memory_archived", actor, `Archived “${memory.title}”.`, memory.id);
  }

  private deleteFromState(state: MemoryCenterState, memory: MemoryItem, _block: boolean, detail: string, at: string): void {
    state.memories = state.memories.filter((item) => item.id !== memory.id);
    state.inbox = state.inbox.filter((item) => item.memoryId !== memory.id && item.conflictingMemoryId !== memory.id);
    this.timeline(state, memory.id, "deleted", "user", detail, at);
    this.audit(state, "memory_deleted", "user", `Deleted “${memory.title}”.`, memory.id);
  }

  private scoreRecall(memory: MemoryItem, query: string): { score: number; reason: string } {
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

  private requireMemory(state: MemoryCenterState, memoryId: string): MemoryItem {
    const memory = state.memories.find((item) => item.id === memoryId);
    if (!memory) throw new Error("Memory not found.");
    return memory;
  }

  private timeline(state: MemoryCenterState, memoryId: string, action: string, actor: Actor, detail: string, at = now()): void {
    const event: TimelineEvent = { id: id(), memoryId, at, action, actor, detail };
    state.timeline.push(event);
  }

  private audit(state: MemoryCenterState, action: string, actor: Actor, detail: string, memoryId?: string, conversationId?: string, metadata?: Record<string, unknown>): void {
    const event: AuditEvent = { id: id(), at: now(), action, actor, memoryId, conversationId, detail, metadata };
    state.audit.push(event);
  }
}

export const createMemoryCenter = (store: JsonMemoryStore, nativeMemory?: NativeMemoryAdapter): MemoryCenter => new MemoryCenter(store, nativeMemory);
