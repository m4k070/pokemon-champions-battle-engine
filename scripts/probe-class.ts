import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';

const SETTERS = new Set(['drizzle','drought','sand-stream','snow-warning','sand-spit','psychic-surge','electric-surge','grassy-surge','misty-surge']);
const SETUP = new Set(['つるぎのまい','りゅうのまい','てっぺき','ちょうのまい','わるだくみ','からをやぶる','めいそう','ビルドアップ','こうそくいどう','ちいさくなる']);
const PIVOT = new Set(['とんぼがえり','クイックターン','ボルトチェンジ']);
const PASS = new Set(['バトンタッチ']);

for (const entry of META_TEAMS) {
  const full = teamToPokemons(entry);
  const picked = selectTeamWithPlan(entry, full).members;
  const moves = picked.flatMap((p) => p.moves.map((m) => m.name));
  const setter = picked.some((p) => SETTERS.has(p.ability));
  const setup = moves.filter((n) => SETUP.has(n)).length;
  const pivot = moves.filter((n) => PIVOT.has(n)).length;
  const pass = moves.filter((n) => PASS.has(n)).length;
  const bulk = picked.reduce((s, p) => s + p.stats.HP + p.stats.DEF + p.stats.SPDEF, 0) / picked.length;
  const speed = picked.reduce((s, p) => s + p.stats.SPEED, 0) / picked.length;
  console.log(`${entry.name}\t天候/地形始動=${setter?1:0}\t積み=${setup}\tピボット=${pivot}\tバトン=${pass}\t耐久平均=${bulk.toFixed(0)}\t素早さ平均=${speed.toFixed(0)}`);
}
