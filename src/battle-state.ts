import type { WeatherType } from './types.js';

export class BattleState {
  turn: number;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  log: string[];
  forceEnd: boolean;

  constructor() {
    this.turn = 0;
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.log = [];
    this.forceEnd = false;
  }
}
