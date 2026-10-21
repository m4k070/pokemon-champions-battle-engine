import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { OpenCodeBattleAgent } from '../src/ai/opencode-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';
import type { Pokemon } from '../src/pokemon.js';

const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY;
if (!apiKey) throw new Error('OPENCODE_GO_API_KEY がありません');

// 1手ごとの所要時間とフォールバックを記録するラッパー。
class TimedAgent implements BattleAgent {
  calls = 0;
  fallbacks = 0;
  ms: number[] = [];
  constructor(private readonly inner: BattleAgent, private readonly label: string) {}
  async selectLead(team: Pokemon[]): Promise<Pokemon> { return this.inner.selectLead(team); }
  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const started = Date.now();
    const decision = await this.inner.selectAction(context);
    const elapsed = Date.now() - started;
    this.calls++;
    this.ms.push(elapsed);
    if (decision.reasoning?.includes('フォールバック')) this.fallbacks++;
    console.log(`[${this.label}] turn${context.turn} ${(elapsed / 1000).toFixed(1)}s ${decision.reasoning?.slice(0, 80) ?? ''}`);
    return decision;
  }
}

async function main() {
  const nameA = process.argv[2] ?? 'メガリザードンY構築';
  const nameB = process.argv[3] ?? 'カバルカ構築';
  const maxTurns = Number(process.argv[4] ?? '10');
  const entryA = META_TEAMS.find((t) => t.name === nameA)!;
  const entryB = META_TEAMS.find((t) => t.name === nameB)!;
  const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
  const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
  console.log(`選出A=${teamA.map((p) => p.name).join('/')} 選出B=${teamB.map((p) => p.name).join('/')}`);

  const a = new TimedAgent(new OpenCodeBattleAgent({ apiKey }), 'A');
  const b = new TimedAgent(new OpenCodeBattleAgent({ apiKey }), 'B');
  const started = Date.now();
  const result = await runBattle(teamA, teamB, a, b, {
    maxTurns, rng: new SeededRandom(11), information: 'partial', leadA: teamA[0], leadB: teamB[0],
  });
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  const stat = (t: TimedAgent) => `calls=${t.calls} fallbacks=${t.fallbacks} avg=${(t.ms.reduce((s, x) => s + x, 0) / Math.max(1, t.ms.length) / 1000).toFixed(1)}s`;
  console.log(`\n結果: 勝者=${result.winner === 0 ? nameA : result.winner === 1 ? nameB : '引き分け'} ターン=${result.turns} 所要=${sec}s`);
  console.log(`A: ${stat(a)} / B: ${stat(b)}`);
}
main();
