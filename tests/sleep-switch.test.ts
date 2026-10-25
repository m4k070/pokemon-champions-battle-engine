import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// 眠りは交代しても消えない（本編仕様）。場を離れると消えるのは「ねむけ」の方。
// ベンチにいる間は眠りターンも減らない。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (n: string, m: ReturnType<typeof createMove>[]) =>
  new Pokemon({ name: n, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves: m });

class Plan implements BattleAgent {
  constructor(private readonly steps: string[]) {}
  async selectLead(t: Pokemon[]): Promise<Pokemon> { return t[0]!; }
  async selectAction(ctx: BattleContext) {
    const step = this.steps[ctx.turn - 1] ?? 'idle';
    if (step === 'back') return { action: { type: 'switch' as const, pokemonIndex: 0 } };
    if (step === 'switch' || ctx.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: 1 } };
    return { action: { type: 'move' as const, moveIndex: 1, target: 0 } };
  }
}

const moves = () => [
  createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
  createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
];

describe('眠りと交代', () => {
  test('交代しても眠りは消えず、ベンチでは眠りターンが減らない', async () => {
    const a1 = mon('a1', moves());
    const a2 = mon('a2', moves());
    const b1 = mon('b1', moves());
    const b2 = mon('b2', moves());
    a1.applySleep(3);

    await runBattle([a1, a2], [b1, b2], new Plan(['switch', 'back']), new Plan(['idle', 'idle']), {
      maxTurns: 2, rng: new SeededRandom(3),
    });

    expect(a1.status).toBe('sleep');
    // 場に出ていた1ターン分だけ減る（3 → 2）。ベンチにいたターンは減らない。
    expect(a1.statusState).toMatchObject({ kind: 'sleep', turnsLeft: 2 });
  });

  test('ねむけは交代で消える（本編仕様）', async () => {
    const a1 = mon('a1', moves());
    const a2 = mon('a2', moves());
    const b1 = mon('b1', moves());
    const b2 = mon('b2', moves());
    a1.applyDrowsy(2);

    await runBattle([a1, a2], [b1, b2], new Plan(['switch']), new Plan(['idle']), {
      maxTurns: 1, rng: new SeededRandom(5),
    });

    expect(a1.isDrowsy).toBe(false);
    expect(a1.status).toBeNull();
  });
});
