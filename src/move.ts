import type {
  MoveCategory,
  TypeName,
  StatusCondition,
  MoveData,
  FieldEffect,
  SecondaryStatusEffect,
  SelfStatChange,
  TargetStatChange,
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
  multiHit?: boolean;
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
  multiHit: boolean;

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
    this.multiHit = data.multiHit ?? false;
  }
}
