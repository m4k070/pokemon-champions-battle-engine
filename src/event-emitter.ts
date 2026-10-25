import type { BattleEventName, EventData, EventHandler } from './types.js';

export class EventEmitter {
  private handlers: Map<BattleEventName, EventHandler[]> = new Map();
  private handlerCount = 0;

  on(event: BattleEventName, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    this.handlerCount++;
  }

  emit(event: BattleEventName, data: EventData): unknown[] {
    if (this.handlers.has(event)) {
      const results: unknown[] = [];
      for (const handler of this.handlers.get(event)!) {
        results.push(handler(data));
      }
      return results;
    }
    return [];
  }

  off(event: BattleEventName, handler: EventHandler): void {
    if (this.handlers.has(event)) {
      const handlers = this.handlers.get(event)!;
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        this.handlerCount--;
      }
    }
  }

  getHandlerCount(): number {
    return this.handlerCount;
  }

  getRegisteredEvents(): string[] {
    return Array.from(this.handlers.keys());
  }
}
