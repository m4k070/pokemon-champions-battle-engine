import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { HybridBattleAgent } from '../src/ai/hybrid-battle-agent.js';
import { ScriptedComboAgent } from '../src/ai/scripted-combo-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// 1つの構築を、他の全構築と1試合ずつ当てて勝率を出す（方策別の比較用）。
const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? '';
const target = process.argv[2]!;
const kind = process.argv[3] ?? 'heuristic';
const seed = Number(process.argv[4] ?? '101');
const maxTurns = Number(process.argv[5] ?? '100');

const makeAgent = (s: number) => kind === 'scripted'
  ? new ScriptedComboAgent(new SeededRandom(s))
  : kind === 'random'
  ? new RandomBattleAgent(new SeededRandom(s))
  : kind === 'hybrid'
    ? new HybridBattleAgent(new SeededRandom(s), { apiKey, maxConsultations: 12, cooldownTurns: 0 })
    : new HeuristicBattleAgent(new SeededRandom(s));

async function main() {
  const entry = META_TEAMS.find((t) => t.name === target)!;
  const team = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
  let wins = 0, games = 0, draws = 0, consults = 0, overrides = 0;
  for (const other of META_TEAMS) {
    if (other.name === target || other.name === 'メガジュペッタ構築') continue;
    const opp = selectTeamWithPlan(other, teamToPokemons(other)).members;
    const agentA = makeAgent(seed * 31 + 1);
    const agentB = makeAgent(seed * 31 + 2);
    const result = await runBattle(team, opp, agentA, agentB, {
      maxTurns, rng: new SeededRandom(seed * 31 + 3), information: 'partial',
      leadA: team[0], leadB: opp[0],
    });
    games++;
    if (result.winner === 0) wins++; else if (result.winner === null) draws++;
    if (agentA instanceof HybridBattleAgent) {
      consults += agentA.consultations.length;
      overrides += agentA.consultations.filter((c) => !c.agreed).length;
    }
  }
  console.log(`POLICY ${kind} team=${target} ${wins}勝/${games} 分${draws} (${((wins / games) * 100).toFixed(1)}%) 相談${consults} 上書き${overrides}`);
}
main();
