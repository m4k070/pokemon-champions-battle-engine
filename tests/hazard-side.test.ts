import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// 設置技は「相手の場」に置く。実装当初は自分の場に置いてしまい、
// 自分の交代出しがステロダメージを受けていた（相手の場には何も乗らない）。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (name: string, moves: ReturnType<typeof createMove>[]) =>
  new Pokemon({ name, types: ['normal'], ability: 'none', baseStats: stats, moves });

class Fixed implements BattleAgent {
  constructor(private readonly plan: Array<'hazard' | 'switch' | 'attack' | 'idle'>) {}
  async selectLead(team: Pokemon[]): Promise<Pokemon> { return team[0]!; }
  async selectAction(context: BattleContext) {
    const step = this.plan[context.turn - 1] ?? 'idle';
    if (step === 'switch' || context.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: 1 } };
    if (step === 'hazard') return { action: { type: 'move' as const, moveIndex: 0, target: 0 } };
    if (step === 'attack') return { action: { type: 'move' as const, moveIndex: 1, target: 0 } };
    return { action: { type: 'move' as const, moveIndex: 0, target: 0 } };
  }
}

describe('設置技の置き場所', () => {
  test('ステルスロックは相手の場に置かれ、自分の交代出しは傷つかない', async () => {
    const hazardMoves = () => [
      createMove({ name: 'ステルスロック', type: 'rock', power: 0, accuracy: 100, pp: 20, category: 'status', fieldEffect: 'stealth-rock' }),
      createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
    ];
    const teamA = [mon('a-hazard', hazardMoves()), mon('a-second', hazardMoves())];
    const teamB = [mon('b-first', hazardMoves()), mon('b-second', hazardMoves())];

    const result = await runBattle(
      teamA, teamB,
      new Fixed(['hazard', 'switch']),
      new Fixed(['attack', 'switch']),
      { maxTurns: 2, rng: new SeededRandom(5) },
    );
    const log = String(result.log);

    // 設置した側の交代出しはダメージを受けない
    expect(log).not.toMatch(/a-secondはステルスロックのダメージ/);
    // 設置された側の交代出しはダメージを受ける
    expect(log).toMatch(/b-secondはステルスロックのダメージ/);
  });
});
