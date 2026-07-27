import type { MoveCategory, TypeName, StatusCondition, MoveData } from './types.js';

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
  }
}
