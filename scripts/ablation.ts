
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { createMove } from '../src/move.js';
import { Pokemon } from '../src/pokemon.js';

// 単要素アブレーション。対象構築を1つだけ変えて、同じ相手・同じseedで勝率を比べる。
// 使い方: ablation.ts <control|mega|yawn> <対象構築名>
//   mega: リザードンYのメガストーン → いのちのたま
//   yawn: カバルドンの あくび → ふきとばし

const mode = process.argv[2] ?? 'control';
const subject = process.argv[3] ?? 'メガリザードンY構築';
const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i);

function buildVariant(): Pokemon[] {
  const entry = META_TEAMS.find((t) => t.name === subject)!;
  const team = teamToPokemons(entry);
  if (mode === 'mega') {
    const mega = team.find((p) => p.item === 'charizardite-y');
    if (!mega) throw new Error('メガストーン持ちが見つかりません');
    mega.item = 'life-orb';
  }
  if (mode === 'yawncut') {
    const hippo = team.find((p) => p.name === 'hippowdon');
    if (!hippo) throw new Error('hippowdon がいません');
    hippo.moves = hippo.moves.filter((m) => m.name !== 'あくび');
  }
  if (mode === 'yawn') {
    const hippo = team.find((p) => p.name === 'hippowdon');
    if (!hippo) throw new Error('hippowdon がいません');
    const index = hippo.moves.findIndex((m) => m.name === 'あくび');
    if (index < 0) throw new Error('あくび を持っていません');
    hippo.moves[index] = createMove({
      name: 'ふきとばし', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', priority: -6, forcesSwitch: true,
    });
  }
  return team;
}

async function main() {
  const opponents = META_TEAMS.filter((t) => t.name !== subject && t.name !== 'メガジュペッタ構築');
  let wins = 0, draws = 0, games = 0;
  for (const seed of SEEDS) {
    for (const other of opponents) {
      const team = buildVariant();
      const picked = selectTeamWithPlan(META_TEAMS.find((t) => t.name === subject)!, team).members;
      const opp = selectTeamWithPlan(other, teamToPokemons(other)).members;
      const agentA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1));
      const agentB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
      const leadA = await agentA.selectLead(picked);
      const leadB = await agentB.selectLead(opp);
      const result = await runBattle(picked, opp, agentA, agentB, {
        maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
      });
      games++;
      if (result.winner === 0) wins++; else if (result.winner === null) draws++;
    }
  }
  const rate = (wins / games) * 100;
  const se = Math.sqrt((rate / 100) * (1 - rate / 100) / games) * 196;
  console.log(`ABL mode=${mode} team=${subject} ${wins}勝/${games} (${rate.toFixed(1)}% ±${se.toFixed(1)}) 分${draws}`);
}
main();
