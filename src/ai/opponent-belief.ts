import type { Pokemon } from '../pokemon.js';

// 相手の「型」に対する信念（belief）。
// 不完全情報では、まだ見えていない技・持ち物・特性を「無い」と扱うと判断が歪む。
// 種族ごとにメタで観測された候補セットを持ち、確率で扱うのが目的。

export interface SpeciesSet {
  moves: Pokemon['moves'];
  item: Pokemon['item'];
  ability: Pokemon['ability'];
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
        sets.push({ moves: pokemon.moves, item: pokemon.item, ability: pokemon.ability });
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

// 開示済みの技と矛盾しない候補セット。
export function compatibleSets(pokemon: Pokemon, belief: Belief): SpeciesSet[] {
  const candidates = belief.get(pokemon.name);
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
