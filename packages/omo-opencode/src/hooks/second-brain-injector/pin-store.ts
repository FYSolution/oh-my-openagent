/**
 * Tracks which Second_Brain wiki targets were injected into each live session,
 * so the compaction injector can re-emit them after context is compacted.
 * A process-level singleton shared between the chat.message injector (writer)
 * and the compaction injector (reader), mirroring the contextCollector pattern.
 */
export class SecondBrainPinStore {
  private readonly pins = new Map<string, Set<string>>();

  record(sessionID: string, target: string): void {
    if (!sessionID || !target) return;
    const existing = this.pins.get(sessionID) ?? new Set<string>();
    existing.add(target);
    this.pins.set(sessionID, existing);
  }

  list(sessionID: string): string[] {
    return [...(this.pins.get(sessionID) ?? [])];
  }

  clear(sessionID: string): void {
    this.pins.delete(sessionID);
  }
}

export const secondBrainPinStore = new SecondBrainPinStore();
