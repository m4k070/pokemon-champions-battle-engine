import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { OpenCodeBattleAgent } from '../src/ai/opencode-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';

// 1試合だけ、方策を指定して対戦させる（ヒューリスティック vs LLM の比較用）。
// 使い方: probe-duel.ts <teamA> <heuristic|llm> <teamB> <heuristic|llm> [seed] [maxTurns] [model]

const [, , teamAName, policyA, teamBName, policyB, seedArg, turnsArg, modelArg] = process.argv;
const seed = Number(seedArg ?? '101');
const maxTurns = Number(turnsArg ?? '100');
const model = modelArg ?? 'deepseek-v4.1-flash';

const stats = { calls: 0, fallbacks: 0, ms: 0 };

class Counter implements BattleAgent {
  constructor(private readonly inner: BattleAgent) {}
  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) { return this.inner.selectLead(team); }
  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const started = Date.now();
    const decision = await this.inner.selectAction(context);
    stats.calls++;
    stats.ms += Date.now() - started;
    if (String(decision.reasoning ?? '').includes('フォールバック')) stats.fallbacks++;
    return decision;
  }
}

function make(name: string, policy: string, s: number): BattleAgent {
  if (policy === 'heuristic') return new HeuristicBattleAgent(new SeededRandom(s));
  if (policy === 'random') return new Counter(new (require('../src/ai/battle-agent.js').RandomBattleAgent)(new SeededRandom(s)));
  const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? '';
  return new Counter(new OpenCodeBattleAgent({ apiKey, model, timeoutMs: 90_000 }));
}

async function main() {
  const entryA = META_TEAMS.find((t) => t.name === teamAName)!;
  const entryB = META_TEAMS.find((t) => t.name === teamBName)!;
  const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
  const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
  const agentA = make(teamAName, policyA, seed * 31 + 1);
  const agentB = make(teamBName, policyB, seed * 31 + 2);
  console.log(`A=${teamAName}(${policyA}) [${teamA.map((p) => p.name).join(',')}]`);
  console.log(`B=${teamBName}(${policyB}) [${teamB.map((p) => p.name).join(',')}]`);
  const leadA = await agentA.selectLead(teamA);
  const leadB = await agentB.selectLead(teamB);
  console.log(`先発: A=${leadA.name} B=${leadB.name}`);
  const started = Date.now();
  const result = await runBattle(teamA, teamB, agentA, agentB, {
    maxTurns, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
  });
  console.log(`結果: winner=${result.winner ?? 'draw'} turns=${result.turns} 実時間=${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`LLM: 判断${stats.calls}回 フォールバック${stats.fallbacks}回 平均${(stats.ms / Math.max(1, stats.calls) / 1000).toFixed(1)}s`);
  console.log('--- ログ抜粋 ---');
  console.log(String(result.log).split('\n').slice(-22).join('\n'));
}
main();
