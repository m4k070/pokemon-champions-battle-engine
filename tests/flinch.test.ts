import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// ひるみ（本編仕様）: 先に当てたときだけ、相手はそのターン動けない。せいしんりょくは防ぐ。

const stats = { HP: 200, ATK: 60, DEF: 100, SPATK: 60, SPDEF: 100, SPEED: 100 };

const mon = (name: string, speed: number, ability: Pokemon['ability'], moves: ReturnType<typeof createMove>[]): Pokemon =>
  new Pokemon({ name, types: ['normal'], ability, item: null, baseStats: { ...stats, SPEED: speed }, moves });

// 必ずひるませる技（確率100%）で挙動を固定する。
const sureFlinch = () =>
  createMove({ name: 'ひるませる技', type: 'dark', power: 40, accuracy: 100, pp: 30, category: 'physical', flinchChance: 100 });
const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' });

class Fixed implements BattleAgent {
  async selectLead(team: Pokemon[]): Promise<Pokemon> { return team[0]!; }
  async selectAction(_context: BattleContext) {
    return { action: { type: 'move' as const, moveIndex: 0, target: 0 } };
  }
}

async function firstTurnLog(fast: Pokemon, slow: Pokemon): Promise<string> {
  const result = await runBattle([fast], [slow], new Fixed(), new Fixed(), { maxTurns: 1, rng: new SeededRandom(1) });
  return String(result.log);
}

describe('ひるみ', () => {
  test('先に当てると相手はそのターン動けない', async () => {
    const log = await firstTurnLog(mon('速い', 200, 'none', [sureFlinch()]), mon('遅い', 10, 'none', [tackle()]));
    expect(log).toContain('遅いはひるんで技がだせない');
    expect(log).not.toContain('遅いのたいあたり');
  });

  test('後から当ててもひるまない', async () => {
    const log = await firstTurnLog(mon('速い', 200, 'none', [tackle()]), mon('遅い', 10, 'none', [sureFlinch()]));
    expect(log).toContain('速いのたいあたり');
    expect(log).not.toContain('ひるんで');
  });

  test('せいしんりょくはひるまない', async () => {
    const log = await firstTurnLog(mon('速い', 200, 'none', [sureFlinch()]), mon('遅い', 10, 'inner-focus', [tackle()]));
    expect(log).toContain('遅いのたいあたり');
  });
});
