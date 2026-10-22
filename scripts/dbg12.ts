
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
const e = META_TEAMS.find((t) => t.name === 'カバルカ構築')!;
const a = teamToPokemons(e);
const b = teamToPokemons(e);
console.log('同一オブジェクト?', a[0] === b[0], '| name', a[0]?.name);
console.log('HP a,b:', a[0]?.currentHP, b[0]?.currentHP);
a[0]!.currentHP = 0;
console.log('a[0]を0にした後の b[0]:', b[0]?.currentHP, ' 新しい呼び出し:', teamToPokemons(e)[0]?.currentHP);
