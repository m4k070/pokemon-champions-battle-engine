
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';

const winRate: Record<string, number> = {
  'メガリザードンY構築': 90.0, 'メガガブリアスZ構築': 65.0, 'メガラグラージ構築': 60.0,
  'メガライチュウY構築': 55.0, 'カバルドン二軸デュアルメガ（M-7 試作PT v1）': 50.0,
  'メガカメックス構築': 50.0, 'クエスピクシー構築': 45.0, 'カイリューガルド構築': 40.0,
  'カバマンダ構築': 35.0, 'メガグソクムシャ構築': 30.0, 'カバルカ構築': 30.0,
};
const randomRate: Record<string, number> = {
  'メガリザードンY構築': 50.0, 'メガガブリアスZ構築': 85.0, 'メガラグラージ構築': 75.0,
  'メガライチュウY構築': 55.0, 'カバルドン二軸デュアルメガ（M-7 試作PT v1）': 30.0,
  'メガカメックス構築': 25.0, 'クエスピクシー構築': 65.0, 'カイリューガルド構築': 45.0,
  'カバマンダ構築': 35.0, 'メガグソクムシャ構築': 35.0, 'カバルカ構築': 50.0,
};

const HAZARD = ['ステルスロック', 'まきびし', 'どくびし', 'ねばねばネット'];
const PIVOT = ['とんぼがえり', 'ボルトチェンジ', 'クイックターン', 'バトンタッチ', 'テレポート'];
const SETUP = ['つるぎのまい', 'りゅうのまい', 'ちょうのまい', 'めいそう', 'わるだくみ', 'からをやぶる', 'てっぺき', 'ビルドアップ', 'のろい', 'カウンター'];
const WEATHER = ['にほんばれ', 'あまごい', 'すなあらし', 'ゆきげしき', 'エレキフィールド', 'サイコフィールド', 'グラスフィールド', 'ミストフィールド'];

const rows = META_TEAMS.map((entry) => {
  const picked = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
  const moves = picked.flatMap((p) => p.moves.map((m) => m.name));
  const items = picked.map((p) => p.item ?? '-');
  const abilities = picked.map((p) => p.ability);
  const types = picked.map((p) => p.types.join('/'));
  const bst = picked.map((p) => Object.values(p.stats).reduce((a, b) => a + b, 0));
  const count = (list: string[], names: string[]) => names.filter((n) => list.includes(n)).length;
  return {
    name: entry.name.replace('構築', '').replace('カバルドン二軸デュアルメガ（M-7 試作PT v1）', '試作PT'),
    win: winRate[entry.name], rnd: randomRate[entry.name],
    picked: picked.map((p) => p.name).join('/'),
    types: types.join(','),
    mega: items.filter((i) => i.includes('ite') || i.includes('ナイト')).length,
    hazard: count(moves, HAZARD), pivot: count(moves, PIVOT), setup: count(moves, SETUP), weather: count(moves, WEATHER),
    protect: moves.filter((m) => m === 'まもる').length,
    priority: picked.reduce((s, p) => s + p.moves.filter((m) => (m.priority ?? 0) > 0).length, 0),
    avgBst: Math.round(bst.reduce((a, b) => a + b, 0) / bst.length),
  };
}).sort((a, b) => b.win - a.win);

console.log('構築\t勝率h\t勝率r\t選出\tメガ\t設置\tピボット\t積み\t天候\t守る\t先制\t平均BST');
for (const r of rows) {
  console.log(`${r.name}\t${r.win}\t${r.rnd}\t${r.picked}\t${r.mega}\t${r.hazard}\t${r.pivot}\t${r.setup}\t${r.weather}\t${r.protect}\t${r.priority}\t${r.avgBst}`);
}
