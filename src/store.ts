import { mkdir, readFile, rename, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { emptyState, type MemoryCenterState } from "./domain.js";

export class DataCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataCorruptionError";
  }
}

/** A small atomic JSON store. It never replaces a corrupt primary file. */
export class JsonMemoryStore {
  private state?: MemoryCenterState;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<MemoryCenterState> {
    if (!this.state) this.state = await this.readFromDisk();
    return structuredClone(this.state);
  }

  async transaction<T>(mutate: (state: MemoryCenterState) => T | Promise<T>): Promise<T> {
    let result!: T;
    const work = this.queue.then(async () => {
      if (!this.state) this.state = await this.readFromDisk();
      const working = structuredClone(this.state);
      result = await mutate(working);
      await this.writeAtomically(working);
      this.state = working;
    });
    this.queue = work.catch(() => undefined);
    await work;
    return result;
  }

  private async readFromDisk(): Promise<MemoryCenterState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as MemoryCenterState;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.memories)) {
        throw new DataCorruptionError(`Memory Center data at ${this.filePath} is not a valid state file.`);
      }
      return parsed;
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
}

export const defaultDataPath = (basePath: string): string => join(basePath, "memory-center.json");
