export interface SideHazards {
    playerA: number;
    playerB: number;
}
export interface SideFlags {
    playerA: boolean;
    playerB: boolean;
}
export declare class BattleField {
    stealthRock: SideFlags;
    spikes: SideHazards;
    toxicSpikes: SideHazards;
    stickyWeb: SideFlags;
    auroraVeil: SideHazards;
    reflect: SideHazards;
    lightScreen: SideHazards;
    tailwind: SideHazards;
    constructor();
}
//# sourceMappingURL=battle-field.d.ts.map