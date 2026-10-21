import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { OpenCodeBattleAgent } from '../src/ai/opencode-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY;
if (!apiKey) throw new Error('OPENCODE_GO_API_KEY がありません');

async function playOne(nameA: string, nameB: string, maxTurns: number) {
  const entryA = META_TEAMS.find((t) => t.name === nameA)!;
  const entryB = META_TEAMS.find((t) => t.name === nameB)!;
  const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
  const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
  const started = Date.now();
  const result = await runBattle(
    teamA, teamB,
    new OpenCodeBattleAgent({ apiKey }),
    new OpenCodeBattleAgent({ apiKey }),
    { maxTurns, rng: new SeededRandom(11), information: 'partial', leadA: teamA[0], leadB: teamB[0] },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const reasoningCount = Array.isArray(result.reasoningLog) ? result.reasoningLog.length : 0;
  const fallbacks = JSON.stringify(result.reasoningLog ?? '').split('フォールバック').length - 1;
  const winner = result.winner === 0 ? nameA : result.winner === 1 ? nameB : '引き分け';
  console.log(`\n[${nameA} vs ${nameB}] 勝者=${winner} ターン=${result.turns} 所要=${seconds}秒 思考記録=${reasoningCount} フォールバック=${fallbacks}`);
  console.log(`  選出: A=${teamA.map((p) => p.name).join('/')} B=${teamB.map((p) => p.name).join('/')}`);
  const samples = (result.reasoningLog ?? []).slice(0, 2);
  for (const entry of samples) console.log(`  思考例: ${JSON.stringify(entry).slice(0, 300)}`);
  return { winner: result.winner, turns: result.turns, seconds: Number(seconds), fallbacks };
}

async function main() {
  const matchups: [string, string][] = [
    ['メガリザードンY構築', 'カバルカ構築'],
    ['メガガブリアスZ構築', 'メガライチュウY構築'],
    ['カバマンダ構築', 'カイリューガルド構築'],
  ];
  const limit = Number(process.argv[2] ?? '1');
  const results = [];
  for (const [a, b] of matchups.slice(0, limit)) {
    results.push(await playOne(a, b, Number(process.argv[3] ?? '30')));
  }
  console.log('\n=== まとめ ===');
  console.log(JSON.stringify(results));
}
main();
