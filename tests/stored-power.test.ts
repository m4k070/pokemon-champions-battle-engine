import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { runBattle } from '../src/battle-runner.js';
import { damageRatio } from '../src/ai/heuristic-battle-agent.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// アシストパワー: 能力上昇1段階につき威力+20（本編仕様）。
// クエスパトラ（加速＋めいそう）→バトンタッチ→ピクシー（アシストパワー）のコンボの主砲。

const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function mon(name: string, moves: ReturnType<typeof createMove>[]): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves });
}

class Scripted implements BattleAgent {
  constructor(private readonly pick: (turn: number) => number) {}
  async selectLead(team: Pokemon[]): Promise<Pokemon> { return team[0]!; }
  async selectAction(context: BattleContext) {
    if (context.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: 1 } };
    return { action: { type: 'move' as const, moveIndex: this.pick(context.turn), target: 0 } };
  }
}

describe('アシストパワー', () => {
  test('能力上昇が乗ると威力が上がる（エンジン）', async () => {
    const attacker = mon('ピクシー', [
      createMove({ name: 'めいそう', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'SPATK', delta: 1 }] }),
      createMove({ name: 'アシストパワー', type: 'normal', power: 20, accuracy: 100, pp: 10, category: 'special', storedPower: true }),
    ]);
    const opponent = mon('あいて', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);

    const result = await runBattle([attacker], [opponent], new Scripted((turn) => (turn >= 3 ? 1 : 0)), new Scripted(() => 0), {
      maxTurns: 3, rng: new SeededRandom(2),
    });
    // めいそう2回で特攻+2 → 威力 20 + 20*2 = 60
    expect(String(result.log)).toContain('アシストパワーの威力が60になった');
  });

  test('方策の見積もりでも威力上昇を反映する', () => {
    const attacker = mon('ピクシー', [createMove({ name: 'アシストパワー', type: 'normal', power: 20, accuracy: 100, pp: 10, category: 'special', storedPower: true })]);
    const defender = mon('あいて', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);
    const move = attacker.moves[0]!;
    const plain = damageRatio(attacker, defender, move);
    attacker.statStages.SPATK = 3;
    attacker.statStages.SPEED = 3;
    const boosted = damageRatio(attacker, defender, move);
    expect(boosted).toBeGreaterThan(plain);
  });
});
