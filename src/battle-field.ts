import type { WeatherType } from './types.js';

export interface SideHazards {
  playerA: number;
  playerB: number;
}

export interface SideFlags {
  playerA: boolean;
  playerB: boolean;
}

export class BattleField {
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  stealthRock: SideFlags;
  spikes: SideHazards;
  toxicSpikes: SideHazards;
  stickyWeb: SideFlags;
  auroraVeil: SideHazards;
  reflect: SideHazards;
  lightScreen: SideHazards;
  tailwind: SideHazards;

  constructor() {
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.stealthRock = { playerA: false, playerB: false };
    this.spikes = { playerA: 0, playerB: 0 };
    this.toxicSpikes = { playerA: 0, playerB: 0 };
    this.stickyWeb = { playerA: false, playerB: false };
    this.auroraVeil = { playerA: 0, playerB: 0 };
    this.reflect = { playerA: 0, playerB: 0 };
    this.lightScreen = { playerA: 0, playerB: 0 };
    this.tailwind = { playerA: 0, playerB: 0 };
  }
}
