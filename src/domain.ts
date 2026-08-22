export const SCHEMA_VERSION = 3;

export type MemoryState = "recent" | "observed" | "long_term" | "pinned" | "archived";
export type LifecycleState = "active" | "stable" | "dormant" | "expired";
export type Authority = "inferred" | "observed" | "dream_stable" | "user_confirmed" | "user_locked";
export type MemoryType =
  | "fact"
  | "preference"
  | "goal"
  | "project"
  | "habit"
  | "person"
  | "place"
  | "event"
  | "learning"
  | "collaboration"
  | "other";
export type Actor = "user" | "capture" | "light_dream" | "rem_dream" | "deep_dream" | "system";
export type DreamStage = "light" | "rem" | "deep";
export type DreamTrigger = "manual" | "session_end" | "scheduled" | "startup_catchup";
export type InboxKind = "promotion" | "conflict" | "pinned_conflict";
export type BoundaryScope = "memory" | "topic" | "type" | "rule";
export type RecallContextStatus = "selected" | "injected" | "not_injected" | "unknown";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "function";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  messages: ConversationMessage[];
}

export interface MemoryTrace {
  id: string;
  conversationId: string;
  messageId: string;
  excerpt: string;
  normalizedText: string;
  topic: string;
  type: MemoryType;
  explicit: boolean;
  createdAt: string;
}

export interface Evidence {
  traceId: string;
  conversationId: string;
  messageId: string;
  excerpt: string;
  observedAt: string;
}

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  type: MemoryType;
  state: MemoryState;
  lifecycle: LifecycleState;
  authority: Authority;
  createdAt: string;
  updatedAt: string;
  firstDiscoveredAt: string;
  lastReinforcedAt?: string;
  lastConfirmedAt?: string;
  lastRecalledAt?: string;
  recalledCount: number;
  userConfirmed: boolean;
  pinned: boolean;
  topic: string;
  evidence: Evidence[];
  relatedTraceIds: string[];
  relatedConversationIds: string[];
  createdBy: Actor;
  observation?: {
    reason: string;
    appearances: number;
    distinctDays: number;
    nextStep: string;
    expiresAt: string;
  };
  archivedAt?: string;
  /** State to restore after an explicit archive; absent only for legacy data. */
  archivedFromState?: Exclude<MemoryState, "archived">;
  /** Evidence count that the user has already resolved for a conflicting memory. */
  resolvedConflictEvidence?: Record<string, number>;
}

export interface TimelineEvent {
  id: string;
  memoryId: string;
  at: string;
  action: string;
  actor: Actor;
  detail: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  actor: Actor;
  memoryId?: string;
  conversationId?: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface RecallRecord {
  id: string;
  at: string;
  conversationId: string;
  query: string;
  memoryId: string;
  memoryState: MemoryState;
  score: number;
  reason: string;
  /** Selected means recall found it; injected is only recorded when the host confirms injection. */
  contextStatus: RecallContextStatus;
}

export interface InboxItem {
  id: string;
  kind: InboxKind;
  memoryId: string;
  conflictingMemoryId?: string;
  createdAt: string;
  status: "open" | "resolved";
  detail: string;
}

export interface Boundary {
  id: string;
  scope: BoundaryScope;
  value: string;
  createdAt: string;
  createdBy: "user";
  reason?: string;
}

export interface DreamEntry {
  stage: DreamStage;
  at: string;
  summary: string;
  actions: string[];
  status: "completed" | "partial" | "failed";
}

export interface DreamRun {
  id: string;
  /** Why this run started; shown verbatim in the Dream Diary. */
  trigger: DreamTrigger;
  startedAt: string;
  completedAt?: string;
  status: "completed" | "partial" | "failed";
  entries: DreamEntry[];
}

export interface NativeMemoryVersion {
  id: string;
  target: "user" | "memory";
  at: string;
  action: "write" | "restore" | "copy";
  previousContent: string;
  nextContent: string;
  actor: "user";
  sourceMemoryId?: string;
}

export interface Settings {
  memoryStyle: "conservative" | "balanced" | "active";
  automaticDream: boolean;
  autoPromoteObserved: boolean;
  observedDays: number;
  recentDays: number;
  dormantDays: number;
  archiveDays: number;
  recallLimit: number;
}

export interface MemoryCenterState {
  schemaVersion: number;
  conversations: Conversation[];
  traces: MemoryTrace[];
  memories: MemoryItem[];
  timeline: TimelineEvent[];
  audit: AuditEvent[];
  recalls: RecallRecord[];
  inbox: InboxItem[];
  boundaries: Boundary[];
  dreams: DreamRun[];
  nativeMemoryHistory: NativeMemoryVersion[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  memoryStyle: "balanced",
  automaticDream: true,
  autoPromoteObserved: false,
  observedDays: 30,
  recentDays: 14,
  dormantDays: 90,
  archiveDays: 180,
  recallLimit: 6,
};

export const emptyState = (): MemoryCenterState => ({
  schemaVersion: SCHEMA_VERSION,
  conversations: [],
  traces: [],
  memories: [],
  timeline: [],
  audit: [],
  recalls: [],
  inbox: [],
  boundaries: [],
  dreams: [],
  nativeMemoryHistory: [],
  settings: { ...DEFAULT_SETTINGS },
});
