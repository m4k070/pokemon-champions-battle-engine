import { BattleEngine } from './battle-engine.js';
import { Pokemon } from './pokemon.js';
import type { BattleField, SideFlags, SideHazards } from './battle-field.js';
import type { AgentAction, BaseStats, MoveData, Stats, StatStages, StatusCondition, TypeName, WeatherType } from './types.js';
import type { NatureInput, StatPointsInput } from './rules/stat-point-system.js';

// Pokemon/BattleEngine/BattleFieldはミュータブルなクラス＋イベントハンドラ(関数)を持つため
// structuredCloneでそのまま複製できない。盤面の「値」だけを抜き出したプレーンデータに変換し、
// そこから作り直す（再構築する）ことでundo/redo/forkを可能にする。
export interface PokemonSnapshot {
  name: string;
  baseName: string;
  types: TypeName[];
  ability: string;
  item: string | null;
  itemUsed: boolean;
  lockedMove: number | null;
  baseStats: BaseStats;
  // メガシンカ時の実数値再計算に必要なため、statsとは別に配分の由来も保存する。
  statPoints: StatPointsInput;
  nature: NatureInput;
  stats: Stats;
  moves: MoveData[];
  currentHP: number;
  status: StatusCondition | null;
  statusTurnsLeft: number;
  isMega: boolean;
  statStages: StatStages;
  toxicCounter: number;
  isSeeded: boolean;
}

export interface FieldSnapshot {
  stealthRock: SideFlags;
  spikes: SideHazards;
  toxicSpikes: SideHazards;
  auroraVeil: SideHazards;
  reflect: SideHazards;
  lightScreen: SideHazards;
  tailwind: SideHazards;
}

// ターンの技フェーズの進行状態。pivot技で「交代先の入力待ち」に入ったとき、
// 中断地点から再開できるようにするために保持する。
export interface PendingTurn {
  actionA: AgentAction;
  actionB: AgentAction;
  remainingSides: (0 | 1)[]; // まだ技を出していない側（すばやさ順）
  awaitingPivotSide: 0 | 1 | null; // pivot技の交代先の入力を待っている側
}

// BattleSessionが持つターン進行状態。盤面（BattleEngine/Pokemon）とは別に保存しないと、
// ターン途中でsnapshot/restore/forkしたときに進行状態が失われる。
export interface SessionSnapshot {
  turnBegun: boolean;
  pendingTurn: PendingTurn | null;
}

export interface BattleSnapshot {
  turn: number;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  log: string[];
  field: FieldSnapshot;
  teamA: PokemonSnapshot[];
  teamB: PokemonSnapshot[];
  activeIndexA: number;
  activeIndexB: number;
  // snapshotBattle()は盤面だけを扱うため、ここはBattleSession.snapshot()が付与する。
  // 省略されている場合は「ターン境界の状態」として復元される。
  session?: SessionSnapshot;
}

export function snapshotPokemon(pokemon: Pokemon): PokemonSnapshot {
  return {
    name: pokemon.name,
    baseName: pokemon.baseName,
    types: [...pokemon.types],
    ability: pokemon.ability,
    item: pokemon.item,
    itemUsed: pokemon.itemUsed,
    lockedMove: pokemon.lockedMove,
    baseStats: { ...pokemon.baseStats },
    statPoints: { ...pokemon.statPoints },
    nature: typeof pokemon.nature === 'object' && pokemon.nature !== null
      ? { ...pokemon.nature }
      : pokemon.nature,
    stats: { ...pokemon.stats },
    moves: pokemon.moves.map((move) => ({ ...move })),
    currentHP: pokemon.currentHP,
    status: pokemon.status,
    statusTurnsLeft: pokemon.statusTurnsLeft,
    isMega: pokemon.isMega,
    statStages: { ...pokemon.statStages },
    toxicCounter: pokemon.toxicCounter,
    isSeeded: pokemon.isSeeded,
  };
}

export function restorePokemon(snapshot: PokemonSnapshot): Pokemon {
  return new Pokemon({
    name: snapshot.name,
    baseName: snapshot.baseName,
    types: [...snapshot.types],
    ability: snapshot.ability,
    item: snapshot.item,
    itemUsed: snapshot.itemUsed,
    lockedMove: snapshot.lockedMove,
    baseStats: { ...snapshot.baseStats },
    statPoints: { ...snapshot.statPoints },
    nature: typeof snapshot.nature === 'object' && snapshot.nature !== null
      ? { ...snapshot.nature }
      : snapshot.nature,
    stats: { ...snapshot.stats },
    moves: snapshot.moves.map((move) => ({ ...move })),
    currentHP: snapshot.currentHP,
    status: snapshot.status,
    statusTurnsLeft: snapshot.statusTurnsLeft,
    isMega: snapshot.isMega,
    statStages: { ...snapshot.statStages },
    toxicCounter: snapshot.toxicCounter,
    isSeeded: snapshot.isSeeded,
  });
}

function snapshotField(field: BattleField): FieldSnapshot {
  return {
    stealthRock: { ...field.stealthRock },
    spikes: { ...field.spikes },
    toxicSpikes: { ...field.toxicSpikes },
    auroraVeil: { ...field.auroraVeil },
    reflect: { ...field.reflect },
    lightScreen: { ...field.lightScreen },
    tailwind: { ...field.tailwind },
  };
}

function restoreField(field: BattleField, snapshot: FieldSnapshot): void {
  field.stealthRock = { ...snapshot.stealthRock };
  field.spikes = { ...snapshot.spikes };
  field.toxicSpikes = { ...snapshot.toxicSpikes };
  field.auroraVeil = { ...snapshot.auroraVeil };
  field.reflect = { ...snapshot.reflect };
  field.lightScreen = { ...snapshot.lightScreen };
  field.tailwind = { ...snapshot.tailwind };
}

export function snapshotBattle(
  engine: BattleEngine,
  teamA: Pokemon[],
  teamB: Pokemon[],
  activeA: Pokemon,
  activeB: Pokemon
): BattleSnapshot {
  return {
    turn: engine.turn,
    weather: engine.weather,
    weatherTurnsLeft: engine.weatherTurnsLeft,
    trickRoom: engine.trickRoom,
    trickRoomTurnsLeft: engine.trickRoomTurnsLeft,
    log: [...engine.log],
    field: snapshotField(engine.field),
    teamA: teamA.map(snapshotPokemon),
    teamB: teamB.map(snapshotPokemon),
    activeIndexA: teamA.indexOf(activeA),
    activeIndexB: teamB.indexOf(activeB),
  };
}

export interface RestoredBattle {
  engine: BattleEngine;
  teamA: Pokemon[];
  teamB: Pokemon[];
  activeA: Pokemon;
  activeB: Pokemon;
}

export function restoreBattle(snapshot: BattleSnapshot): RestoredBattle {
  const engine = new BattleEngine();
  engine.turn = snapshot.turn;
  engine.weather = snapshot.weather;
  engine.weatherTurnsLeft = snapshot.weatherTurnsLeft;
  engine.trickRoom = snapshot.trickRoom;
  engine.trickRoomTurnsLeft = snapshot.trickRoomTurnsLeft;
  engine.log = [...snapshot.log];
  restoreField(engine.field, snapshot.field);

  const teamA = snapshot.teamA.map(restorePokemon);
  const teamB = snapshot.teamB.map(restorePokemon);
  const activeA = teamA[snapshot.activeIndexA];
  const activeB = teamB[snapshot.activeIndexB];

  engine.setActivePokemon(0, activeA);
  engine.setActivePokemon(1, activeB);

  return { engine, teamA, teamB, activeA, activeB };
}
