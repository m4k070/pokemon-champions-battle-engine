import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { SeededRandom } from '../src/rng.js';

async function main() {
  const target = META_TEAMS.find((t) => t.name === 'メガラグラージ構築')!;
  const mons = teamToPokemons(target);
  console.log('=== メガラグラージ構築の実数値 ===');
  for (const p of mons) {
    console.log(
      `${p.name} HP${p.maxHP} A${p.stats.ATK} B${p.stats.DEF} C${p.stats.SPATK} D${p.stats.SPDEF} S${p.stats.SPEED}` +
      ` 特性:${p.ability} 道具:${p.item} タイプ:${p.types.join('/')}`
    );
  }
  const foe = META_TEAMS.find((t) => t.name === 'メガカメックス構築')!;
  const foeMons = teamToPokemons(foe);
  console.log('\n=== 対戦相手（メガカメックス構築）の実数値 ===');
  for (const p of foeMons) {
    console.log(`${p.name} HP${p.maxHP} A${p.stats.ATK} B${p.stats.DEF} C${p.stats.SPATK} D${p.stats.SPDEF} S${p.stats.SPEED} 特性:${p.ability} 道具:${p.item}`);
  }
  const result = await runBattle(
    teamToPokemons(target), foeMons,
    new HeuristicBattleAgent(new SeededRandom(1)),
    new HeuristicBattleAgent(new SeededRandom(2)),
    { maxTurns: 60, rng: new SeededRandom(3) },
  );
  console.log(`\n=== 1試合（勝者=${result.winner} ターン=${result.turns}） ===`);
  const logText = typeof result.log === 'string' ? result.log : JSON.stringify(result.log);
  console.log(logText.split('\n').slice(0, 55).join('\n'));
}
main();
