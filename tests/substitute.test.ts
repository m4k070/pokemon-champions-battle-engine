import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// みがわりは相手から受ける変化技を防ぐ（本編仕様）。
// 実装当初は攻撃技しか吸収せず、あくび・でんじはが素通りしていた。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (n: string, m: ReturnType<typeof createMove>[], speed = 100) =>
  new Pokemon({ name: n, types: ['normal'], ability: 'none', item: null, baseStats: { ...stats, SPEED: speed }, moves: m });

class Plan implements BattleAgent {
  constructor(private readonly steps: string[]) {}
  async selectLead(t: Pokemon[]): Promise<Pokemon> { return t[0]!; }
  async selectAction(ctx: BattleContext) {
    const step = this.steps[ctx.turn - 1] ?? 'idle';
    if (step === 'switch' || ctx.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: 1 } };
    const index = step === 'sub' ? 0 : step === 'yawn' ? 1 : step === 'twave' ? 2 : step === 'hazard' ? 3 : step === 'dance' ? 4 : 5;
    return { action: { type: 'move' as const, moveIndex: index, target: 0 } };
  }
}

const moves = () => [
  createMove({ name: 'みがわり', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', createsSubstitute: true }),
  createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
  createMove({ name: 'でんじは', type: 'electric', power: 0, accuracy: 100, pp: 20, category: 'status', status: 'paralysis' }),
  createMove({ name: 'ステルスロック', type: 'rock', power: 0, accuracy: 100, pp: 20, category: 'status', fieldEffect: 'stealth-rock' }),
  createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
  createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
];

describe('みがわり', () => {
  test('相手の変化技（あくび・でんじは）を防ぐ', async () => {
    // A を速くして、みがわりを先に張る（同速だと あくび が先に通ってしまう）。
    const a = mon('A', moves(), 150);
    const b = mon('B', moves(), 80);
    await runBattle([a], [b], new Plan(['sub', 'idle']), new Plan(['yawn', 'twave']), {
      maxTurns: 2, rng: new SeededRandom(3),
    });
    expect(a.isDrowsy).toBe(false);
    expect(a.status).toBeNull();
  });

  test('場に置く技（ステルスロック）は防がない', async () => {
    // 相手（B）の場に設置される
    const c = mon('C', moves(), 150);
    const d = mon('D', moves(), 80);
    const result = await runBattle([c], [d], new Plan(['sub']), new Plan(['hazard']), {
      maxTurns: 1, rng: new SeededRandom(7),
    });
    expect(String(result.log)).toContain('ステルスロック');
  });

  test('自分の能力を上げる技は防がない', async () => {
    const a = mon('A', moves());
    const b = mon('B', moves());
    await runBattle([a], [b], new Plan(['sub']), new Plan(['dance']), {
      maxTurns: 1, rng: new SeededRandom(11),
    });
    expect(b.statStages.ATK).toBe(2);
  });
});
