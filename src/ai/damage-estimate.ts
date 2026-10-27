import type { Pokemon } from '../pokemon.js';
import type { MoveData, WeatherType } from '../types.js';
import type { RandomSource } from '../rng.js';
import { BattleEngine } from '../battle-engine.js';
import { restorePokemon, snapshotPokemon } from '../battle-snapshot.js';
import { getAbilityDefinition } from '../rules/abilities/registry.js';
import type { BattleContext } from './battle-agent.js';

// 乱数を引かない期待ダメージ。捨て用のエンジンで、複製した2体に実際に useMove を撃たせ、乱数の値を決め打ちにする
// （威力・タイプ・特性・持ち物・場の補正はエンジンと同じ計算になる）。渡す2体が「見えている値」なら、見えている範囲での見積もりになる
// （相手の能力値を見積もりに置き換えた context.opponent を渡せば、相手の配分を知らない側の見積もり）。
//
// 決め打ちにする乱数:
// - 命中: 技の命中率を 100 にして撃ち、結果に命中率を掛ける（ノーガード・ゆきのふぶきは必中）。
// - 連続技の回数: 2〜5回の表（2・3回 37.5%、4・5回 12.5%）の各回数で撃って重みで平均する。
// - 急所: 当たらない値で撃ち、ヒットごとに 1/24 の確率で 1.5倍になる分を期待値として足す（必ず急所の技はそのまま）。
// - 乱数の揺れ: 下限（0.85）と上限（1.00）で撃って平均する。倒すかどうかが分かれたら16段階すべてで撃ち、KO 率を数える。
// 状態異常（まひ・こおり・ねむり）で動けない確率は見ない（技が出たときのダメージ）。やけどの攻撃半減は入る。

export interface DamageEstimate {
  // 最大 HP に対する減る割合の期待値（残り HP で頭打ち）。
  fraction: number;
  // このまま撃って倒せる確率（命中率込み）。
  koChance: number;
  // タイプ相性の倍率（4・2・1・0.5・0.25・0）。特性によるタイプ変化・無効化も含む実際の値。
  effectiveness: number;
}

export interface DamageEnvironment {
  weather: WeatherType | null;
  terrain: BattleContext['field']['terrain'];
  // 受ける側の壁（ターン数。0 なら無し）。
  reflect: number;
  auroraVeil: number;
  // 攻撃側の味方で倒れている数（おはかまいり）。
  faintedAllies: number;
}

const NO_DAMAGE: DamageEstimate = { fraction: 0, koChance: 0, effectiveness: 0 };
const MULTI_HIT_WEIGHTS = [
  { hits: 2, weight: 0.375, roll: 0.1875 },
  { hits: 3, weight: 0.375, roll: 0.5625 },
  { hits: 4, weight: 0.125, roll: 0.8125 },
  { hits: 5, weight: 0.125, roll: 0.9375 },
];
// 乱数の揺れの段（0.85 + step/100）を出す乱数の値。ふだんは下限と上限だけ、倒すかが分かれたら16段階すべて。
const ALL_ROLL_VALUES = Array.from({ length: 16 }, (_, step) => (step + 0.5) / 16);
const ROLL_VALUES = [ALL_ROLL_VALUES[0], ALL_ROLL_VALUES[15]];
const CRIT_CHANCE = 1 / 24;
const NO_CRIT = 0.5;
// 追加効果などの確率判定は起こさない値（rng * 100 < chance が偽になる）。
const QUIET = 0.999;

// 決め打ちの列を順に返し、尽きたら QUIET を返す乱数。
class ScriptedRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: number[]) {}
  next(): number {
    return this.index < this.values.length ? this.values[this.index++] : QUIET;
  }
  getState(): number | null {
    return null;
  }
  setState(): void {}
}

function clone(pokemon: Pokemon): Pokemon {
  return restorePokemon(structuredClone(snapshotPokemon(pokemon)));
}

function hitChance(attacker: Pokemon, defender: Pokemon, move: MoveData, environment: DamageEnvironment): number {
  if (move.accuracy >= 100 || move.accuracy <= 0) return 1;
  if (getAbilityDefinition(attacker.ability)?.name === 'no-guard' || getAbilityDefinition(defender.ability)?.name === 'no-guard') return 1;
  if (environment.weather === 'snow' && (move.name === 'ふぶき' || move.name === 'blizzard')) return 1;
  return move.accuracy / 100;
}

// 1回撃ったときの、減った HP（実数）と倒したか・相性。
function simulate(
  attacker: Pokemon,
  defender: Pokemon,
  move: MoveData,
  environment: DamageEnvironment,
  rolls: number[],
): { lost: number; fainted: boolean; effectiveness: number } {
  const a = clone(attacker);
  const d = clone(defender);
  // 技が出たときのダメージを測る: 行動不能の状態異常・ひるみ・アンコール・まもるは外す。やけどは攻撃に効くので残す。
  if (a.status !== 'burn') a.removeStatus();
  a.encoredMoveIndex = null;
  a.encoredUntilTurn = null;
  d.protecting = false;
  d.intendsToAttackThisTurn = true; // ふいうちは「相手が攻撃するなら」の値
  const engine = new BattleEngine({ rng: new ScriptedRandom(rolls) });
  const allies = [a];
  for (let i = 0; i < environment.faintedAllies; i++) {
    const fainted = clone(attacker);
    fainted.currentHP = 0;
    allies.push(fainted);
  }
  engine.registerTeams(allies, [d]);
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, d);
  engine.weather = environment.weather;
  engine.weatherTurnsLeft = environment.weather === null ? 0 : 5;
  engine.field.terrain = environment.terrain;
  engine.field.terrainTurnsLeft = environment.terrain === null ? 0 : 5;
  engine.field.reflect.playerB = environment.reflect;
  engine.field.auroraVeil.playerB = environment.auroraVeil;
  const sure = { ...move, accuracy: 100, pp: Math.max(1, move.pp) };
  const before = d.currentHP;
  const result = engine.useMove(a, d, sure);
  const effectiveness = result.outcome === 'damaged' ? result.effectiveness : 0;
  return { lost: Math.max(0, before - d.currentHP), fainted: d.isFainted, effectiveness };
}

const cache = new Map<string, DamageEstimate>();
const CACHE_LIMIT = 200_000;

function cacheKey(attacker: Pokemon, defender: Pokemon, move: MoveData, environment: DamageEnvironment): string {
  const side = (pokemon: Pokemon) => [
    pokemon.name, pokemon.types.join('/'), pokemon.ability, pokemon.item, pokemon.itemUsed, pokemon.status,
    Object.values(pokemon.stats).join(','), Object.values(pokemon.statStages).join(','),
    pokemon.currentHP, pokemon.maxHP, pokemon.substituteHP, pokemon.flashFireActive, pokemon.charged, pokemon.disguiseBroken, pokemon.weightKg, pokemon.form,
  ].join('|');
  return [side(attacker), side(defender), move.name, move.type, move.category, move.power, move.accuracy,
    environment.weather, environment.terrain, environment.reflect > 0, environment.auroraVeil > 0, environment.faintedAllies].join('#');
}

export function estimateDamage(attacker: Pokemon, defender: Pokemon, move: MoveData, environment: DamageEnvironment): DamageEstimate {
  if (move.category === 'status' || move.pp <= 0 || defender.isFainted || defender.maxHP === 0) return NO_DAMAGE;
  const key = cacheKey(attacker, defender, move, environment);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const counts = move.multiHit
    ? MULTI_HIT_WEIGHTS.filter((entry) => move.maxHits === undefined || entry.hits <= move.maxHits)
    : [{ hits: 1, weight: 1, roll: -1 }];
  const totalWeight = counts.reduce((sum, entry) => sum + entry.weight, 0);
  const perHit = (roll: number) => (move.alwaysCrit ? [roll] : [NO_CRIT, roll]);
  let lost = 0;
  let kos = 0;
  let effectiveness = 0;
  for (const count of counts) {
    // 連続技は回数の乱数を先に引き、ヒットごとに急所・揺れを引く（おやこあいは回数を引かない）。
    const hits = move.multiHit ? count.hits : attacker.ability === 'parental-bond' ? 2 : 1;
    // rolls[j] が j 発目の揺れ（乱数の値）。
    const run = (rolls: number[]) =>
      simulate(attacker, defender, move, environment, [...(move.multiHit ? [count.roll] : []), ...rolls.flatMap(perHit)]);
    // 揺れの下限と上限で撃ち、倒すかどうかが分かれたときだけ16通り撃つ。
    const low = run(Array.from({ length: hits }, () => ROLL_VALUES[0]));
    const high = run(Array.from({ length: hits }, () => ROLL_VALUES[ROLL_VALUES.length - 1]));
    let meanLost = (low.lost + high.lost) / 2;
    let ko = low.fainted ? 1 : high.fainted ? -1 : 0;
    if (ko === -1) {
      // ヒットごとの揺れは独立なので、j 発目は段を (t * (2j+1) + 3j) mod 16 に並べ替える（各発の揺れは16段階を1回ずつ通る）。
      const outcomes = ALL_ROLL_VALUES.map((_, t) => run(Array.from({ length: hits }, (__, j) => ALL_ROLL_VALUES[(t * (2 * j + 1) + 3 * j) % 16])));
      meanLost = outcomes.reduce((sum, outcome) => sum + outcome.lost, 0) / outcomes.length;
      ko = outcomes.filter((outcome) => outcome.fainted).length / outcomes.length;
    }
    // 急所（ヒットごとに 1/24 で 1.5倍）: どれか1発が急所なら、その1発分の半分が上乗せされる。倒しきれる残り HP なら KO 率にも足す。
    if (!move.alwaysCrit && ko < 1) {
      const anyCrit = 1 - (1 - CRIT_CHANCE) ** hits;
      if (meanLost * (1 + 0.5 / hits) >= defender.currentHP) ko += (1 - ko) * anyCrit;
    }
    const weight = count.weight / totalWeight;
    lost += weight * meanLost;
    kos += weight * ko;
    effectiveness = Math.max(effectiveness, low.effectiveness, high.effectiveness);
  }
  const accuracy = hitChance(attacker, defender, move, environment);
  const critBonus = move.alwaysCrit ? 1 : 1 + CRIT_CHANCE * 0.5;
  const estimate: DamageEstimate = {
    fraction: (accuracy * Math.min(defender.currentHP, lost * critBonus)) / defender.maxHP,
    koChance: accuracy * Math.min(1, kos),
    effectiveness,
  };
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, estimate);
  return estimate;
}

// context から、攻撃側から見た環境を作る（壁は session があればエンジンの値、無ければ無し）。
export function damageEnvironment(context: BattleContext, attackerIsSelf: boolean): DamageEnvironment {
  const engine = context.session?.engine;
  const side = context.side ?? 0;
  const defenderSide = attackerIsSelf ? (side === 0 ? 'playerB' : 'playerA') : side === 0 ? 'playerA' : 'playerB';
  const attackerTeam = attackerIsSelf ? context.selfTeam : context.opponentTeam;
  const attacker = attackerIsSelf ? context.self : context.opponent;
  return {
    weather: context.field.weather,
    terrain: context.field.terrain,
    reflect: engine?.field.reflect[defenderSide] ?? 0,
    auroraVeil: engine?.field.auroraVeil[defenderSide] ?? 0,
    faintedAllies: attackerTeam.filter((pokemon) => pokemon !== attacker && pokemon.name !== attacker.name && pokemon.isFainted).length,
  };
}
