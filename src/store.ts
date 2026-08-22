import { mkdir, readFile, rename, writeFile, copyFile, open, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { emptyState, SCHEMA_VERSION, type MemoryCenterState } from "./domain.js";

export class DataCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataCorruptionError";
  }
}

/** Migrate only known historical states; future or malformed schemas fail closed. */
export const migrateState = (raw: unknown): MemoryCenterState => {
  if (!raw || typeof raw !== "object") throw new DataCorruptionError("B1ack Dream data is not an object.");
  const state = raw as Partial<MemoryCenterState> & { schemaVersion?: number; recalls?: Array<Record<string, unknown>>; dreams?: Array<Record<string, unknown>> };
  if (!Array.isArray(state.memories)) throw new DataCorruptionError("B1ack Dream data has no memory collection.");
  const version = state.schemaVersion ?? 1;
  if (version > SCHEMA_VERSION) throw new DataCorruptionError(`B1ack Dream data schema ${version} is newer than this runtime.`);
  if (version < 1) throw new DataCorruptionError(`B1ack Dream data schema ${version} is unsupported.`);
  if (version === 1) {
    // v1 recorded a boolean before the host could prove injection. Preserve
    // the record but fail closed rather than claiming it reached Hermes.
    for (const record of state.recalls ?? []) {
      delete record.includedInContext;
      record.contextStatus = "unknown";
    }
    state.schemaVersion = 2;
  }
  if ((state.schemaVersion ?? version) === 2) {
    // Earlier Diary rows predate the explicit trigger field. They must not be
    // retrospectively claimed as scheduled runs, so legacy rows use manual.
    for (const run of state.dreams ?? []) {
      if (run && typeof run === "object" && (run as { trigger?: unknown }).trigger === undefined) run.trigger = "manual";
    }
    state.schemaVersion = 3;
  }
  return state as MemoryCenterState;
};

/** Atomic JSON state with a small cross-process lock for profile-scoped providers. */
export class JsonMemoryStore {
  private state?: MemoryCenterState;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<MemoryCenterState> {
    // Another Hermes process for the same profile may have just committed.
    this.state = await this.readFromDisk();
    return structuredClone(this.state);
  }

  async transaction<T>(mutate: (state: MemoryCenterState) => T | Promise<T>): Promise<T> {
    let result!: T;
    const work = this.queue.then(async () => {
      await this.withProcessLock(async () => {
        // Reload only after owning the lock to avoid stale read-modify-write.
        this.state = await this.readFromDisk();
        const working = structuredClone(this.state);
        result = await mutate(working);
        await this.writeAtomically(working);
        this.state = working;
      });
    });
    this.queue = work.catch(() => undefined);
    await work;
    return result;
  }

  private async readFromDisk(): Promise<MemoryCenterState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return migrateState(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      if (error instanceof SyntaxError) {
        throw new DataCorruptionError(`Memory Center data at ${this.filePath} is corrupt; it was not overwritten.`);
      }
      throw error;
    }
  }

  private async writeAtomically(next: MemoryCenterState): Promise<void> {
    const folder = dirname(this.filePath);
    await mkdir(folder, { recursive: true });
    const temp = `${this.filePath}.tmp`;
    const backup = `${this.filePath}.bak`;
    try {
      await copyFile(this.filePath, backup);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temp, this.filePath);
  }

  private async withProcessLock<T>(work: () => Promise<T>): Promise<T> {
    const folder = dirname(this.filePath);
    const lockPath = `${this.filePath}.lock`;
    await mkdir(folder, { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      try {
        handle = await open(lockPath, "wx");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const age = Date.now() - (await stat(lockPath)).mtimeMs;
          if (age > 30_000) await unlink(lockPath);
        } catch (lockError) {
          if ((lockError as NodeJS.ErrnoException).code !== "ENOENT") throw lockError;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    if (!handle) throw new Error("Timed out waiting for the B1ack Dream profile data lock.");
    try {
      return await work();
    } finally {
      await handle.close();
      try { await unlink(lockPath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

export const defaultDataPath = (basePath: string): string => join(basePath, "memory-center.json");
