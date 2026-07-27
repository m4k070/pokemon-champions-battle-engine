export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type MoveCategory = 'physical' | 'special' | 'status';

export type StatusCondition = 'sleep' | 'poison' | 'burn' | 'paralysis' | 'freeze';

export type WeatherType = 'sand' | 'rain' | 'sun' | 'hail';

export type StatKey = 'HP' | 'ATK' | 'DEF' | 'SPATK' | 'SPDEF' | 'SPEED';

export type BaseStats = Record<StatKey, number>;
export type Stats = Record<StatKey, number>;

export interface MoveData {
  name: string;
  type: TypeName;
  power: number;
  accuracy: number;
  pp: number;
  maxPP: number;
  category: MoveCategory;
  status: StatusCondition | null;
  priority: number;
  effectChance: number | null;
}

export type TypeChart = Record<TypeName, Partial<Record<TypeName, number>>>;

export type BattleEventName =
  | 'switch-in'
  | 'end-turn'
  | 'calculate-attack'
  | 'calculate-defense'
  | 'apply-modifiers'
  | 'apply-damage'
  | 'before-move'
  | 'after-move';

export interface EventData {
  [key: string]: unknown;
}

export type EventHandler = (data: EventData) => void;

export interface MoveAction {
  type: 'move';
  moveIndex: number;
  target: number;
}

export interface SwitchAction {
  type: 'switch';
  pokemonIndex: number;
}

export interface ForfeitAction {
  type: 'forfeit';
}

export type AgentAction = MoveAction | SwitchAction | ForfeitAction;
