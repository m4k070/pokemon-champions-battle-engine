import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';
import { makeVectorEvaluator, valueInputs } from '../src/ai/value-function.js';
import type { TreeModel } from '../src/ai/value-function.js';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

// 1手先読み（学習した V）vs 凍結ベースライン v1。側と乱数の割当を入れ替えて相殺する。
function wilson(wins: number, total: number): [number, number] {
  if (total === 0) return [0, 100];
  const p = wins / total;
  const z = 1.96;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [100 * (center - margin), 100 * (center + margin)];
}

async function main(): Promise<void> {
  // --split=tune|report|train を渡すと、その分割の seed を使う（調整と報告を混ぜない）。
  const splitArg = (process.argv.find((a) => a.startsWith('--split=')) ?? '--split=').split('=')[1] ?? '';
  const seedsFromSplit = splitArg === '' ? null : splitSeeds(splitArg as 'tune' | 'report' | 'train');
  const allSeeds = seedsFromSplit ?? Array.from({ length: Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=100').split('=')[1]) }, (_, i) => 101 + i);
  // --seedCount=N: 分割の先頭 N 個だけ使う（cross は組み合わせが多いので試合数を揃えるのに使う）。
  const seedCount = Number((process.argv.find((a) => a.startsWith('--seedCount=')) ?? '--seedCount=0').split('=')[1]);
  const seedList = seedCount > 0 ? allSeeds.slice(0, seedCount) : allSeeds;
  // --pairs=mirror（既定）: 同じ構築どうし。--pairs=cross: 違う構築どうしの全組み合わせ（側は入れ替えて両方）。
  const pairsMode = (process.argv.find((a) => a.startsWith('--pairs=')) ?? '--pairs=mirror').split('=')[1] ?? 'mirror';
  if (pairsMode !== 'mirror' && pairsMode !== 'cross') {
    console.error(`--pairs は mirror | cross のいずれか: ${pairsMode}`);
    process.exit(1);
  }
  // --involving=構築名の一部: その構築を含む組み合わせだけ（学習から外した構築の評価用）。
  const involving = (process.argv.find((a) => a.startsWith('--involving=')) ?? '--involving=').split('=')[1] ?? '';
  // --trees=木.json: src/ai/value-trees.json の代わりにこの木で探索する（worktree を作らずに比べる）。
  const treesPath = (process.argv.find((a) => a.startsWith('--trees=')) ?? '--trees=').split('=').slice(1).join('=');
  const vector = treesPath === '' ? null : makeVectorEvaluator(JSON.parse(readFileSync(treesPath, 'utf8')) as TreeModel, treesPath);
  const evaluate = vector === null ? undefined : (context: Parameters<typeof valueInputs>[0]) => vector(valueInputs(context));
  // --jsonl=出力先: 1試合1行（組み合わせ・seed・側・得点）を書く（組み合わせ別の集計用）。
  const jsonlPath = (process.argv.find((a) => a.startsWith('--jsonl=')) ?? '--jsonl=').split('=').slice(1).join('=');
  if (jsonlPath !== '') writeFileSync(jsonlPath, '');
  const builds = Number((process.argv.find((a) => a.startsWith('--builds=')) ?? '--builds=0').split('=')[1]);
  const margin = Number((process.argv.find((a) => a.startsWith('--margin=')) ?? '--margin=0').split('=')[1]);
  const rawMode = ((process.argv.find((a) => a.startsWith('--mode=')) ?? '--mode=belief').split('=')[1] ?? 'belief');
  const MODES = ['model', 'uniform', 'worst', 'maximin', 'belief'] as const;
  if (!MODES.includes(rawMode as (typeof MODES)[number])) {
    // 'maximin' 以外の未知の値が黙って 'uniform' 扱いになっていた（2026-10-25 に発見）。
    console.error(`--mode は ${MODES.join(' | ')} のいずれか: ${rawMode}`);
    process.exit(1);
  }
  const mode = rawMode as (typeof MODES)[number];
  let valueWins = 0, baselineWins = 0, draws = 0;
  const perBuild = new Map<string, { wins: number; total: number }>();
  const perOpponent = new Map<string, { wins: number; total: number }>();
  const started = Date.now();
  let games = 0;

  const only = (process.argv.find((a) => a.startsWith('--build=')) ?? '--build=').split('=')[1] ?? '';
  let entries = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
  if (only !== '') entries = entries.filter((entry) => entry.name.includes(only));
  entries = entries.slice(0, builds > 0 ? builds : undefined);
  const matchups: [(typeof entries)[number], (typeof entries)[number]][] = pairsMode === 'mirror'
    ? entries.map((entry) => [entry, entry])
    : entries.flatMap((entryA, i) => entries.slice(i + 1).map((entryB) => [entryA, entryB] as [typeof entryA, typeof entryB]));
  const selected = involving === ''
    ? matchups
    : matchups.filter(([entryA, entryB]) => entryA.name.includes(involving) || entryB.name.includes(involving));
  if (selected.length === 0) {
    console.error(`対象の組み合わせが無い: --involving=${involving}`);
    process.exit(1);
  }

  for (const [entryA, entryB] of selected) {
    for (const seed of seedList) {
      for (const valueIsA of [true, false]) {
        // ポケモンは試合中に書き換わるので、毎試合作り直す（使い回すと2試合目が0ターンで終わる）。
        const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
        const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
        const value = new ValueSearchBattleAgent(new SeededRandom(seed * 31 + (valueIsA ? 1 : 2)), { opponentMode: mode, trustMargin: margin, evaluate });
        const baseline = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + (valueIsA ? 2 : 1)));
        const result = await runBattle(
          teamA, teamB,
          valueIsA ? value : baseline,
          valueIsA ? baseline : value,
          { maxTurns: 50, rng: new SeededRandom(seed * 31 + 3 + (valueIsA ? 0 : 500)), information: 'partial', leadA: teamA[0], leadB: teamB[0] },
        );
        games++;
        // 構築ごとの集計は V 側の構築で数える（mirror では従来どおり）。cross は相手側の構築でも数える。
        const valueBuild = (valueIsA ? entryA : entryB).name;
        const opponentBuild = (valueIsA ? entryB : entryA).name;
        const stat = perBuild.get(valueBuild) ?? { wins: 0, total: 0 };
        const against = perOpponent.get(opponentBuild) ?? { wins: 0, total: 0 };
        stat.total++;
        against.total++;
        const points = result.winner === null ? 0.5 : result.winner === (valueIsA ? 0 : 1) ? 1 : 0;
        if (result.winner === null) draws++;
        else if (points === 1) valueWins++;
        else baselineWins++;
        stat.wins += points;
        against.wins += points;
        perBuild.set(valueBuild, stat);
        perOpponent.set(opponentBuild, against);
        if (jsonlPath !== '') {
          appendFileSync(jsonlPath, `${JSON.stringify({ valueBuild, opponentBuild, seed, valueIsA, points, turns: result.turns })}\n`);
        }
      }
    }
  }

  const decided = valueWins + baselineWins;
  const total = decided + draws;
  const score = valueWins + 0.5 * draws;
  const [low, high] = wilson(score, total);
  const seconds = (Date.now() - started) / 1000;
  if (treesPath !== '') console.log(`V: ${treesPath}`);
  console.log(`1手先読み(${mode}) vs ベースラインv1 [${pairsMode}${involving === '' ? '' : ` / ${involving} を含む`}]: ${total}試合（分 ${draws} = ${(100 * draws / Math.max(1, total)).toFixed(1)}%、${seconds.toFixed(0)}秒 / ${(seconds / Math.max(1, games)).toFixed(2)}秒毎試合）`);
  console.log(`1手先読み ${(100 * score / Math.max(1, total)).toFixed(1)}%（引き分け0.5勝）  95%CI [${low.toFixed(1)}, ${high.toFixed(1)}]`);
  for (const [name, stat] of perBuild) {
    console.log(`  ${name}: ${(100 * stat.wins / Math.max(1, stat.total)).toFixed(1)}% (${stat.wins.toFixed(1)}/${stat.total})`);
  }
  if (pairsMode === 'cross') {
    console.log('相手の構築別:');
    for (const [name, stat] of perOpponent) {
      console.log(`  vs ${name}: ${(100 * stat.wins / Math.max(1, stat.total)).toFixed(1)}% (${stat.wins.toFixed(1)}/${stat.total})`);
    }
  }
}

main();
