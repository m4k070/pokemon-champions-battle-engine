export type TerrainType = 'electric-terrain' | null;

export interface SideHazards {
  playerA: number;
  playerB: number;
}

export interface SideFlags {
  playerA: boolean;
  playerB: boolean;
}

// 天候・トリックルームはBattleEngine側が単一の情報源として保持する
// （このクラスは設置技など「陣営ごとの」フィールド状態のみを扱う）。
export class BattleField {
  stealthRock: SideFlags;
  spikes: SideHazards;
  toxicSpikes: SideHazards;
  auroraVeil: SideHazards;
  reflect: SideHazards;
  lightScreen: SideHazards;
  tailwind: SideHazards;
  terrain: TerrainType;
  terrainTurnsLeft: number;

  constructor() {
    this.stealthRock = { playerA: false, playerB: false };
    this.spikes = { playerA: 0, playerB: 0 };
    this.toxicSpikes = { playerA: 0, playerB: 0 };
    this.auroraVeil = { playerA: 0, playerB: 0 };
    this.reflect = { playerA: 0, playerB: 0 };
    this.lightScreen = { playerA: 0, playerB: 0 };
    this.tailwind = { playerA: 0, playerB: 0 };
    this.terrain = null;
    this.terrainTurnsLeft = 0;
  }

  // --- Hazard set helpers ---
  // BattleEngine から呼ばれる。重複チェック・上限チェックはここで行う。

  /** ステルスロック: 既にあれば何もしない（重複不可）。 */
  setStealthRock(side: 'playerA' | 'playerB'): boolean {
    if (this.stealthRock[side]) return false;
    this.stealthRock[side] = true;
    return true;
  }

  /** まきびし: 最大3層まで重ねられる。既に3層なら何もしない。 */
  addSpikes(side: 'playerA' | 'playerB'): boolean {
    if (this.spikes[side] >= 3) return false;
    this.spikes[side]++;
    return true;
  }

  /** どくびし: 最大2層まで重ねられる。既に2層なら何もしない。 */
  addToxicSpikes(side: 'playerA' | 'playerB'): boolean {
    if (this.toxicSpikes[side] >= 2) return false;
    this.toxicSpikes[side]++;
    return true;
  }
}
