import type {
  MoveCategory,
  TypeName,
  StatusCondition,
  MoveData,
  FieldEffect,
  SecondaryStatusEffect,
  SelfStatChange,
  TargetStatChange,
  WeatherType,
} from './types.js';

export interface MoveConstructorData {
  name: string;
  type: TypeName;
  power?: number;
  accuracy?: number;
  pp?: number;
  maxPP?: number;
  category?: MoveCategory;
  status?: StatusCondition | null;
  priority?: number;
  effectChance?: number | null;
  fieldEffect?: FieldEffect | null;
  secondaryEffect?: SecondaryStatusEffect | null;
  selfStatChange?: SelfStatChange[] | null;
  targetStatChange?: TargetStatChange[] | null;
  inflictsSeed?: boolean;
  weatherHeal?: boolean;
  weather?: WeatherType | null;
  multiHit?: boolean;
  maxHits?: number;
  multiHitPowers?: number[];
  pivot?: boolean;
  crashDamage?: boolean;
  contact?: boolean;
  restoresShieldForm?: boolean;
  inflictsSpikes?: boolean;
}

export class Move implements MoveData {
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
  fieldEffect: FieldEffect | null;
  secondaryEffect: SecondaryStatusEffect | null;
  selfStatChange: SelfStatChange[] | null;
  targetStatChange: TargetStatChange[] | null;
  inflictsSeed: boolean;
  weatherHeal: boolean;
  weather: WeatherType | null;
  multiHit: boolean;
  maxHits?: number;
  multiHitPowers?: number[];
  pivot: boolean;
  crashDamage: boolean;
  contact: boolean;
  restoresShieldForm: boolean;
  inflictsSpikes: boolean;

  constructor(data: MoveConstructorData) {
    this.name = data.name;
    this.type = data.type;
    this.power = data.power ?? 0;
    this.accuracy = data.accuracy ?? 100;
    this.pp = data.pp ?? 10;
    this.maxPP = data.maxPP ?? 10;
    this.category = data.category ?? 'physical';
    this.status = data.status ?? null;
    this.priority = data.priority ?? 0;
    this.effectChance = data.effectChance ?? null;
    this.fieldEffect = data.fieldEffect ?? null;
    this.secondaryEffect = data.secondaryEffect ?? null;
    this.selfStatChange = data.selfStatChange ?? null;
    this.targetStatChange = data.targetStatChange ?? null;
    this.inflictsSeed = data.inflictsSeed ?? false;
    this.weatherHeal = data.weatherHeal ?? false;
    this.weather = data.weather ?? null;
    this.multiHit = data.multiHit ?? false;
    this.maxHits = data.maxHits;
    this.multiHitPowers = data.multiHitPowers;
    this.pivot = data.pivot ?? false;
    this.crashDamage = data.crashDamage ?? false;
    this.contact = data.contact ?? false;
    this.restoresShieldForm = data.restoresShieldForm ?? false;
    this.inflictsSpikes = data.inflictsSpikes ?? false;
  }
}
