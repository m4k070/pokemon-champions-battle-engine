import type { BattleEventName, EventData, EventHandler } from './types.js';
export declare class EventEmitter {
    private handlers;
    private handlerCount;
    on(event: BattleEventName | string, handler: EventHandler): void;
    emit(event: BattleEventName | string, data: EventData): unknown[];
    off(event: BattleEventName | string, handler: EventHandler): void;
    getHandlerCount(): number;
    getRegisteredEvents(): string[];
}
//# sourceMappingURL=event-emitter.d.ts.map