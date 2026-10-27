import type { Pokemon } from '../pokemon.js';
import { shallowClonePokemon } from '../pokemon.js';
import type { MoveData, StatStageKey } from '../types.js';
import type { ObservedDamage } from '../battle-snapshot.js';
import { createMove } from '../move.js';
import type { BattleContext } from './battle-agent.js';
import { compatibleSets, defaultBelief } from './opponent-belief.js';
import type { Belief } from './opponent-belief.js';
import { damageEnvironment, estimateDamage } from './damage-estimate.js';
import type { DamageEstimate } from './damage-estimate.js';

// プレイヤーの視点でのダメージの見積もり（特徴量 est_* 用）。
//
// 実戦で分かるのは、自分の能力値・相手の種族とタイプ・相性の区分・HP の割合・使われた技まで。相手の配分は分からない。
// そこで、相手は context.opponent（不完全情報なら能力値を見積もりに置き換えた値）で計算し、
// 前に当てた（受けた）ときの HP の減り方から、相手の耐久（火力）の倍率を逆算して補正する。人間が2回目以降の攻撃で
// 「さっき 37% 減ったから、この技なら倒せる」と読むのと同じ。急所の回と、倒した回（減った割合が下限でしかない）は使わない。
//
// 相手の技: 公開済みの技に、信念の候補セットの技を足したもののうち、こちらに最も痛いもの（相手の手の最悪値）。
// 攻撃技の候補が無く、技がまだ4つ見えていなければ、タイプ一致・威力80の仮の技。
// 見えていない特性・持ち物は、信念の候補セットで一番多いものとみなす。

export interface PlayerDamageView {
  out: DamageEstimate;
  in: DamageEstimate;
  // 観察で補正したか（1回以上、使える観察があったか）。
  outCalibrated: boolean;
  inCalibrated: boolean;
}

const SCALABLE: StatStageKey[] = ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];
const NONE: DamageEstimate = { fraction: 0, koChance: 0, effectiveness: 0 };
const RATIO_MIN = 0.5;
const RATIO_MAX = 2;

function placeholderMove(pokemon: Pokemon): MoveData {
  const physical = pokemon.baseStats.ATK >= pokemon.baseStats.SPATK;
  return createMove({ name: '（仮の技）', type: pokemon.types[0] ?? 'normal', power: 80, accuracy: 100, pp: 16, category: physical ? 'physical' : 'special' });
}

// 観察1件について「見積もりで撃ったら何%減るはずだったか」に対する実際の割合。ランクは撃ったときの値にそろえる。
function observedRatio(
  entry: ObservedDamage,
  attacker: Pokemon,
  defender: Pokemon,
  move: MoveData,
  context: BattleContext,
  attackerIsSelf: boolean,
): number | null {
  if (entry.critical || entry.knockedOut || entry.fraction <= 0 || entry.hpBefore <= 0) return null;
  const physical = entry.category === 'physical';
  const attackKey: StatStageKey = physical ? 'ATK' : 'SPATK';
  const defenseKey: StatStageKey = physical ? 'DEF' : 'SPDEF';
  const a = cloneWith(attacker, { stages: { [attackKey]: entry.attackStage ?? attacker.statStages[attackKey] } });
  const d = cloneWith(defender, { stages: { [defenseKey]: entry.defenseStage ?? defender.statStages[defenseKey] }, fullHp: true });
  const predicted = estimateDamage(a, d, { ...move, accuracy: 100 }, damageEnvironment(context, attackerIsSelf));
  if (predicted.fraction <= 0) return null;
  return entry.fraction / predicted.fraction;
}

function cloneWith(pokemon: Pokemon, change: { stages?: Partial<Record<StatStageKey, number>>; scale?: Partial<Record<StatStageKey, number>>; fullHp?: boolean }): Pokemon {
  const copy = shallowClonePokemon(pokemon);
  copy.statStages = { ...pokemon.statStages, ...change.stages };
  if (change.scale) {
    copy.stats = { ...pokemon.stats };
    for (const key of SCALABLE) {
      const factor = change.scale[key];
      if (factor !== undefined) copy.stats[key] = Math.max(1, Math.round(pokemon.stats[key] * factor));
    }
  }
  if (change.fullHp) copy.currentHP = pokemon.maxHP;
  return copy;
}

// 観察から、分類（物理・特殊）ごとの倍率を幾何平均で出す。
function calibrate(ratios: { physical: number[]; special: number[] }): { physical: number | null; special: number | null } {
  const mean = (xs: number[]) =>
    xs.length === 0 ? null : Math.min(RATIO_MAX, Math.max(RATIO_MIN, Math.exp(xs.reduce((sum, x) => sum + Math.log(x), 0) / xs.length)));
  return { physical: mean(ratios.physical), special: mean(ratios.special) };
}

function best(estimates: DamageEstimate[]): DamageEstimate {
  if (estimates.length === 0) return NONE;
  return {
    fraction: Math.max(...estimates.map((estimate) => estimate.fraction)),
    koChance: Math.max(...estimates.map((estimate) => estimate.koChance)),
    effectiveness: Math.max(...estimates.map((estimate) => estimate.effectiveness)),
  };
}

// まだ見えていない特性・持ち物は、信念の候補セットで一番多いものを入れる（経験者の見当。ロトムのふゆう等）。
function withLikelyHidden(pokemon: Pokemon, belief: Belief): Pokemon {
  const sets = compatibleSets(pokemon, belief);
  if (sets.length === 0 || (pokemon.ability !== 'none' && pokemon.item !== null)) return pokemon;
  const mostCommon = <T,>(values: T[]): T => {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const copy = shallowClonePokemon(pokemon);
  if (copy.ability === 'none') copy.ability = mostCommon(sets.map((set) => set.ability));
  if (copy.item === null) copy.item = mostCommon(sets.map((set) => set.item));
  return copy;
}

export function playerDamage(context: BattleContext, belief: Belief = defaultBelief()): PlayerDamageView {
  const self = context.self;
  const opponent = withLikelyHidden(context.opponent, belief);
  const side = context.side ?? 0;
  const observations = context.session?.observedDamage ?? [];
  // context.opponent と opponentTeam の要素は別々に伏せた複製なので、名前で突き合わせる（同じ種族は1体まで）。
  const opponentIndex = context.opponentTeam.findIndex((pokemon) => pokemon.name === context.opponent.name);

  // 自分 → 相手: 相手の耐久の倍率。こちらのどのポケモンが当てた観察でも使う（見ているのは相手の耐久）。
  const outRatios = { physical: [] as number[], special: [] as number[] };
  for (const entry of observations) {
    if (entry.attackerSide !== side || entry.defenderIndex !== opponentIndex) continue;
    const attacker = context.selfTeam[entry.attackerIndex];
    const move = attacker?.moves.find((candidate) => candidate.name === entry.move);
    if (attacker === undefined || move === undefined) continue;
    const ratio = observedRatio(entry, attacker, opponent, move, context, true);
    if (ratio !== null) outRatios[entry.category].push(ratio);
  }
  const outFactor = calibrate(outRatios);
  // 減り方が見積もりの r 倍なら、耐久はおよそ 1/r 倍。
  const defender = cloneWith(opponent, {
    scale: {
      ...(outFactor.physical === null ? {} : { DEF: 1 / outFactor.physical }),
      ...(outFactor.special === null ? {} : { SPDEF: 1 / outFactor.special }),
    },
  });
  const outEnvironment = damageEnvironment(context, true);
  const out = best(self.moves.filter((move) => move.category !== 'status' && move.pp > 0)
    .map((move) => estimateDamage(self, defender, move, outEnvironment)));

  // 相手 → 自分: 相手の火力の倍率。相手の場のポケモンがこちらのどれかに当てた観察を使う（見ているのは相手の火力）。
  const inRatios = { physical: [] as number[], special: [] as number[] };
  for (const entry of observations) {
    if (entry.attackerSide === side || entry.attackerIndex !== opponentIndex) continue;
    const target = context.selfTeam[entry.defenderIndex];
    const move = opponent.moves.find((candidate) => candidate.name === entry.move);
    if (target === undefined || move === undefined) continue;
    const ratio = observedRatio(entry, opponent, target, move, context, false);
    if (ratio !== null) inRatios[entry.category].push(ratio);
  }
  const inFactor = calibrate(inRatios);
  const attacker = cloneWith(opponent, {
    scale: {
      ...(inFactor.physical === null ? {} : { ATK: inFactor.physical }),
      ...(inFactor.special === null ? {} : { SPATK: inFactor.special }),
    },
  });
  const candidates = new Map<string, MoveData>();
  for (const move of opponent.moves) candidates.set(move.name, move);
  for (const set of compatibleSets(opponent, belief)) {
    for (const move of set.moves) if (!candidates.has(move.name)) candidates.set(move.name, move);
  }
  // 攻撃技の候補が無く、まだ4つ見えていなければ、仮の技を足す（変化技しか見せていない相手も攻撃技を持ちうる）。
  const hasAttack = [...candidates.values()].some((move) => move.category !== 'status');
  if (!hasAttack && opponent.moves.length < 4) candidates.set('（仮の技）', placeholderMove(opponent));
  const inEnvironment = damageEnvironment(context, false);
  const incoming = best([...candidates.values()].filter((move) => move.category !== 'status')
    .map((move) => estimateDamage(attacker, self, { ...move, pp: Math.max(1, move.pp) }, inEnvironment)));

  return {
    out,
    in: incoming,
    outCalibrated: outFactor.physical !== null || outFactor.special !== null,
    inCalibrated: inFactor.physical !== null || inFactor.special !== null,
  };
}
