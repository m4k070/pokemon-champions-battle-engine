import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';
import { fixedRandom } from './helpers/scripted-random.js';
import type { ItemName } from '../src/item-names.js';

// 検量線の前提に関わる2つの挙動を固定する。
//   1. 先発はエージェントの selectLead で決まる（team[0] 固定ではない）
//   2. 持ち物の回復・反動は場に出ているポケモンにだけ適用される（控えは回復しない）

function makePokemon(name: string, item: ItemName | null = null): Pokemon {
  return new Pokemon({
    name,
    types: ['normal'],
    ability: 'none',
    item,
    baseStats: { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    moves: [createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' })],
  });
}

// 先発を「チームの最後の1体」にするエージェント。
class LastLeadAgent implements BattleAgent {
  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return team[team.length - 1]!;
  }
  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const index = context.self.moves.findIndex((move) => move.pp > 0);
    if (index < 0) return { action: { type: 'forfeit' } };
    return { action: { type: 'move', moveIndex: index, target: 0 } };
  }
}

describe('先発の決定', () => {
  test('runBattle はエージェントの selectLead を尊重する', async () => {
    const teamA = [makePokemon('A1'), makePokemon('A2'), makePokemon('A3')];
    const teamB = [makePokemon('B1')];
    const result = await runBattle(teamA, teamB, new LastLeadAgent(), new RandomBattleAgent(new SeededRandom(1)), {
      maxTurns: 3,
      rng: new SeededRandom(2),
    });
    expect(String(result.log)).toContain('A3が場に出た');
  });

  test('leadA を明示するとそちらが優先される', async () => {
    const teamA = [makePokemon('A1'), makePokemon('A2')];
    const teamB = [makePokemon('B1')];
    const result = await runBattle(teamA, teamB, new LastLeadAgent(), new RandomBattleAgent(new SeededRandom(1)), {
      maxTurns: 3,
      leadA: teamA[0]!,
      rng: new SeededRandom(2),
    });
    expect(String(result.log)).toContain('A1が場に出た');
  });
});

describe('持ち物は場に出ているポケモンにだけ効く', () => {
  test('控えのたべのこしは回復しない', () => {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const active = makePokemon('Active');
    const bench = makePokemon('Bench', 'leftovers');
    bench.currentHP = Math.floor(bench.maxHP / 2);
    const foe = makePokemon('Foe');
    engine.setActivePokemon(0, active);
    engine.setActivePokemon(1, foe);
    const before = bench.currentHP;

    engine.endTurn([active, bench], [foe]);

    expect(bench.currentHP).toBe(before);
    expect(String(engine.getLog())).not.toContain('Benchはたべのこしで');
  });

  test('場に出ているポケモンのたべのこしは回復する', () => {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const active = makePokemon('Active', 'leftovers');
    active.currentHP = Math.floor(active.maxHP / 2);
    const foe = makePokemon('Foe');
    engine.setActivePokemon(0, active);
    engine.setActivePokemon(1, foe);
    const before = active.currentHP;

    engine.endTurn([active], [foe]);

    expect(active.currentHP).toBeGreaterThan(before);
  });
});
