"use strict";
/* Hermes Dashboard Plugin bundle source. React is supplied by the host SDK. */
(() => {
    "use strict";
    const SDK = window.__HERMES_PLUGIN_SDK__;
    const registry = window.__HERMES_PLUGINS__;
    if (!SDK || !registry)
        return;
    const React = SDK.React;
    const { useCallback, useEffect, useMemo, useState } = SDK.hooks;
    const C = SDK.components;
    const base = "/api/plugins/b1ack-dream";
    const h = React.createElement;
    const call = (path, options) => SDK.fetchJSON(`${base}${path}`, options);
    const text = (value) => value === null || value === undefined ? "—" : String(value);
    const time = (value) => typeof value === "string" ? value.replace("T", " ").replace(".000Z", "Z") : "—";
    const actionOptions = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const Pill = ({ children, tone = "default" }) => h(C.Badge, { variant: tone === "danger" ? "destructive" : "secondary" }, children);
    const Section = ({ title, children, action }) => h(C.Card, { className: "mb-4" }, h(C.CardHeader, { className: "flex flex-row items-center justify-between gap-3" }, h(C.CardTitle, { className: "text-base" }, title), action), h(C.CardContent, null, children));
    const Button = ({ children, ...props }) => h(C.Button, props, children);
    function Offline({ status, retry }) {
        const runtime = status?.runtime ?? {};
        return h("div", { className: "mx-auto max-w-2xl p-6" }, h(C.Card, null, h(C.CardHeader, null, h(C.CardTitle, null, "B1ack Dream provider is not currently running.")), h(C.CardContent, { className: "space-y-3 text-sm text-muted-foreground" }, h("p", null, text(runtime.reason ?? "Enable b1ack-dream in hermes memory setup, then start Hermes.")), h("div", { className: "flex flex-wrap gap-2" }, h(Pill, null, status?.installed ? "Installed" : "Not installed"), h(Pill, null, status?.provider_selected === true ? "Selected provider" : status?.provider_selected === false ? "Not selected" : "Selection unknown"), h(Pill, { tone: "danger" }, "Runtime stopped")), h("p", null, "B1ack Dream Memory Center remains completely independent from Hermes USER.md and MEMORY.md. It never synchronizes them automatically."), h(Button, { onClick: retry }, "Refresh status"))));
    }
    function MemoryCard({ memory, selected, onSelect, onAction }) {
        return h("button", { type: "button", onClick: onSelect, className: `w-full rounded-md border p-3 text-left transition hover:bg-accent ${selected ? "border-primary bg-accent" : "border-border"}` }, h("div", { className: "flex flex-wrap items-center gap-2" }, h("strong", { className: "text-sm" }, text(memory.title)), h(Pill, null, text(memory.state)), h(Pill, null, text(memory.authority))), h("p", { className: "mt-2 line-clamp-2 text-sm text-muted-foreground" }, text(memory.content)), memory.state === "observed" ? h("p", { className: "mt-2 text-xs text-amber-600 dark:text-amber-400" }, "观察中 / 尚未确认：", text(memory.observation?.reason)) : null, h("div", { className: "mt-2 flex flex-wrap gap-2", onClick: (event) => event.stopPropagation() }, memory.pinned ? h(Button, { size: "sm", variant: "outline", onClick: () => onAction(`/memories/${memory.id}/unpin`, "POST", {}) }, "Unpin") : h(Button, { size: "sm", variant: "outline", onClick: () => onAction(`/memories/${memory.id}/pin`, "POST", {}) }, "Pin"), memory.state === "archived" ? h(Button, { size: "sm", variant: "outline", onClick: () => onAction(`/memories/${memory.id}/restore`, "POST", {}) }, "Restore") : h(Button, { size: "sm", variant: "outline", onClick: () => onAction(`/memories/${memory.id}/archive`, "POST", {}) }, "Archive")));
    }
    function Page() {
        const [tab, setTab] = useState("overview");
        const [status, setStatus] = useState(null);
        const [data, setData] = useState({});
        const [error, setError] = useState("");
        const [loading, setLoading] = useState(true);
        const [query, setQuery] = useState("");
        const [stateFilter, setStateFilter] = useState("all");
        const [selectedId, setSelectedId] = useState("");
        const [draft, setDraft] = useState(null);
        const [nativeTarget, setNativeTarget] = useState("user");
        const [nativeDraft, setNativeDraft] = useState("");
        const [nativeConfirmed, setNativeConfirmed] = useState(false);
        const refresh = useCallback(async () => {
            setLoading(true);
            setError("");
            try {
                const nextStatus = await call("/status");
                setStatus(nextStatus);
                if (!nextStatus?.runtime?.running)
                    return;
                const archiveParam = stateFilter === "archived" ? "&archived=true" : "";
                const stateParam = stateFilter !== "all" ? `&state=${encodeURIComponent(stateFilter)}` : "";
                const qParam = query ? `&q=${encodeURIComponent(query)}` : "";
                const [dashboard, memories, observed, inbox, dreams, recalls, settings, userNative, memoryNative] = await Promise.all([
                    call("/dashboard"), call(`/memories?x=1${archiveParam}${stateParam}${qParam}`), call("/memories?state=observed"), call("/inbox"), call("/dreams"), call("/recalls"), call("/settings"), call("/native/user"), call("/native/memory"),
                ]);
                setData({ dashboard, memories, observed, inbox, dreams, recalls, settings, native: { user: userNative, memory: memoryNative } });
            }
            catch (cause) {
                setError(cause?.message || "B1ack Dream request failed.");
            }
            finally {
                setLoading(false);
            }
        }, [query, stateFilter]);
        useEffect(() => { void refresh(); }, [refresh]);
        useEffect(() => {
            const timer = window.setInterval(() => { if (status?.runtime?.running)
                void refresh(); }, 15000);
            return () => window.clearInterval(timer);
        }, [refresh, status?.runtime?.running]);
        const mutate = useCallback(async (path, method, body) => {
            setError("");
            try {
                await call(path, actionOptions(method, body));
                await refresh();
            }
            catch (cause) {
                setError(cause?.message || "Operation failed.");
            }
        }, [refresh]);
        const selected = useMemo(() => (data.memories ?? []).find((item) => item.id === selectedId) ?? null, [data.memories, selectedId]);
        useEffect(() => { if (selected)
            setDraft({ title: selected.title, content: selected.content, type: selected.type }); }, [selected]);
        useEffect(() => { const native = data.native?.[nativeTarget]; if (native?.available)
            setNativeDraft(native.content ?? ""); }, [data.native, nativeTarget]);
        if (loading && !status)
            return h("div", { className: "p-6 text-sm text-muted-foreground" }, "Loading B1ack Dream…");
        if (!status?.runtime?.running)
            return h(Offline, { status, retry: () => void refresh() });
        const counts = data.dashboard ?? {};
        const nav = [
            ["overview", "Overview"], ["memories", "Memories"], ["observed", "Observed / Inbox"], ["dream", "Dream"], ["recall", "Recall"], ["settings", "Settings"],
            ...(data.native?.user?.available || data.native?.memory?.available ? [["native", "Hermes Native Memory"]] : []),
        ];
        const overview = h("div", null, h("p", { className: "mb-4 text-sm text-muted-foreground" }, "Transparent B1ack Dream memory. Hermes USER.md and MEMORY.md are always separate and never auto-synchronized."), h("div", { className: "mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" }, ...[["Recent", counts.recent], ["Observed", counts.observed], ["Long-term", counts.longTerm], ["Pinned", counts.pinned], ["Archived", counts.archived], ["Inbox", counts.inbox]].map(([label, value]) => h(C.Card, { key: label }, h(C.CardContent, { className: "p-4" }, h("p", { className: "text-xs text-muted-foreground" }, label), h("p", { className: "text-2xl font-semibold" }, text(value)))))), h(Section, { title: "Latest Dream", action: h(Button, { size: "sm", onClick: () => void mutate("/dream", "POST", {}) }, "Run manual Dream") }, counts.latestDream ? h("div", { className: "text-sm" }, h(Pill, null, text(counts.latestDream.trigger)), " ", text(counts.latestDream.status), " · ", time(counts.latestDream.completedAt ?? counts.latestDream.startedAt)) : h("p", { className: "text-sm text-muted-foreground" }, "No Dream diary entry yet.")), h(Section, { title: "Recent Recall" }, (data.recalls ?? []).slice(0, 5).map((item) => h("p", { key: item.id, className: "border-b py-2 text-sm last:border-0" }, h(Pill, null, text(item.contextStatus)), " ", text(item.reason), " · ", time(item.at)))));
        const memoryPage = h("div", null, h("div", { className: "mb-4 flex flex-wrap gap-2" }, h(C.Input, { value: query, placeholder: "Search memories", onChange: (event) => setQuery(event.target.value), className: "max-w-sm" }), h("select", { value: stateFilter, onChange: (event) => setStateFilter(event.target.value), className: "rounded-md border bg-background px-3 text-sm" }, ...["all", "recent", "observed", "long_term", "pinned", "archived"].map((item) => h("option", { key: item, value: item }, item))), h(Button, { variant: "outline", onClick: () => void refresh() }, "Search")), h("div", { className: "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]" }, h("div", { className: "space-y-2" }, (data.memories ?? []).map((memory) => h(MemoryCard, { key: memory.id, memory, selected: selectedId === memory.id, onSelect: () => setSelectedId(memory.id), onAction: mutate })), !(data.memories ?? []).length ? h("p", { className: "text-sm text-muted-foreground" }, "No matching memories.") : null), h(Section, { title: "Memory detail" }, selected && draft ? h("div", { className: "space-y-3" }, h("p", { className: "text-xs text-muted-foreground" }, `Source: ${text(selected.relatedConversationIds?.[0])} · Evidence: ${selected.evidence?.length ?? 0}`), h(C.Input, { value: draft.title, onChange: (event) => setDraft({ ...draft, title: event.target.value }) }), h("textarea", { value: draft.content, onChange: (event) => setDraft({ ...draft, content: event.target.value }), className: "min-h-28 w-full rounded-md border bg-background p-2 text-sm" }), h("select", { value: draft.type, onChange: (event) => setDraft({ ...draft, type: event.target.value }), className: "rounded-md border bg-background px-3 py-2 text-sm" }, ...["fact", "preference", "goal", "project", "habit", "person", "place", "event", "learning", "collaboration", "other"].map((item) => h("option", { key: item, value: item }, item))), h("div", { className: "flex flex-wrap gap-2" }, h(Button, { onClick: () => void mutate(`/memories/${selected.id}`, "PATCH", draft) }, "Save edit"), h(Button, { variant: "destructive", onClick: () => { if (window.confirm("Delete this B1ack Dream memory? Native copies are not affected."))
                void mutate(`/memories/${selected.id}`, "DELETE", { preventRelearning: false, related: false }); } }, "Delete")), data.native?.user?.available || data.native?.memory?.available ? h("div", { className: "rounded-md border p-3 text-sm" }, h("p", { className: "mb-2 font-medium" }, "Explicit copy to Hermes Native Memory"), h("p", { className: "mb-2 text-xs text-muted-foreground" }, "Previewed content is copied once. The two copies remain independent and never synchronize automatically."), h("select", { value: nativeTarget, onChange: (event) => setNativeTarget(event.target.value), className: "mb-2 rounded-md border bg-background px-3 py-2 text-sm" }, h("option", { value: "user" }, "USER.md"), h("option", { value: "memory" }, "MEMORY.md")), h("label", { className: "mb-2 flex items-center gap-2 text-xs" }, h("input", { type: "checkbox", checked: nativeConfirmed, onChange: (event) => setNativeConfirmed(event.target.checked) }), "I reviewed the target and explicitly confirm this copy."), h(Button, { size: "sm", disabled: !nativeConfirmed, onClick: () => void mutate("/copy-to-native", "POST", { memoryId: selected.id, target: nativeTarget, content: draft.content, confirmed: true }) }, "Copy previewed content")) : null) : h("p", { className: "text-sm text-muted-foreground" }, "Select a memory to inspect or edit it."))));
        const observedPage = h("div", null, h(Section, { title: "Observed candidates" }, (data.observed ?? []).map((memory) => h("div", { key: memory.id, className: "border-b py-3 last:border-0" }, h("strong", null, text(memory.title)), h("p", { className: "my-1 text-sm text-muted-foreground" }, "观察中 / 尚未确认：", text(memory.observation?.reason)), h("div", { className: "flex flex-wrap gap-2" }, ...[["Confirm long-term", "confirm"], ["Continue observing", "continue"], ["Keep recent", "recent"], ["Don't remember", "ignore"]].map(([label, action]) => h(Button, { key: action, size: "sm", variant: "outline", onClick: () => void mutate(`/memories/${memory.id}/observed`, "POST", { action }) }, label)))))), h(Section, { title: "Conflict Inbox" }, (data.inbox ?? []).map((item) => h("div", { key: item.id, className: "border-b py-3 last:border-0" }, h("p", { className: "text-sm" }, text(item.detail)), h("div", { className: "mt-2 flex flex-wrap gap-2" }, ...[["Keep old", "keep_old"], ["Use new", "use_new"], ["Continue", "continue"]].map(([label, action]) => h(Button, { key: action, size: "sm", variant: "outline", onClick: () => void mutate(`/inbox/${item.id}/resolve`, "POST", { action }) }, label)))))));
        const dreamPage = h("div", null, h(Section, { title: "Dream Diary", action: h(Button, { onClick: () => void mutate("/dream", "POST", {}) }, "Run manual Dream") }, (data.dreams ?? []).map((dream) => h("div", { key: dream.id, className: "border-b py-3 last:border-0" }, h("div", { className: "flex gap-2" }, h(Pill, null, text(dream.trigger)), h(Pill, null, text(dream.status))), h("p", { className: "mt-1 text-xs text-muted-foreground" }, time(dream.completedAt ?? dream.startedAt)), ...(dream.entries ?? []).map((entry) => h("p", { key: `${dream.id}-${entry.stage}`, className: "mt-1 text-sm" }, `${text(entry.stage)}: ${text(entry.summary)}`))))));
        const recallPage = h("div", null, h(Section, { title: "Recall Usage History" }, (data.recalls ?? []).map((item) => h("div", { key: item.id, className: "border-b py-3 text-sm last:border-0" }, h(Pill, null, text(item.contextStatus)), " ", h("strong", null, text(item.reason)), h("p", { className: "mt-1 text-xs text-muted-foreground" }, `Query: ${text(item.query)} · ${time(item.at)}`)))));
        const settingsPage = h("div", null, h(Section, { title: "B1ack Dream settings" }, data.settings ? h("div", { className: "space-y-3" }, h("label", { className: "block text-sm" }, "Memory style", h("select", { value: data.settings.memoryStyle, onChange: (event) => setData({ ...data, settings: { ...data.settings, memoryStyle: event.target.value } }), className: "mt-1 block rounded-md border bg-background px-3 py-2" }, ...["conservative", "balanced", "active"].map((item) => h("option", { key: item, value: item }, item)))), h("label", { className: "flex items-center gap-2 text-sm" }, h("input", { type: "checkbox", checked: !!data.settings.automaticDream, onChange: (event) => setData({ ...data, settings: { ...data.settings, automaticDream: event.target.checked } }) }), "Automatic session-end Dream"), h("label", { className: "flex items-center gap-2 text-sm" }, h("input", { type: "checkbox", checked: !!data.settings.autoPromoteObserved, onChange: (event) => setData({ ...data, settings: { ...data.settings, autoPromoteObserved: event.target.checked } }) }), "Auto-promote observed candidates"), h(Button, { onClick: () => void mutate("/settings", "PATCH", data.settings) }, "Save settings")) : null));
        const native = data.native?.[nativeTarget];
        const nativePage = h("div", null, h("p", { className: "mb-4 text-sm text-amber-700 dark:text-amber-300" }, "Hermes Native Memory and B1ack Dream Memory Center are completely independent. Copying creates two independent copies and never enables automatic synchronization."), h(Section, { title: "Hermes Native Memory" }, native?.available ? h("div", { className: "space-y-3" }, h("div", { className: "flex gap-2" }, h(Button, { size: "sm", variant: nativeTarget === "user" ? "default" : "outline", onClick: () => setNativeTarget("user") }, "USER.md"), h(Button, { size: "sm", variant: nativeTarget === "memory" ? "default" : "outline", onClick: () => setNativeTarget("memory") }, "MEMORY.md")), h("textarea", { value: nativeDraft, onChange: (event) => setNativeDraft(event.target.value), className: "min-h-56 w-full rounded-md border bg-background p-2 font-mono text-sm" }), h("label", { className: "flex items-center gap-2 text-sm" }, h("input", { type: "checkbox", checked: nativeConfirmed, onChange: (event) => setNativeConfirmed(event.target.checked) }), "I reviewed the write target and explicitly confirm this native-memory write."), h(Button, { disabled: !nativeConfirmed, onClick: () => void mutate(`/native/${nativeTarget}`, "POST", { content: nativeDraft, confirmed: true }) }, "Write confirmed content"), h("div", { className: "space-y-2 text-sm" }, h("strong", null, "Version history"), ...(native.history ?? []).map((version) => h("div", { key: version.id, className: "flex flex-wrap items-center justify-between gap-2 border-b py-2" }, h("span", null, `${text(version.action)} · ${time(version.at)}`), h(Button, { size: "sm", variant: "outline", disabled: !nativeConfirmed, onClick: () => void mutate(`/native/${nativeTarget}/restore`, "POST", { versionId: version.id, confirmed: true }) }, "Restore confirmed"))))) : h("p", { className: "text-sm text-muted-foreground" }, text(native?.limitation ?? "Native memory editor is disabled in B1ack Dream settings."))));
        const page = tab === "memories" ? memoryPage : tab === "observed" ? observedPage : tab === "dream" ? dreamPage : tab === "recall" ? recallPage : tab === "settings" ? settingsPage : tab === "native" ? nativePage : overview;
        return h("div", { className: "b1ack-dream-dashboard mx-auto max-w-7xl p-4 md:p-6" }, h("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-3" }, h("div", null, h("h1", { className: "text-2xl font-semibold" }, "B1ack Dream"), h("p", { className: "text-sm text-muted-foreground" }, "Transparent, independent long-term memory for Hermes")), h(Pill, null, "Provider running")), h("div", { className: "mb-4 flex flex-wrap gap-2" }, ...nav.map(([id, label]) => h(Button, { key: id, size: "sm", variant: tab === id ? "default" : "outline", onClick: () => setTab(id) }, label))), error ? h("p", { className: "mb-4 rounded-md border border-destructive p-3 text-sm text-destructive" }, error) : null, page);
    }
    registry.register("b1ack-dream", Page);
})();
