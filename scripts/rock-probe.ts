
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';

// 「すでに相手の場にステロがあるのに、さらにステロを撃つ」判断が起きる条件を記録する。
let samples = 0;
class Probe implements BattleAgent {
  constructor(private readonly inner: HeuristicBattleAgent, private readonly name: string) {}
  selectLead(team: Parameters<BattleAgent['selectLead']>[0]) { return this.inner.selectLead(team); }
  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const decision = await this.inner.selectAction(context);
    const action = decision.action;
    if (action.type === 'move') {
      const move = context.self.moves[action.moveIndex];
      if (move?.name === 'ステルスロック' && context.field.stealthRock.opponent && samples < 12) {
        samples++;
        const evals = this.inner.lastEvaluation.map((e) => `${e.label}:${e.score.toFixed(1)}`).join(' / ');
        console.log(`[${this.name}] turn=${context.turn} HP=${Math.round((context.self.currentHP / context.self.maxHP) * 100)}% 相手=${context.opponent.name} | ${evals}`);
      }
    }
    return decision;
  }
}

async function main() {
  for (let seed = 101; seed <= 104; seed++) {
    for (const a of META_TEAMS) {
      for (const b of META_TEAMS) {
        if (a.name === b.name || a.name === 'メガジュペッタ構築' || b.name === 'メガジュペッタ構築') continue;
        const teamA = selectTeamWithPlan(a, teamToPokemons(a)).members;
        const teamB = selectTeamWithPlan(b, teamToPokemons(b)).members;
        const innerA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1));
        const innerB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
        const agentA = new Probe(innerA, a.name);
        const agentB = new Probe(innerB, b.name);
        const leadA = await innerA.selectLead(teamA);
        const leadB = await innerB.selectLead(teamB);
        await runBattle(teamA, teamB, agentA, agentB, {
          maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
        });
        if (samples >= 12) { console.log('--- 打ち切り ---'); return; }
      }
    }
  }
}
main();
