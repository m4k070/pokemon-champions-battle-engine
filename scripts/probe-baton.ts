import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { ScriptedComboAgent } from '../src/ai/scripted-combo-agent.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { SeededRandom } from '../src/rng.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';

// 加速バトン（バシャーモ）の校正用チーム。
// バシャーモの種族値は gamewith のポケチャン個別ページ（HP80/攻120/防70/特攻110/特防70/速80、
// 隠れ特性かそく）に基づく。yakkun は 503 で取得できず未確認。
// 引き継ぎ先はカタログ既存のガブリアス・メタグロス（種族値はカタログ由来）。

const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? '';
const kind = process.argv[2] ?? 'scripted';
const passTo = process.argv[3] ?? 'metagross';
const targetBoost = Number(process.argv[4] ?? '4');
const seed = Number(process.argv[5] ?? '101');
const maxTurns = 120;

function buildTeam(): Pokemon[] {
  const blaziken = new Pokemon({
    name: 'blaziken',
    types: ['fire', 'fighting'],
    ability: 'speed-boost',
    item: 'focus-sash',
    baseStats: { HP: 80, ATK: 120, DEF: 70, SPATK: 110, SPDEF: 70, SPEED: 80 },
    statPoints: { ATK: 32, SPEED: 32 },
    nature: 'ようき',
    moves: [
      createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
      createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
      createMove({ name: 'フレアドライブ', type: 'fire', power: 120, accuracy: 100, pp: 15, category: 'physical', recoil: 1 / 3 }),
      createMove({ name: 'まもる', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', priority: 4, protects: true }),
    ],
  });

  // 引き継ぎ先はカタログ既存の物理エース（メガメタグロス）と、いかく枠のギャラドス。
  const metagross = teamToPokemons(META_TEAMS.find((t) => t.name === 'カバルドン二軸デュアルメガ（M-7 試作PT v1）')!)
    .find((pokemon) => pokemon.name === 'metagross')!;
  const gyarados = teamToPokemons(META_TEAMS.find((t) => t.name === 'カバルカ構築')!)
    .find((pokemon) => pokemon.name === 'gyarados')
    ?? teamToPokemons(META_TEAMS.find((t) => t.name === 'メガガブリアスZ構築')!)
      .find((pokemon) => pokemon.name === 'garchomp')!;

  return [blaziken, metagross, gyarados];
}

const makeAgent = (s: number) => kind === 'random'
  ? new RandomBattleAgent(new SeededRandom(s))
  : kind === 'heuristic'
    ? new HeuristicBattleAgent(new SeededRandom(s))
    : new ScriptedComboAgent(new SeededRandom(s), { passTo, targetBoost, setupMoves: ['つるぎのまい'] });

async function main() {
  let wins = 0, draws = 0, games = 0, batons = 0, setups = 0, passUsed = 0;
  for (const other of META_TEAMS) {
    if (other.name === 'メガジュペッタ構築') continue;
    // 毎試合チームを作り直す（同じオブジェクトを使い回すと、前の試合の瀕死状態が残る）。
    const team = buildTeam();
    const opp = selectTeamWithPlan(other, teamToPokemons(other)).members;
    const agentA = makeAgent(seed * 31 + 1);
    const agentB = makeAgent(seed * 31 + 2);
    const leadA = await agentA.selectLead(team);
    const leadB = await agentB.selectLead(opp);
    const result = await runBattle(team, opp, agentA, agentB, {
      maxTurns, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
    });
    games++;
    if (agentA instanceof ScriptedComboAgent) { batons += agentA.batonCount; setups += agentA.setupCount; }
    if (result.winner === 0) wins++; else if (result.winner === null) draws++;
    // バトンタッチが実際に選ばれた回数（ログベース）。
    passUsed += String(result.log).split('\n').filter((line) => line.includes('バトンタッチ')).length;
    if (process.argv.includes('--debug')) {
      console.log(`  vs ${other.name}: winner=${result.winner} turns=${result.turns} baton=${agentA instanceof ScriptedComboAgent ? agentA.batonCount : '-'}`);
    }
  }
  console.log(`BATON policy=${kind} passTo=${passTo} boost=${targetBoost} ${wins}勝/${games} 分${draws} (${((wins / games) * 100).toFixed(1)}%) baton=${batons} setup=${setups} passUsed=${passUsed}`);
}
main();
