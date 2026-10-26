import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';

// 構築の「サイクル度」を技構成から数える（交代技・設置技・回復技・状態技）。
const PIVOT = new Set(['とんぼがえり', 'クイックターン', 'ボルトチェンジ']);
const HAZARD = new Set(['ステルスロック', 'まきびし', 'どくびし', 'はたきおとす', 'ふきとばし', 'ほえる']);
const HEAL = new Set(['なまける', 'はねやすめ', 'じこさいせい', 'あさのひざし', 'ねむる', 'ねがいごと', 'いやしのねがい']);
const STATUS = new Set(['あくび', 'でんじは', 'おにび', 'どくどく', 'こわいかお', 'アンコール', 'ちょうはつ']);
const SETUP = new Set(['つるぎのまい', 'りゅうのまい', 'てっぺき', 'ちょうのまい', 'わるだくみ', 'からをやぶる', 'めいそう']);

function metrics(names: string[]) {
  let pivot = 0, hazard = 0, heal = 0, status = 0, setup = 0, atk = 0;
  for (const entry of META_TEAMS) {
    const pokemons = teamToPokemons(entry);
    const picked = selectTeamWithPlan(entry, pokemons).members;
    if (picked.map((p) => p.name).join(',') !== names.join(',')) continue;
    for (const p of picked) {
      for (const move of p.moves) {
        if (PIVOT.has(move.name)) pivot++;
        if (HAZARD.has(move.name)) hazard++;
        if (HEAL.has(move.name)) heal++;
        if (STATUS.has(move.name)) status++;
        if (SETUP.has(move.name)) setup++;
        if (move.category !== 'status') atk++;
      }
    }
  }
  return { pivot, hazard, heal, status, setup, atk, cycle: pivot + hazard + heal + status };
}

const rows: { team: string; cycle: number; detail: string }[] = [];
for (const entry of META_TEAMS) {
  const pokemons = teamToPokemons(entry);
  const picked = selectTeamWithPlan(entry, pokemons).members.map((p) => p.name);
  const m = metrics(picked);
  rows.push({ team: entry.name, cycle: m.cycle, detail: `pivot${m.pivot} hazard${m.hazard} heal${m.heal} status${m.status} setup${m.setup} 攻撃技${m.atk}` });
}
const rates: Record<string, [number, number]> = {
  'メガリザードンY構築': [86.7, 58.3], 'メガガブリアスZ構築': [68.3, 75.0], 'メガラグラージ構築': [68.3, 75.0],
  'メガライチュウY構築': [60.0, 43.3], 'カバルドン二軸デュアルメガ（M-7 試作PT v1）': [48.3, 23.3],
  'カバマンダ構築': [48.3, 35.0], 'メガカメックス構築': [40.0, 40.0], 'カイリューガルド構築': [40.0, 48.3],
  'クエスピクシー構築': [36.7, 61.7], 'カバルカ構築': [28.3, 46.7], 'メガグソクムシャ構築': [25.0, 43.3],
};
console.log('構築 | サイクル度 | 内訳 | heuristic - random');
for (const row of rows.sort((a, b) => b.cycle - a.cycle)) {
  const r = rates[row.team];
  const delta = r ? (r[0] - r[1]).toFixed(1) : '?';
  console.log(`${row.team} | ${row.cycle} | ${row.detail} | ${delta}`);
}
// 相関
const xs = rows.map((r) => r.cycle).filter((_, i) => rates[rows[i]!.team]);
const ys = rows.filter((r) => rates[r.team]).map((r) => rates[r.team]![0] - rates[r.team]![1]);
const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
console.log(`\nサイクル度 vs (heuristic - random) の相関 r=${(num / den).toFixed(2)} (n=${xs.length})`);
