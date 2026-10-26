import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';
import { getLegalActions } from '../src/ai/battle-agent.js';
import type { AgentAction } from '../src/types.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';
import type { BattleSession } from '../src/battle-runner.js';
import { appendFileSync, writeFileSync } from 'node:fs';

// V の「兄弟手の順位付け」を、共通乱数のペア rollout で直接測る診断。
//
// 1決定点について、V が選んだ手と ベースラインv1 が選んだ手が違うとき、
// 両方の手から同じ乱数列で R 本ずつ最後まで打ち、勝率の差（ΔQ̂）を出す。
// 同時に V 自身の ΔV を取るので、
//   - P(ΔQ̂ > 0)         … V の選択が実際に勝率を上げているか
//   - 平均 regret        … max(Q̂) − Q̂(Vの手)（0 なら両手とも同等以上）
//   - Spearman(ΔV, ΔQ̂)  … V の差が実際の差を順位付けできているか
//   - 校正曲線（ΔV のビンごとの平均 ΔQ̂）
// が見える。ΔV は当たっているのに ΔQ̂ が乗らないなら、探索の使い方（trustMargin）か
// ラベルの意味（混合方策の価値）の問題。
//
// 使い方:
//   npx tsx scripts/rollout-diagnostic.ts --points=200 --rollouts=16 --mode=maximin
//   主な引数: --builds=N --seeds=N --points=N --rollouts=R --margin=<trustMargin>
//             --mode=worst|maximin|uniform|belief --maxTurns=50 --out=<jsonl>
//             --continuation=v1|value（2ターン目以降の自分側。v1 は両者ベースライン、
//               value は自分側を V（同じ mode/margin）・相手側を v1 にして、実戦と同じ構図で打つ）
//             --second-step（各診断点で V の手／v1 の手を1ターン打った後の局面で、もう一度
//               V の最善手と v1 の手を打ち比べる。V が「自分では打たない手の後」の局面でも
//               判断と局面価値を保てているかを見る）

const arg = (name: string, fallback: string): string =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split('=')[1] ?? fallback;

const points = Number(arg('points', '200'));
const rollouts = Number(arg('rollouts', '16'));
const buildsLimit = Number(arg('builds', '3'));
const seedsLimit = Number(arg('seeds', '20'));
const margin = Number(arg('margin', '0'));
const maxTurns = Number(arg('maxTurns', '50'));
const mode = arg('mode', 'maximin') as 'model' | 'uniform' | 'worst' | 'maximin' | 'belief';
const continuation = arg('continuation', 'v1');
if (continuation !== 'v1' && continuation !== 'value') throw new Error(`未知の --continuation=${continuation}`);
const secondStep = process.argv.includes('--second-step');
const out = arg('out', `${process.env.HOME}/.local/state/pokemon-champions/rollout-diagnostic.jsonl`);

interface Candidate {
  action: AgentAction;
  label: string;
  kind: 'move' | 'switch';
  category: string | null;
  value: number;
}

interface Point {
  game: string;
  side: 0 | 1;
  turn: number;
  build: string;
  chosen: string;
  baseline: string;
  kind: 'move' | 'switch';
  category: string | null;
  deltaV: number;
  vChosen: number;
  vBaseline: number;
  qChosen: number;
  qBaseline: number;
  deltaQ: number;
  drawChosen: number;
  drawBaseline: number;
  weather: number;
  rollouts: number;
  second?: { chosen: SecondSample[]; baseline: SecondSample[] };
}

// 1ターン目の後の局面で取った1標本。agree は V と v1 が同じ手を選んだ（ΔQ̂ = 0）。
interface SecondSample {
  agree: boolean;
  deltaV: number;
  deltaQ: number;
  vState: number; // V の最善手の値（＝その局面の V の価値予測）
  outcome: number; // V の最善手から打った結果（0 / 0.5 / 1）
}

const sameAction = (a: AgentAction, b: AgentAction): boolean => {
  if (a.type !== b.type) return false;
  if (a.type === 'move' && b.type === 'move') return a.moveIndex === b.moveIndex && (a.target ?? 0) === (b.target ?? 0);
  if (a.type === 'switch' && b.type === 'switch') return a.pokemonIndex === b.pokemonIndex;
  return true; // forfeit 同士
};

// 1手だけ指定し、その後は先頭の合法手で流す（強制交代は合法手の先頭）。
class ScriptedAgent implements BattleAgent {
  private pending: AgentAction | null;
  constructor(action: AgentAction | null) {
    this.pending = action;
  }
  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) {
    return team[0]!;
  }
  async selectAction(context: BattleContext): Promise<AgentDecision> {
    if (!context.mustSwitch && this.pending !== null) {
      const action = this.pending;
      this.pending = null;
      return { action };
    }
    const legal = getLegalActions(context);
    const target = legal.switches[0];
    if (target !== undefined) return { action: { type: 'switch', pokemonIndex: target.index } };
    const move = legal.moves[0];
    return { action: move === undefined ? { type: 'forfeit' } : { type: 'move', moveIndex: move.index, target: 0 } };
  }
}

// ある手を1ターン打ち、以後は継続方策で決着まで打つ。乱数は引数で固定（共通乱数）。
async function rollout(
  session: BattleSession,
  side: 0 | 1,
  action: AgentAction,
  seed: number,
): Promise<number | null> {
  const fork = session.fork();
  const engineRng = new SeededRandom(seed);
  fork.engine.rng = engineRng;
  const mine = new ScriptedAgent(action);
  const theirs = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 7));
  try {
    if (side === 0) await fork.playTurn(mine, theirs);
    else await fork.playTurn(theirs, mine);
  } catch {
    return null; // 不正な手
  }
  const own: BattleAgent =
    continuation === 'value'
      ? new ValueSearchBattleAgent(new SeededRandom(seed * 31 + 11), { opponentMode: mode, trustMargin: margin })
      : new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 11));
  const other = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 13));
  const agentA = side === 0 ? own : other;
  const agentB = side === 0 ? other : own;
  let turns = 1;
  while (!fork.isFinished() && turns < maxTurns) {
    try {
      await fork.playTurn(agentA, agentB);
    } catch {
      break;
    }
    turns++;
  }
  const winner = fork.winner();
  if (winner === null) return 0.5;
  return winner === side ? 1 : 0;
}

function mean(values: number[]): number {
  return values.length === 0 ? Number.NaN : values.reduce((s, v) => s + v, 0) / values.length;
}

// 順位相関（同順位は平均順位で処理）。
function spearman(xs: number[], ys: number[]): number {
  const rank = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(values.length).fill(0);
    let index = 0;
    while (index < order.length) {
      let end = index;
      while (end + 1 < order.length && order[end + 1]!.v === order[index]!.v) end++;
      const average = (index + end) / 2 + 1;
      for (let k = index; k <= end; k++) ranks[order[k]!.i] = average;
      index = end + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? Number.NaN : num / Math.sqrt(dx * dy);
}

function candidatesOf(context: BattleContext): Candidate[] {
  const legal = getLegalActions(context);
  const candidates: Candidate[] = [];
  for (const move of legal.moves) {
    candidates.push({
      action: { type: 'move', moveIndex: move.index, target: 0, megaEvolve: legal.canMegaEvolve || undefined },
      label: move.move.name,
      kind: 'move',
      category: move.move.category,
      value: Number.NaN,
    });
  }
  for (const target of legal.switches) {
    candidates.push({
      action: { type: 'switch', pokemonIndex: target.index },
      label: `交代:${target.pokemon.name}`,
      kind: 'switch',
      category: null,
      value: Number.NaN,
    });
  }
  return candidates;
}

function argmax(candidates: Candidate[]): number {
  let bestIndex = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i]!.value > candidates[bestIndex]!.value) bestIndex = i;
  }
  return bestIndex;
}

// 1ターン目に action を打った後の局面で、V の最善手と v1 の手を共通乱数で1本ずつ打ち比べる。
// 決着した・強制交代・V に意見が無い局面は null。
async function sampleSecond(
  session: BattleSession,
  side: 0 | 1,
  action: AgentAction,
  value: ValueSearchBattleAgent,
  seed: number,
): Promise<SecondSample | null> {
  const fork = session.fork();
  fork.engine.rng = new SeededRandom(seed);
  const mine = new ScriptedAgent(action);
  const theirs = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 7));
  try {
    if (side === 0) await fork.playTurn(mine, theirs);
    else await fork.playTurn(theirs, mine);
  } catch {
    return null;
  }
  if (fork.isFinished()) return null;
  const context = fork.getContext(side);
  if (context.mustSwitch) return null;
  const candidates = candidatesOf(context);
  if (candidates.length === 0) return null;
  for (const candidate of candidates) candidate.value = await value.valueOf(context, candidate.action);
  const bestIndex = argmax(candidates);
  const best = candidates[bestIndex]!;
  if (!Number.isFinite(best.value)) return null;
  const decision = await new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 17)).selectAction(context);
  const baselineIndex = candidates.findIndex((candidate) => sameAction(candidate.action, decision.action));
  const outcome = await rollout(fork, side, best.action, seed + 500);
  if (outcome === null) return null;
  if (baselineIndex < 0 || baselineIndex === bestIndex) {
    return { agree: true, deltaV: 0, deltaQ: 0, vState: best.value, outcome };
  }
  const other = await rollout(fork, side, candidates[baselineIndex]!.action, seed + 500);
  if (other === null) return null;
  return {
    agree: false,
    deltaV: best.value - candidates[baselineIndex]!.value,
    deltaQ: outcome - other,
    vState: best.value,
    outcome,
  };
}

class ProbeAgent implements BattleAgent {
  readonly records: Point[] = [];
  private readonly baseline = new HeuristicV1BattleAgent(new SeededRandom(17));
  constructor(
    private readonly value: ValueSearchBattleAgent,
    private readonly gameName: string,
    private readonly build: string,
    private readonly budget: { remaining: number },
    private readonly onPoint: (point: Point) => void,
  ) {}

  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) {
    return this.value.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const session = context.session;
    const side = context.side;
    if (session === undefined || side === undefined || context.mustSwitch) {
      return this.value.selectAction(context);
    }
    const candidates = candidatesOf(context);
    if (candidates.length < 2) return this.value.selectAction(context);

    for (const candidate of candidates) candidate.value = await this.value.valueOf(context, candidate.action);
    const bestIndex = argmax(candidates);
    const best = candidates[bestIndex]!;
    // 相手の合法手が列挙できず V が -Infinity を返した場合は診断しない（V に意見が無い）。
    if (!Number.isFinite(best.value)) return this.value.selectAction(context);
    if (this.budget.remaining <= 0) return { action: best.action };

    const baselineDecision = await this.baseline.selectAction(context);
    const baselineIndex = candidates.findIndex((candidate) => sameAction(candidate.action, baselineDecision.action));
    if (baselineIndex < 0 || baselineIndex === bestIndex) return { action: best.action };

    // ここが診断点。V の手と ベースラインの手を、同じ乱数列で R 本ずつ打つ。
    this.budget.remaining--;
    const base = candidates[baselineIndex]!;
    const seedBase = 90000 + this.records.length * 1000 + context.turn * 17 + side;
    const qChosen: number[] = [];
    const qBaseline: number[] = [];
    let drawChosen = 0;
    let drawBaseline = 0;
    for (let k = 0; k < rollouts; k++) {
      const a = await rollout(session, side, best.action, seedBase + k);
      const b = await rollout(session, side, base.action, seedBase + k);
      if (a === null || b === null) continue;
      qChosen.push(a);
      qBaseline.push(b);
      if (a === 0.5) drawChosen++;
      if (b === 0.5) drawBaseline++;
    }
    if (qChosen.length === 0) return { action: best.action };
    const point: Point = {
      game: this.gameName,
      side,
      turn: context.turn,
      build: this.build,
      chosen: best.label,
      baseline: base.label,
      kind: best.kind,
      category: best.category,
      deltaV: best.value - base.value,
      vChosen: best.value,
      vBaseline: base.value,
      qChosen: mean(qChosen),
      qBaseline: mean(qBaseline),
      deltaQ: mean(qChosen) - mean(qBaseline),
      drawChosen,
      drawBaseline,
      weather: context.field.weather !== null ? 1 : 0,
      rollouts: qChosen.length,
    };
    if (secondStep) {
      const second: { chosen: SecondSample[]; baseline: SecondSample[] } = { chosen: [], baseline: [] };
      for (let k = 0; k < rollouts; k++) {
        const a = await sampleSecond(session, side, best.action, this.value, seedBase + k);
        const b = await sampleSecond(session, side, base.action, this.value, seedBase + k);
        if (a !== null) second.chosen.push(a);
        if (b !== null) second.baseline.push(b);
      }
      point.second = second;
    }
    this.records.push(point);
    this.onPoint(point);
    return { action: best.action };
  }
}

async function main(): Promise<void> {
  writeFileSync(out, '');
  const started = Date.now();
  const seeds = splitSeeds('report').slice(0, seedsLimit);
  const catalog = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
  // 構築は等間隔に選ぶ（先頭だけだと膠着する構築に偏り、rollout が引き分けで埋まる）。
  const builds = Array.from({ length: Math.min(buildsLimit, catalog.length) }, (_, i) =>
    catalog[Math.floor((i * catalog.length) / Math.min(buildsLimit, catalog.length))]!,
  );
  const results: Point[] = [];
  const budget = { remaining: points };

  outer: for (const entry of builds) {
    for (const seed of seeds) {
      if (budget.remaining <= 0) break outer;
      const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const probe = new ProbeAgent(
        new ValueSearchBattleAgent(new SeededRandom(seed * 31 + 1), { opponentMode: mode, trustMargin: margin }),
        `${entry.name}#${seed}`,
        entry.name,
        budget,
        (point) => {
          results.push(point);
          appendFileSync(out, `${JSON.stringify(point)}\n`);
        },
      );
      const baseline = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 2));
      await runBattle(teamA, teamB, probe, baseline, {
        maxTurns,
        rng: new SeededRandom(seed * 31 + 3),
        information: 'partial',
        leadA: teamA[0],
        leadB: teamB[0],
      });
      if (results.length > 0 && results.length % 25 === 0) {
        console.log(`  ${results.length} 点 / ${((Date.now() - started) / 1000).toFixed(0)}秒`);
      }
    }
  }

  const n = results.length;
  const deltaQ = results.map((point) => point.deltaQ);
  const deltaV = results.map((point) => point.deltaV);
  const positive = deltaQ.filter((d) => d > 0).length;
  const zero = deltaQ.filter((d) => d === 0).length;
  const negative = deltaQ.filter((d) => d < 0).length;
  const regret = results.map((point) => Math.max(point.qChosen, point.qBaseline) - point.qChosen);
  const seconds = (Date.now() - started) / 1000;
  const drawRate =
    (mean(results.map((point) => point.drawChosen / Math.max(1, point.rollouts))) +
      mean(results.map((point) => point.drawBaseline / Math.max(1, point.rollouts)))) /
    2;

  console.log(`\n診断点 ${n} / rollout ${rollouts}本ずつ / mode=${mode} margin=${margin} continuation=${continuation} / ${seconds.toFixed(0)}秒`);
  console.log(`rollout の引き分け率 ${(100 * drawRate).toFixed(1)}%（0.5勝として数える）`);
  console.log(`V の手が実勝率で上回った割合 ${((100 * positive) / Math.max(1, n)).toFixed(1)}% / 同等 ${((100 * zero) / Math.max(1, n)).toFixed(1)}% / 下回った ${((100 * negative) / Math.max(1, n)).toFixed(1)}%`);
  console.log(`平均 ΔQ̂ ${(100 * mean(deltaQ)).toFixed(2)}pt / 平均 regret ${(100 * mean(regret)).toFixed(2)}pt`);
  console.log(`平均 ΔV ${(100 * mean(deltaV)).toFixed(2)}pt / Spearman(ΔV, ΔQ̂) ${spearman(deltaV, deltaQ).toFixed(3)}`);

  // 校正: ΔV のビンごとの平均 ΔQ̂（V の差が実際の差に比例しているか）
  const edges = [0, 0.02, 0.05, 0.1, 0.2, Infinity];
  console.log('ΔV ビン → 平均 ΔQ̂ (件数)');
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = results.filter((point) => point.deltaV > edges[i]! && point.deltaV <= edges[i + 1]!);
    if (inBin.length === 0) continue;
    console.log(`  ${(edges[i]! * 100).toFixed(0)}–${edges[i + 1] === Infinity ? '∞' : (edges[i + 1]! * 100).toFixed(0)}pt: ${(100 * mean(inBin.map((p) => p.deltaQ))).toFixed(2)}pt (${inBin.length})`);
  }

  // 行動クラス別
  const classes = new Map<string, Point[]>();
  for (const point of results) {
    const key = point.kind === 'switch' ? '交代' : point.category === 'status' ? '変化技' : '攻撃技';
    classes.set(key, [...(classes.get(key) ?? []), point]);
  }
  console.log('行動クラス別');
  for (const [key, rows] of classes) {
    const win = rows.filter((p) => p.deltaQ > 0).length;
    console.log(`  ${key}: ΔQ̂ ${(100 * mean(rows.map((p) => p.deltaQ))).toFixed(2)}pt / 上回り ${((100 * win) / rows.length).toFixed(1)}% (${rows.length}点)`);
  }
  const wet = results.filter((point) => point.weather === 1);
  if (wet.length > 0) {
    console.log(`  天候下: ΔQ̂ ${(100 * mean(wet.map((p) => p.deltaQ))).toFixed(2)}pt (${wet.length}点)`);
  }
  if (secondStep) {
    // 1ターン目に V の手／v1 の手を打った後の局面で、V の判断（2手目の ΔQ̂）と局面価値の較正を比べる。
    console.log('\n2手目（1ターン目の後の局面）');
    for (const branch of ['chosen', 'baseline'] as const) {
      const samples = results.flatMap((point) => point.second?.[branch] ?? []);
      const split = samples.filter((sample) => !sample.agree);
      const bias = mean(samples.map((sample) => sample.outcome - sample.vState));
      const brier = mean(samples.map((sample) => (sample.outcome - sample.vState) ** 2));
      console.log(
        `  ${branch === 'chosen' ? 'V の手の後' : 'v1 の手の後'}: 標本 ${samples.length} / 手が割れた ${((100 * split.length) / Math.max(1, samples.length)).toFixed(1)}%` +
          ` / 割れた所の ΔQ̂ ${(100 * mean(split.map((sample) => sample.deltaQ))).toFixed(2)}pt` +
          ` / Spearman(ΔV, ΔQ̂) ${spearman(split.map((sample) => sample.deltaV), split.map((sample) => sample.deltaQ)).toFixed(3)}` +
          ` / V 予測 ${(100 * mean(samples.map((sample) => sample.vState))).toFixed(1)}% → 実績 ${(100 * mean(samples.map((sample) => sample.outcome))).toFixed(1)}%` +
          `（偏り ${(100 * bias).toFixed(2)}pt, Brier ${brier.toFixed(4)}）`,
      );
    }
  }
  console.log(`\n生データ: ${out}`);
}

main();
