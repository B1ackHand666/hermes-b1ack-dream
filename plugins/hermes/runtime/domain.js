export const SCHEMA_VERSION = 3;
export const DEFAULT_SETTINGS = {
    memoryStyle: "balanced",
    automaticDream: true,
    autoPromoteObserved: false,
    observedDays: 30,
    recentDays: 14,
    dormantDays: 90,
    archiveDays: 180,
    recallLimit: 6,
};
export const emptyState = () => ({
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
