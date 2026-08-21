import type { MemoryCenter, RecallResult } from "./memory-center.js";

/**
 * Host-neutral integration boundary. A verified Hermes adapter should bind these
 * methods to the real provider hooks without importing or modifying Hermes core.
 */
export interface HermesProviderHookContract {
  onUserMessage(input: { sessionId: string; messageId?: string; content: string; sessionTitle?: string; at?: string }): Promise<void>;
  beforeAnswer(input: { sessionId: string; prompt: string; limit?: number }): Promise<RecallResult>;
  afterAnswer(input: { recallRecordIds: string[]; usedInContext: boolean }): Promise<void>;
  onSessionEnd(): Promise<void>;
}

export class HermesMemoryProvider implements HermesProviderHookContract {
  constructor(private readonly center: MemoryCenter) {}

  async onUserMessage(input: { sessionId: string; messageId?: string; content: string; sessionTitle?: string; at?: string }): Promise<void> {
    await this.center.capture({ conversationId: input.sessionId, messageId: input.messageId, content: input.content, title: input.sessionTitle, at: input.at });
  }

  async beforeAnswer(input: { sessionId: string; prompt: string; limit?: number }): Promise<RecallResult> {
    return this.center.recall(input.sessionId, input.prompt, input.limit);
  }

  async afterAnswer(input: { recallRecordIds: string[]; usedInContext: boolean }): Promise<void> {
    await this.center.markRecallOutcome(input.recallRecordIds, input.usedInContext);
  }

  async onSessionEnd(): Promise<void> {
    const settings = (await this.center.state()).settings;
    if (settings.automaticDream) await this.center.runDream();
  }
}
