import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';
import { makeVectorEvaluator, valueInputs } from '../src/ai/value-function.js';
import type { TreeModel } from '../src/ai/value-function.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';
import { extractFeatures } from '../src/ai/features.js';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

// 調査用（一時）: 相手が X の試合で V の手を1手ずつ記録する。
const [treesPath, outPath, target = 'クエスピクシー構築', seedCountArg = '16'] = process.argv.slice(2);
const vector = makeVectorEvaluator(JSON.parse(readFileSync(treesPath!, 'utf8')) as TreeModel, treesPath!);
const evaluate = (context: BattleContext) => vector(valueInputs(context));
writeFileSync(outPath!, '');
const entries = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
const opponentEntry = entries.find((entry) => entry.name === target)!;
const seeds = splitSeeds('report').slice(0, Number(seedCountArg));

class Recorder implements BattleAgent {
  rows: object[] = [];
  constructor(private readonly inner: BattleAgent) {}
  selectLead(team: Parameters<BattleAgent['selectLead']>[0]) { return this.inner.selectLead(team); }
  async selectAction(context: BattleContext) {
    const decision = await this.inner.selectAction(context);
    const f = extractFeatures(context);
    const stages = context.opponent.statStages as unknown as Record<string, number>;
    this.rows.push({
      turn: context.turn, self: context.self.name, opp: context.opponent.name,
      oppBoost: Object.values(stages).reduce((s, v) => s + Math.max(0, v), 0),
      oppHp: context.opponent.currentHP / context.opponent.maxHP,
      action: decision.action.type === 'move' ? context.self.moves[decision.action.moveIndex]?.name : decision.action.type === 'switch' ? `→${context.selfTeam[decision.action.pokemonIndex]?.name}` : decision.action.type,
      damage_out: f.damage_out, damage_in: f.damage_in, v: evaluate(context),
    });
    return decision;
  }
}

async function main() {
  for (const entry of entries.filter((e) => e !== opponentEntry)) {
    for (const seed of seeds) {
      for (const valueIsA of [true, false]) {
        const [entryA, entryB] = valueIsA ? [entry, opponentEntry] : [opponentEntry, entry];
        const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
        const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
        const value = new Recorder(new ValueSearchBattleAgent(new SeededRandom(seed * 31 + (valueIsA ? 1 : 2)), { opponentMode: 'worst', trustMargin: 0.05, evaluate }));
        const baseline = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + (valueIsA ? 2 : 1)));
        const result = await runBattle(teamA, teamB, valueIsA ? value : baseline, valueIsA ? baseline : value,
          { maxTurns: 50, rng: new SeededRandom(seed * 31 + 3 + (valueIsA ? 0 : 500)), information: 'partial', leadA: teamA[0], leadB: teamB[0] });
        const points = result.winner === null ? 0.5 : result.winner === (valueIsA ? 0 : 1) ? 1 : 0;
        appendFileSync(outPath!, JSON.stringify({ build: entry.name, seed, valueIsA, points, turns: result.turns, oppTeam: (valueIsA ? teamB : teamA).map((p) => p.name), decisions: value.rows }) + '\n');
      }
    }
  }
}
void main();
