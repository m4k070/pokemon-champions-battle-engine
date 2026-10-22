
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { typeMultiplier } from '../src/ai/heuristic-battle-agent.js';

const win: Record<string, number> = {
  'メガリザードンY構築': 90.0, 'メガガブリアスZ構築': 65.0, 'メガラグラージ構築': 60.0,
  'メガライチュウY構築': 55.0, 'カバルドン二軸デュアルメガ（M-7 試作PT v1）': 50.0,
  'メガカメックス構築': 50.0, 'クエスピクシー構築': 45.0, 'カイリューガルド構築': 40.0,
  'カバマンダ構築': 35.0, 'メガグソクムシャ構築': 30.0, 'カバルカ構築': 30.0,
};
const rnd: Record<string, number> = {
  'メガリザードンY構築': 50.0, 'メガガブリアスZ構築': 85.0, 'メガラグラージ構築': 75.0,
  'メガライチュウY構築': 55.0, 'カバルドン二軸デュアルメガ（M-7 試作PT v1）': 30.0,
  'メガカメックス構築': 25.0, 'クエスピクシー構築': 65.0, 'カイリューガルド構築': 45.0,
  'カバマンダ構築': 35.0, 'メガグソクムシャ構築': 35.0, 'カバルカ構築': 50.0,
};
const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

const rows = META_TEAMS.filter((e) => win[e.name] !== undefined).map((e) => {
  const picked = selectTeamWithPlan(e, teamToPokemons(e)).members;
  // 各攻撃タイプについて、選出3体のうち弱点（2倍以上）の数を数え、最大を弱点集中度とする。
  let worst = 0, worstType = '';
  for (const t of TYPES) {
    const n = picked.filter((p) => typeMultiplier(t as never, p.types) > 1).length;
    if (n > worst) { worst = n; worstType = t; }
  }
  // 4倍弱点を持つ個体の数
  const quad = picked.filter((p) => TYPES.some((t) => typeMultiplier(t as never, p.types) >= 4)).length;
  // 選出3体のタイプ一致攻撃の種類数（攻撃の通りやすさ）
  const stab = new Set(picked.flatMap((p) => p.types));
  // 素早さ実数値の平均
  const speed = Math.round(picked.reduce((s, p) => s + p.stats.SPEED, 0) / 3);
  // 回復技持ちの数
  const recovery = picked.filter((p) => p.moves.some((m) => m.selfHealPercent || m.weatherHeal || m.rests)).length;
  return {
    name: e.name.replace('構築', '').replace('カバルドン二軸デュアルメガ（M-7 試作PT v1）', '試作PT'),
    win: win[e.name], rnd: rnd[e.name], worst, worstType, quad, stab: stab.size, speed, recovery,
  };
}).sort((a, b) => b.win - a.win);

console.log('構築\t勝h\t勝r\th-r\t弱点集中\t4倍弱点\t一致タイプ数\t平均S\t回復技持ち');
for (const r of rows) {
  console.log(`${r.name}\t${r.win}\t${r.rnd}\t${(r.win - r.rnd).toFixed(0)}\t${r.worst}(${r.worstType})\t${r.quad}\t${r.stab}\t${r.speed}\t${r.recovery}`);
}
