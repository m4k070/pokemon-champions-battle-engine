import type { WeatherType } from './types.js';
export declare class BattleState {
    turn: number;
    weather: WeatherType | null;
    weatherTurnsLeft: number;
    trickRoom: boolean;
    trickRoomTurnsLeft: number;
    log: string[];
    forceEnd: boolean;
    constructor();
}
//# sourceMappingURL=battle-state.d.ts.map