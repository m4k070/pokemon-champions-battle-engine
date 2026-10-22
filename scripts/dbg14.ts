
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { damageRatio } from '../src/ai/heuristic-battle-agent.js';
const metagross = teamToPokemons(META_TEAMS.find((t) => t.name === 'カバルドン二軸デュアルメガ（M-7 試作PT v1）')!).find((p) => p.name === 'metagross')!;
const opp = teamToPokemons(META_TEAMS.find((t) => t.name === 'カバルカ構築')!).find((p) => p.name === 'hippowdon')!;
for (const atkStage of [0, 2, 4]) {
  metagross.statStages.ATK = atkStage;
  const ratios = metagross.moves.map((m) => `${m.name}:${damageRatio(metagross, opp, m)?.toFixed(2)}`).join(' ');
  console.log(`ATK+${atkStage}`, ratios);
}
metagross.statStages.ATK = 0;
console.log('moves of metagross:', metagross.moves.map((m) => m.name).join(','));
