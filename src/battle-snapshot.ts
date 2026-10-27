import { BattleEngine } from './battle-engine.js';
import type { MoveLogEntry } from './battle-engine.js';
import { SeededRandom } from './rng.js';
import { Pokemon } from './pokemon.js';
import type { BattleField, SideFlags, SideHazards } from './battle-field.js';
import type { AgentAction, BaseStats, FormDefinition, FormName, MoveData, Stats, StatStages, TypeName, WeatherType } from './types.js';
import type { NatureInput, StatPointsInput } from './rules/stat-point-system.js';
import { cloneStatusState } from './status-state.js';
import type { StatusState } from './status-state.js';
import type { AbilityName } from './ability-names.js';
import type { ItemName } from './item-names.js';

// Pokemon/BattleEngine/BattleFieldはミュータブルなクラス＋イベントハンドラ(関数)を持つため
// structuredCloneでそのまま複製できない。盤面の「値」だけを抜き出したプレーンデータに変換し、
// そこから作り直す（再構築する）ことでundo/redo/forkを可能にする。
export interface PokemonSnapshot {
  name: string;
  baseName: string;
  types: TypeName[];
  ability: AbilityName;
  item: ItemName | null;
  itemUsed: boolean;
  abilityRevealed?: boolean;
  lockedMove: number | null;
  baseStats: BaseStats;
  // メガシンカ時の実数値再計算に必要なため、statsとは別に配分の由来も保存する。
  statPoints: StatPointsInput;
  nature: NatureInput;
  stats: Stats;
  moves: MoveData[];
  currentHP: number;
  statusState: StatusState;
  isMega: boolean;
  statStages: StatStages;
  isSeeded: boolean;
  // ちょうはつ・フォルムは揮発状態だが、複製した対戦を正しく再開するために保存する
  // （fork/undo と、見せ合いからの分岐で必要になる）。
  tauntTurnsLeft: number;
  // 揮発状態。fork/undo と見せ合いからの分岐で失われないように保存する。
  substituteHP: number;
  disguiseBroken: boolean;
  protecting: boolean;
  protectStreak: number;
  intendsToAttackThisTurn: boolean;
  forcedOut: boolean;
  // 体重はデータ由来だが、復元時にくさむすび等の威力が変わらないよう保存する。
  weightKg: number;
  form: FormName;
  formStats: Record<string, FormDefinition> | null;
  level: number;
  // あくびの眠気・アンコール・最後に使った技。無い古いスナップショットは「なし」として復元する。
  drowsyUntilTurn?: number | null;
  encoredMoveIndex?: number | null;
  encoredUntilTurn?: number | null;
  lastMoveName?: string | null;
  hasAppeared?: boolean;
}

export interface FieldSnapshot {
  stealthRock: SideFlags;
  stickyWeb: SideFlags;
  healingWish: SideFlags;
  spikes: SideHazards;
  toxicSpikes: SideHazards;
  auroraVeil: SideHazards;
  wish: SideHazards;
  reflect: SideHazards;
  lightScreen: SideHazards;
  tailwind: SideHazards;
  // フィールド（グラスフィールド等）。無い古いスナップショットは「なし」として復元する。
  terrain?: BattleField['terrain'];
  terrainTurnsLeft?: number;
}

// ターンの技フェーズの進行状態。pivot技で「交代先の入力待ち」に入ったとき、
// 中断地点から再開できるようにするために保持する。
interface PendingTurnBase {
  actionA: AgentAction;
  actionB: AgentAction;
  // まだ技を出していない側（すばやさ順）。
  remainingSides: (0 | 1)[];
}

// 技フェーズは「解決を進められる」状態と「入力待ちで進めてはいけない」状態のどちらかにある。
// 待っている側は入力待ちのときにだけ存在するため、phase ごとに持たせて
// 「待っていないのに待機側がいる」といった組み合わせを型として作れなくする。
export type PendingTurn =
  // 残りの技を順に解決できる。
  | (PendingTurnBase & { phase: 'resolving-moves' })
  // pivot技を使った側の交代先入力を待っている。入力が来るまで技を進めない。
  | (PendingTurnBase & { phase: 'awaiting-pivot-switch'; pivotSide: 0 | 1 });

// BattleSessionが持つターン進行状態。盤面（BattleEngine/Pokemon）とは別に保存しないと、
// ターン途中でsnapshot/restore/forkしたときに進行状態が失われる。
// 不完全情報で「相手から見えた情報」（BattleSession の knownMoves 等）。Pokemon の参照ではなく、
// 見られた側のチームの添字で持つ（復元すると Pokemon の実体が作り直されるため）。
export interface KnownInfoSnapshot {
  moves: { index: number; moveIndices: number[] }[];
  items: number[];
  abilities: number[];
}

export interface SessionSnapshot {
  turnBegun: boolean;
  pendingTurn: PendingTurn | null;
  // 無い古いスナップショットは「メガシンカ未使用・何も見えていない」として復元する。
  megaUsed?: [boolean, boolean];
  // [side 0 から見た side 1 の情報, side 1 から見た side 0 の情報]
  known?: [KnownInfoSnapshot, KnownInfoSnapshot];
  // 観察したダメージ（無い古いスナップショットは空）。
  observedDamage?: ObservedDamage[];
}

// 技のダメージのうち、対戦している両者に見えたもの（HP の減った割合・急所・相性の区分）。
// 相手の能力値を逆算する（前に当てたときの減り方から次を見積もる）のに使う。添字はそれぞれのチームの添字。
export interface ObservedDamage {
  turn: number;
  attackerSide: 0 | 1;
  attackerIndex: number;
  defenderIndex: number;
  move: string;
  // 技のタイプ・分類・威力（技データの値。特性によるタイプ変化などは effectiveness にだけ表れる）。
  moveType: string;
  category: 'physical' | 'special';
  power: number;
  // タイプ相性の倍率（4・2・1・0.5・0.25。0 はダメージが無いので記録しない）。
  effectiveness: number;
  // 受ける前の HP の割合と、減った割合（どちらも最大 HP に対する割合）。
  hpBefore: number;
  fraction: number;
  critical: boolean;
  // 倒した（減った割合は下限でしかない）。
  knockedOut: boolean;
  // 撃ったときの攻撃側の攻撃（特攻）ランクと、受けた側の防御（特防）ランク。逆算のときにランクの分を割り引く。
  attackStage?: number;
  defenseStage?: number;
}

export interface BattleSnapshot {
  turn: number;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  // 乱数の内部状態。null は再現不能な供給源（システム乱数）を表す。
  // この項目が無い古いスナップショットは、システム乱数として復元する。
  rng?: number | null;
  log: string[];
  // 技の使用履歴（無い古いスナップショットは空）。
  moveLog?: MoveLogEntry[];
  field: FieldSnapshot;
  teamA: PokemonSnapshot[];
  teamB: PokemonSnapshot[];
  activeIndexA: number;
  activeIndexB: number;
  // snapshotBattle()は盤面だけを扱うため、ここはBattleSession.snapshot()が付与する。
  // 省略されている場合は「ターン境界の状態」として復元される。
  session?: SessionSnapshot;
}

// フォルム定義はネストした種族値を持つため、参照を共有しないよう作り直す。
// 古いスナップショット（この項目が無い）は null として扱う。
function cloneFormStats(
  formStats: Record<string, FormDefinition> | null | undefined
): Record<string, FormDefinition> | null {
  if (formStats === null || formStats === undefined) return null;
  return Object.fromEntries(
    Object.entries(formStats).map(([name, definition]) => [name, { baseStats: { ...definition.baseStats } }])
  );
}

export function snapshotPokemon(pokemon: Pokemon): PokemonSnapshot {
  return {
    name: pokemon.name,
    baseName: pokemon.baseName,
    types: [...pokemon.types],
    ability: pokemon.ability,
    item: pokemon.item,
    itemUsed: pokemon.itemUsed,
    abilityRevealed: pokemon.abilityRevealed,
    lockedMove: pokemon.lockedMove,
    baseStats: { ...pokemon.baseStats },
    statPoints: { ...pokemon.statPoints },
    nature: typeof pokemon.nature === 'object' && pokemon.nature !== null
      ? { ...pokemon.nature }
      : pokemon.nature,
    stats: { ...pokemon.stats },
    moves: pokemon.moves.map((move) => ({ ...move })),
    currentHP: pokemon.currentHP,
    statusState: cloneStatusState(pokemon.statusState),
    isMega: pokemon.isMega,
    statStages: { ...pokemon.statStages },
    isSeeded: pokemon.isSeeded,
    tauntTurnsLeft: pokemon.tauntTurnsLeft,
    substituteHP: pokemon.substituteHP,
    disguiseBroken: pokemon.disguiseBroken,
    protecting: pokemon.protecting,
    protectStreak: pokemon.protectStreak,
    intendsToAttackThisTurn: pokemon.intendsToAttackThisTurn,
    forcedOut: pokemon.forcedOut,
    weightKg: pokemon.weightKg,
    form: pokemon.form,
    formStats: cloneFormStats(pokemon.formStats),
    level: pokemon.level,
    drowsyUntilTurn: pokemon.drowsyUntilTurn,
    encoredMoveIndex: pokemon.encoredMoveIndex,
    encoredUntilTurn: pokemon.encoredUntilTurn,
    lastMoveName: pokemon.lastMoveName,
    hasAppeared: pokemon.hasAppeared,
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
    abilityRevealed: snapshot.abilityRevealed ?? false,
    lockedMove: snapshot.lockedMove,
    baseStats: { ...snapshot.baseStats },
    statPoints: { ...snapshot.statPoints },
    nature: typeof snapshot.nature === 'object' && snapshot.nature !== null
      ? { ...snapshot.nature }
      : snapshot.nature,
    stats: { ...snapshot.stats },
    moves: snapshot.moves.map((move) => ({ ...move })),
    currentHP: snapshot.currentHP,
    statusState: cloneStatusState(snapshot.statusState),
    isMega: snapshot.isMega,
    statStages: { ...snapshot.statStages },
    isSeeded: snapshot.isSeeded,
    tauntTurnsLeft: snapshot.tauntTurnsLeft,
    substituteHP: snapshot.substituteHP,
    disguiseBroken: snapshot.disguiseBroken,
    protecting: snapshot.protecting,
    protectStreak: snapshot.protectStreak,
    intendsToAttackThisTurn: snapshot.intendsToAttackThisTurn,
    forcedOut: snapshot.forcedOut,
    weightKg: snapshot.weightKg,
    form: snapshot.form,
    // コンストラクタ側の約束は undefined = フォルム定義なし（内部で null に正規化される）。
    formStats: cloneFormStats(snapshot.formStats) ?? undefined,
    level: snapshot.level,
    drowsyUntilTurn: snapshot.drowsyUntilTurn ?? null,
    encoredMoveIndex: snapshot.encoredMoveIndex ?? null,
    encoredUntilTurn: snapshot.encoredUntilTurn ?? null,
    lastMoveName: snapshot.lastMoveName ?? null,
    hasAppeared: snapshot.hasAppeared ?? false,
  });
}

function snapshotField(field: BattleField): FieldSnapshot {
  return {
    stealthRock: { ...field.stealthRock },
    stickyWeb: { ...field.stickyWeb },
    healingWish: { ...field.healingWish },
    spikes: { ...field.spikes },
    toxicSpikes: { ...field.toxicSpikes },
    auroraVeil: { ...field.auroraVeil },
    wish: { ...field.wish },
    reflect: { ...field.reflect },
    lightScreen: { ...field.lightScreen },
    tailwind: { ...field.tailwind },
    terrain: field.terrain,
    terrainTurnsLeft: field.terrainTurnsLeft,
  };
}

function restoreField(field: BattleField, snapshot: FieldSnapshot): void {
  field.stealthRock = { ...snapshot.stealthRock };
  field.stickyWeb = { ...snapshot.stickyWeb };
  field.healingWish = { ...snapshot.healingWish };
  field.spikes = { ...snapshot.spikes };
  field.toxicSpikes = { ...snapshot.toxicSpikes };
  field.auroraVeil = { ...snapshot.auroraVeil };
  field.wish = { ...snapshot.wish };
  field.reflect = { ...snapshot.reflect };
  field.lightScreen = { ...snapshot.lightScreen };
  field.tailwind = { ...snapshot.tailwind };
  field.terrain = snapshot.terrain ?? null;
  field.terrainTurnsLeft = snapshot.terrainTurnsLeft ?? 0;
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
    rng: engine.rng.getState(),
    log: [...engine.log],
    moveLog: structuredClone(engine.moveLog),
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
  // 乱数はスナップショットの状態から再開する（fork/undo の前後で乱数列をつなぐ）。
  // 状態を持たない供給源なら従来どおりシステム乱数を使う。
  const engine = new BattleEngine(
    snapshot.rng === undefined || snapshot.rng === null ? {} : { rng: new SeededRandom(snapshot.rng) }
  );
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
  // 味方の状態を見る特性・技（フラワーヴェール・おはかまいり等）のためのチーム登録も作り直す。
  engine.registerTeams(teamA, teamB);
  engine.moveLog = structuredClone(snapshot.moveLog ?? []);

  return { engine, teamA, teamB, activeA, activeB };
}
