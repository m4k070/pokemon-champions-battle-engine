import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import type { BattleSession } from '../src/battle-runner.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';
import { getLegalActions } from '../src/ai/battle-agent.js';
import type { AgentAction } from '../src/types.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { valueInputs } from '../src/ai/value-function.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';
import { appendFileSync, writeFileSync } from 'node:fs';

// 兄弟手の順位付けベンチマークの作成。木を差し替えずに「どの V がどれだけ正しく手を選べるか」を
// 数秒で測るためのデータを作る（採点は ~/data/pokemon-decisions/score_benchmark.py）。
//
// 1決定点について、候補手ごとに次の2つを保存する。
//   outcomes … 相手の各合法手で1ターン進めた後の局面の特徴量（V の1手先読み・uniform と同じ計算）。
//               決着なら 1/0、不正な手なら null。どの木でも、この平均がその木の V(候補手) になる。
//   qV1 / qV  … その手から最後まで打った勝率（共通乱数）。続きは自分側 v1 / 自分側 現行 V、相手は v1。
// 局面は 現行 V（uniform・margin 0）対 v1 の対戦から、tune 分割の seed で取る（report と重ねない）。
//
// 使い方:
//   npx tsx scripts/sibling-benchmark.ts --points=400 --shard=0 --shards=4 --out=<jsonl>
//   主な引数: --rolloutsV1=32 --rolloutsV=8 --every=0.25（決定点を拾う確率）--builds=6 --maxTurns=50

const arg = (name: string, fallback: string): string =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split('=')[1] ?? fallback;

const points = Number(arg('points', '400'));
const rolloutsV1 = Number(arg('rolloutsV1', '32'));
const rolloutsV = Number(arg('rolloutsV', '8'));
const every = Number(arg('every', '0.25'));
const buildsLimit = Number(arg('builds', '6'));
const maxTurns = Number(arg('maxTurns', '50'));
const shard = Number(arg('shard', '0'));
const shards = Number(arg('shards', '1'));
const out = arg('out', `${process.env.HOME}/.local/state/pokemon-champions/sibling-benchmark.jsonl`);

type Outcome = number | null | Record<string, number>;

interface Candidate {
  action: AgentAction;
  label: string;
  kind: 'move' | 'switch';
  category: string | null;
}

// 1手だけ指定し、その後（同じターン内の強制交代を含む）は先頭の合法手で流す。
// value-search-agent の ScriptedAgent と同じ挙動。
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

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

function candidatesOf(context: BattleContext): Candidate[] {
  const legal = getLegalActions(context);
  const candidates: Candidate[] = legal.moves.map((move) => ({
    action: { type: 'move', moveIndex: move.index, target: 0, megaEvolve: legal.canMegaEvolve || undefined },
    label: move.move.name,
    kind: 'move',
    category: move.move.category,
  }));
  for (const target of legal.switches) {
    candidates.push({ action: { type: 'switch', pokemonIndex: target.index }, label: `交代:${target.pokemon.name}`, kind: 'switch', category: null });
  }
  return candidates;
}

// value-search-agent の enumerateActions と同じ（相手の手にメガシンカは付けない）。
function opponentActions(context: BattleContext): AgentAction[] {
  const legal = getLegalActions(context);
  const actions: AgentAction[] = legal.moves.map((move) => ({ type: 'move' as const, moveIndex: move.index, target: 0 }));
  for (const target of legal.switches) actions.push({ type: 'switch', pokemonIndex: target.index });
  return actions;
}

async function lookahead(session: BattleSession, side: 0 | 1, action: AgentAction, opponent: AgentAction): Promise<Outcome> {
  const fork = session.fork();
  const mine = new ScriptedAgent(action);
  const theirs = new ScriptedAgent(opponent);
  try {
    if (side === 0) await fork.playTurn(mine, theirs);
    else await fork.playTurn(theirs, mine);
  } catch {
    return null;
  }
  if (fork.isFinished()) return fork.winner() === side ? 1 : 0;
  const features = valueInputs(fork.getContext(side));
  return Object.fromEntries(Object.entries(features).map(([k, v]) => [k, round(v)]));
}

// ある手を1ターン打ち、以後は続きの方策で決着まで打つ（相手は v1）。乱数は seed で固定（共通乱数）。
async function rollout(session: BattleSession, side: 0 | 1, action: AgentAction, seed: number, own: 'v1' | 'value'): Promise<number | null> {
  const fork = session.fork();
  fork.engine.rng = new SeededRandom(seed);
  const first = new ScriptedAgent(action);
  const firstOther = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 7));
  try {
    if (side === 0) await fork.playTurn(first, firstOther);
    else await fork.playTurn(firstOther, first);
  } catch {
    return null;
  }
  const mine: BattleAgent =
    own === 'value'
      ? new ValueSearchBattleAgent(new SeededRandom(seed * 31 + 11), { opponentMode: 'uniform', trustMargin: 0 })
      : new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 11));
  const other = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 13));
  let turns = 1;
  while (!fork.isFinished() && turns < maxTurns) {
    try {
      if (side === 0) await fork.playTurn(mine, other);
      else await fork.playTurn(other, mine);
    } catch {
      break;
    }
    turns++;
  }
  const winner = fork.winner();
  if (winner === null) return 0.5;
  return winner === side ? 1 : 0;
}

async function meanRollout(session: BattleSession, side: 0 | 1, action: AgentAction, seedBase: number, count: number, own: 'v1' | 'value'): Promise<number | null> {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < count; k++) {
    const result = await rollout(session, side, action, seedBase + k, own);
    if (result === null) return null;
    sum += result;
    n++;
  }
  return n === 0 ? null : sum / n;
}

class ProbeAgent implements BattleAgent {
  private readonly inner = new ValueSearchBattleAgent(new SeededRandom(1), { opponentMode: 'uniform', trustMargin: 0 });
  constructor(
    private readonly gameName: string,
    private readonly rng: SeededRandom,
    private readonly budget: { remaining: number },
    private readonly onPoint: (line: string) => void,
  ) {}

  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) {
    return this.inner.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const session = context.session;
    const side = context.side;
    if (session !== undefined && side !== undefined && !context.mustSwitch && this.budget.remaining > 0 && this.rng.next() < every) {
      const candidates = candidatesOf(context);
      const other = (side === 0 ? 1 : 0) as 0 | 1;
      const replies = opponentActions(session.fork().getContext(other));
      if (candidates.length >= 2 && replies.length > 0) {
        this.budget.remaining--;
        const seedBase = 70000 + context.turn * 997 + side * 31 + this.budget.remaining * 101;
        const rows = [];
        for (const candidate of candidates) {
          const outcomes: Outcome[] = [];
          for (const reply of replies) outcomes.push(await lookahead(session, side, candidate.action, reply));
          rows.push({
            label: candidate.label,
            kind: candidate.kind,
            category: candidate.category,
            outcomes,
            // 検算用: 現行 V でのエージェント自身の値。採点側で outcomes から出した値と一致するはず。
            vNow: await this.inner.valueOf(context, candidate.action),
            qV1: await meanRollout(session, side, candidate.action, seedBase, rolloutsV1, 'v1'),
            qV: await meanRollout(session, side, candidate.action, seedBase, rolloutsV, 'value'),
          });
        }
        this.onPoint(JSON.stringify({ game: this.gameName, side, turn: context.turn, candidates: rows }));
      }
    }
    return this.inner.selectAction(context);
  }
}

async function main(): Promise<void> {
  writeFileSync(out, '');
  const started = Date.now();
  const catalog = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
  const builds = Array.from({ length: Math.min(buildsLimit, catalog.length) }, (_, i) =>
    catalog[Math.floor((i * catalog.length) / Math.min(buildsLimit, catalog.length))]!,
  );
  const games: { entry: (typeof catalog)[number]; seed: number }[] = [];
  for (const seed of splitSeeds('tune')) for (const entry of builds) games.push({ entry, seed });
  const budget = { remaining: points };
  let written = 0;
  for (let index = shard; index < games.length && budget.remaining > 0; index += shards) {
    const { entry, seed } = games[index]!;
    const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
    const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
    const probe = new ProbeAgent(`${entry.name}#${seed}`, new SeededRandom(seed * 31 + 5), budget, (line) => {
      appendFileSync(out, `${line}\n`);
      written++;
    });
    const baseline = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + 2));
    // V の側は seed で交互にする（先手・後手の偏りを避ける）。
    const vFirst = seed % 2 === 0;
    await runBattle(teamA, teamB, vFirst ? probe : baseline, vFirst ? baseline : probe, {
      maxTurns,
      rng: new SeededRandom(seed * 31 + 3),
      information: 'partial',
      leadA: teamA[0],
      leadB: teamB[0],
    });
    console.log(`  ${written} 点 / ${((Date.now() - started) / 1000).toFixed(0)}秒`);
  }
  console.log(`決定点 ${written} / 出力 ${out} / ${((Date.now() - started) / 1000).toFixed(0)}秒`);
}

main();
