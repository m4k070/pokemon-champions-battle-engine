import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { HeuristicBattleAgent } from './heuristic-battle-agent.js';
import { Pokemon, shallowClonePokemon } from '../pokemon.js';
import { SeededRandom } from '../rng.js';
import { compatibleSets } from './opponent-belief.js';

// PIMC（determinization）: 相手の伏せられた技・持ち物・特性を、メタの構築プールから
// サンプリングして「完全情報の世界」を複数作り、それぞれで方策に判断させて多数決する。
// 不完全情報下では最善手の定義ができないため、期待値の近似として平均を取る。

export interface SpeciesSet {
  moves: Pokemon['moves'];
  item: Pokemon['item'];
  ability: Pokemon['ability'];
}

export type Belief = Map<string, SpeciesSet[]>;

export class PimcBattleAgent implements BattleAgent {
  private readonly rng: SeededRandom;
  private readonly innerSeedBase: number;

  constructor(
    private readonly belief: Belief,
    private readonly samples = 8,
    seed = 1,
  ) {
    this.rng = new SeededRandom(seed);
    this.innerSeedBase = seed;
  }

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return new HeuristicBattleAgent(new SeededRandom(this.innerSeedBase)).selectLead(team);
  }

  // 相手の未公開情報を、種族ごとの候補セットからランダムに埋める。
  // 候補は開示済みの技と矛盾しないものに絞り、メガシンカ前の名前で引く（メガシンカすると name が変わる）。
  // テストから直接叩けるように public にしている（決定的な副作用はない）。
  determinize(pokemon: Pokemon): Pokemon {
    const clone = shallowClonePokemon(pokemon);
    const candidates = compatibleSets(clone, this.belief);
    if (candidates.length === 0) return clone;
    const candidate = candidates[Math.floor(this.rng.next() * candidates.length)];

    const revealed = clone.moves;
    const filled: Pokemon['moves'] = [...revealed];
    for (const move of candidate.moves) {
      if (filled.length >= 4) break;
      if (filled.some((known) => known.name === move.name)) continue;
      filled.push(move);
    }
    clone.moves = filled;
    if (clone.item === null) clone.item = candidate.item;
    if (clone.ability === 'none') clone.ability = candidate.ability;
    return clone;
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const votes = new Map<string, { count: number; decision: AgentDecision }>();
    for (let sample = 0; sample < this.samples; sample++) {
      // 場の相手と、チームの中の同じ個体は同じ埋め方にする（別々に引くと食い違う）。
      // 不完全情報では両者が別々に伏せた複製なので、同一性ではなく名前で対応を取る。
      const opponentTeam = context.opponentTeam.map((pokemon) => this.determinize(pokemon));
      const activeIndex = context.opponentTeam.findIndex(
        (pokemon) => pokemon === context.opponent || pokemon.name === context.opponent.name,
      );
      const world: BattleContext = {
        ...context,
        opponent: activeIndex >= 0 ? opponentTeam[activeIndex] : this.determinize(context.opponent),
        opponentTeam,
      };
      const agent = new HeuristicBattleAgent(new SeededRandom(this.innerSeedBase * 1000 + sample));
      const decision = await agent.selectAction(world);
      const key = JSON.stringify(decision.action);
      const entry = votes.get(key);
      if (entry) entry.count++;
      else votes.set(key, { count: 1, decision });
    }
    let best: { count: number; decision: AgentDecision } | null = null;
    for (const entry of votes.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    const chosen = best!.decision;
    return {
      action: chosen.action,
      reasoning: `PIMC ${this.samples}サンプルで多数決（${best!.count}/${this.samples}）: ${chosen.reasoning}`,
    };
  }
}
