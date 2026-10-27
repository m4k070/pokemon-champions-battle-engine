import { Pokemon } from '../pokemon.js';
import { createMove } from '../move.js';
import type { StatKey, Stats } from '../types.js';
import type { NatureInput, StatPointsInput } from '../rules/stat-point-system.js';

// 相手の「型」に対する信念（belief）。
// 不完全情報では、まだ見えていない技・持ち物・特性を「無い」と扱うと判断が歪む。
// 種族ごとにメタで観測された候補セットを持ち、確率で扱うのが目的。

export interface SpeciesSet {
  moves: Pokemon['moves'];
  item: Pokemon['item'];
  ability: Pokemon['ability'];
  // 配分と性格（能力値の推定に使う）。手で作った信念では省略でき、そのときは無振り・無補正とみなす。
  statPoints?: StatPointsInput;
  nature?: NatureInput;
}

export type Belief = Map<string, SpeciesSet[]>;

function signature(moves: Pokemon['moves'], item: Pokemon['item'], ability: Pokemon['ability']): string {
  return `${moves.map((move) => move.name).sort().join(',')}|${item}|${ability}`;
}

export function buildBelief(members: Pokemon[][]): Belief {
  const belief: Belief = new Map();
  for (const team of members) {
    for (const pokemon of team) {
      const sets = belief.get(pokemon.name) ?? [];
      const sig = signature(pokemon.moves, pokemon.item, pokemon.ability);
      if (!sets.some((set) => signature(set.moves, set.item, set.ability) === sig)) {
        sets.push({ moves: pokemon.moves, item: pokemon.item, ability: pokemon.ability, statPoints: pokemon.statPoints, nature: pokemon.nature });
        belief.set(pokemon.name, sets);
      }
    }
  }
  return belief;
}

let defaultTeams: Pokemon[][] = [];
let cachedBelief: Belief | null = null;
let cachedBaseRate: number | null = null;

// 既定の信念の元になる構築プールを登録する。カタログはエンジンに含めないので、
// 使う側（研究用リポジトリ）がカタログを読み込んだときに呼ぶ。未登録なら信念は空。
export function setDefaultBeliefTeams(teams: Pokemon[][]): void {
  defaultTeams = teams;
  cachedBelief = null;
  cachedBaseRate = null;
}

// 登録された構築プールから既定の信念を作る（初回のみ構築）。
export function defaultBelief(): Belief {
  if (cachedBelief === null) {
    cachedBelief = buildBelief(defaultTeams);
  }
  return cachedBelief;
}

// 相手を妨害する変化技か（みがわり・状態異常耐性の判断に使う）。
export function isOpponentStatusMove(move: Pokemon['moves'][number]): boolean {
  if (move.inflictsDrowsy || move.inflictsEncore) return true;
  return move.category === 'status' && move.status !== null;
}

// 開示済みの技と矛盾しない候補セット。信念はメガシンカ前の名前で引く（メガシンカすると name が変わる）。
export function compatibleSets(pokemon: Pokemon, belief: Belief): SpeciesSet[] {
  const candidates = belief.get(pokemon.baseName ?? pokemon.name) ?? belief.get(pokemon.name);
  if (!candidates || candidates.length === 0) return [];
  const revealed = pokemon.moves.map((move) => move.name);
  const compatible = candidates.filter((set) =>
    revealed.every((name) => set.moves.some((move) => move.name === name)),
  );
  return compatible.length > 0 ? compatible : candidates;
}

// まだ見えていない枠に妨害変化技がある確率。候補が無い種族はメタ全体のbase rateで代用。
export function statusMoveProbability(pokemon: Pokemon, belief: Belief = defaultBelief()): number {
  const candidates = compatibleSets(pokemon, belief);
  if (candidates.length === 0) return baseStatusRate(belief);
  const revealedStatus = pokemon.moves.some(isOpponentStatusMove);
  if (revealedStatus) return 1;
  const hits = candidates.filter((set) => set.moves.some(isOpponentStatusMove)).length;
  return hits / candidates.length;
}

// メタ全体で「妨害変化技を1つ以上持つセット」の割合。
export function baseStatusRate(belief: Belief = defaultBelief()): number {
  if (cachedBaseRate !== null) return cachedBaseRate;
  let total = 0;
  let hits = 0;
  for (const sets of belief.values()) {
    for (const set of sets) {
      total++;
      if (set.moves.some(isOpponentStatusMove)) hits++;
    }
  }
  cachedBaseRate = total === 0 ? 0 : hits / total;
  return cachedBaseRate;
}

const STAT_KEYS: StatKey[] = ['HP', 'ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];

// 相手の能力値をどう見積もるか。'exact' は実際の値（実戦では見えない）。
// 'belief' は経験者の見当: 信念の候補セットの配分・性格で、今の種族値（メガシンカ後を含む）から計算した値の平均。
// 候補が無い種族と 'base' は、無振り・無補正の値。
export type OpponentStatsEstimate = 'exact' | 'belief' | 'base';

export function estimateStats(pokemon: Pokemon, mode: Exclude<OpponentStatsEstimate, 'exact'>, belief: Belief = defaultBelief()): Stats {
  const sets = mode === 'belief' ? compatibleSets(pokemon, belief) : [];
  if (sets.length === 0) return Pokemon.calculateStats(pokemon.baseStats, pokemon.level);
  const all = sets.map((set) => Pokemon.calculateStats(pokemon.baseStats, pokemon.level, set.statPoints ?? {}, set.nature ?? null));
  const out: Stats = { ...all[0] };
  for (const key of STAT_KEYS) {
    out[key] = Math.round(all.reduce((sum, stats) => sum + stats[key], 0) / all.length);
  }
  return out;
}

// 見せ合いで見えるのは種族だけなので、選出を考えるときの相手の1体（新しく作った複製）に信念の候補セットの1つを当てはめる。
// pick で候補を選ぶ（試合ごとに変えると型の不確かさを反映できる）。
// 候補が無い種族は、タイプ一致の仮の攻撃技だけ・特性なし・持ち物なし・無振りにして false を返す
// （実物の技・特性は見せ合いでは見えないので使わない）。
export function applyPreviewSet(pokemon: Pokemon, belief: Belief, pick: number): boolean {
  const sets = belief.get(pokemon.baseName ?? pokemon.name) ?? [];
  const set = sets.length > 0 ? sets[pick % sets.length] : undefined;
  if (set) {
    pokemon.moves = set.moves.map((move) => ({ ...move }));
    pokemon.item = set.item;
    pokemon.ability = set.ability;
  } else {
    pokemon.moves = placeholderMoves(pokemon);
    pokemon.item = null;
    pokemon.ability = 'none';
  }
  pokemon.statPoints = set?.statPoints ?? {};
  pokemon.nature = set?.nature ?? null;
  pokemon.stats = Pokemon.calculateStats(pokemon.baseStats, pokemon.level, pokemon.statPoints, pokemon.nature);
  pokemon.maxHP = pokemon.stats.HP;
  pokemon.currentHP = pokemon.maxHP;
  return set !== undefined;
}

// 型の分からない種族の仮の技: タイプごとに威力80・命中100の一致技を1つ。物理か特殊かは種族値の高いほう。
export function placeholderMoves(pokemon: Pokemon): Pokemon['moves'] {
  const category = pokemon.baseStats.ATK >= pokemon.baseStats.SPATK ? 'physical' : 'special';
  return pokemon.types.map((type) => createMove({ name: `仮の一致技（${type}）`, type, power: 80, accuracy: 100, pp: 16, category }));
}

// 相手のポケモン（の複製）の能力値を見積もりに置き換える。HP とみがわりは割合を保つ（実戦で見えるのは HP の割合）。
export function applyEstimatedStats(pokemon: Pokemon, mode: OpponentStatsEstimate, belief: Belief = defaultBelief()): void {
  if (mode === 'exact') return;
  const stats = estimateStats(pokemon, mode, belief);
  const ratio = pokemon.maxHP === 0 ? 0 : pokemon.currentHP / pokemon.maxHP;
  const subRatio = pokemon.maxHP === 0 ? 0 : pokemon.substituteHP / pokemon.maxHP;
  pokemon.stats = stats;
  pokemon.maxHP = stats.HP;
  pokemon.currentHP = pokemon.isFainted ? 0 : Math.max(1, Math.round(ratio * stats.HP));
  pokemon.substituteHP = Math.round(subRatio * stats.HP);
}
