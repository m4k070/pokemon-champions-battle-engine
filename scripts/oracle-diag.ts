
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { OracleBattleAgent } from '../src/ai/oracle-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';
import type { Pokemon } from '../src/pokemon.js';

// 千里眼だと何が変わるか: 交代回数と技の内訳を数える。
type Tally = { switches: number; moves: number; byName: Map<string, number>; turns: number };

class Counting implements BattleAgent {
  readonly tally: Tally = { switches: 0, moves: 0, byName: new Map(), turns: 0 };
  constructor(private readonly inner: BattleAgent) {}
  selectLead(team: Pokemon[]) { return this.inner.selectLead(team); }
  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const decision = await this.inner.selectAction(context);
    this.tally.turns++;
    if (decision.action.type === 'switch') this.tally.switches++;
    else {
      this.tally.moves++;
      const name = context.self.moves[decision.action.moveIndex]?.name ?? '?';
      this.tally.byName.set(name, (this.tally.byName.get(name) ?? 0) + 1);
    }
    return decision;
  }
}

const o: Tally = { switches: 0, moves: 0, byName: new Map(), turns: 0 };
const h: Tally = { switches: 0, moves: 0, byName: new Map(), turns: 0 };
const merge = (dst: Tally, src: Tally) => {
  dst.switches += src.switches; dst.moves += src.moves; dst.turns += src.turns;
  for (const [k, v] of src.byName) dst.byName.set(k, (dst.byName.get(k) ?? 0) + v);
};

for (const entry of META_TEAMS) {
  if (entry.name === 'メガジュペッタ構築') continue;
  for (let seed = 101; seed < 131; seed++) {
    const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
    const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
    const oracleIsA = seed % 2 === 1;
    const oc = new Counting(new OracleBattleAgent(teamB, seed * 13 + 3));
    const hc = new Counting(new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2)));
    await runBattle(teamA, teamB, oracleIsA ? oc : hc, oracleIsA ? hc : oc, {
      maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA: teamA[0], leadB: teamB[0],
    });
    merge(o, oc.tally); merge(h, hc.tally);
  }
}
const pct = (n: number, d: number) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;
console.log(`千里眼: 手番 ${o.turns} 交代 ${o.switches} (${pct(o.switches, o.turns)}) 技 ${o.moves}`);
console.log(`通常  : 手番 ${h.turns} 交代 ${h.switches} (${pct(h.switches, h.turns)}) 技 ${h.moves}`);
for (const name of ['あくび', 'みがわり', 'おにび', 'でんじは', 'つるぎのまい', 'なまける', 'ステルスロック']) {
  console.log(`  ${name}: 千里眼 ${o.byName.get(name) ?? 0} / 通常 ${h.byName.get(name) ?? 0}`);
}
