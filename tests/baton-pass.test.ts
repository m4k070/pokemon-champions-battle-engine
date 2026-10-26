import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// バトンタッチ: 交代先に能力変化が引き継がれる（本編仕様）。
// 実装前は pivot 指定すら無く、交代も能力引き継ぎも起きていなかった。

const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function makePokemon(name: string, moves: ReturnType<typeof createMove>[]): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves });
}

class Scripted implements BattleAgent {
  constructor(
    private readonly pick: (context: BattleContext) => number,
    private readonly benchIndex = 1,
  ) {}
  async selectLead(team: Pokemon[]): Promise<Pokemon> { return team[0]!; }
  async selectAction(context: BattleContext) {
    // 交代先を聞かれたら控えへ（pivot交代・瀕死交代の両方）。
    if (context.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: this.benchIndex } };
    return { action: { type: 'move' as const, moveIndex: this.pick(context), target: 0 } };
  }
}

describe('バトンタッチ', () => {
  test('積んだ能力ランクが交代先に引き継がれる', async () => {
    const passer = makePokemon('パサー', [
      createMove({ name: 'めいそう', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'SPATK', delta: 1 }, { stat: 'SPDEF', delta: 1 }] }),
      createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
    ]);
    const ace = makePokemon('エース', [createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' })]);
    const opponent = makePokemon('相手', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);

    const session = await BattleSession.start([passer, ace], [opponent], { rng: new SeededRandom(3) });

    // 1ターン目: めいそう（特攻・特防+1）
    await session.playTurn(new Scripted(() => 0), new Scripted(() => 0));
    expect(passer.statStages.SPATK).toBe(1);

    // 2ターン目: バトンタッチ → playTurn が交代先を聞いてくる
    await session.playTurn(new Scripted(() => 1), new Scripted(() => 0));

    const incoming = session.getContext(0).self;
    expect(incoming.name).toBe('エース');
    expect(incoming.statStages.SPATK).toBe(1);
    expect(incoming.statStages.SPDEF).toBe(1);
  });

  test('バトンタッチでない交代では能力ランクはリセットされる', async () => {
    const passer = makePokemon('パサー', [
      createMove({ name: 'めいそう', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'SPATK', delta: 1 }] }),
      createMove({ name: 'とんぼがえり', type: 'normal', power: 60, accuracy: 100, pp: 20, category: 'physical', pivot: true }),
    ]);
    const ace = makePokemon('エース', [createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' })]);
    const opponent = makePokemon('相手', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);

    const session = await BattleSession.start([passer, ace], [opponent], { rng: new SeededRandom(5) });
    await session.playTurn(new Scripted(() => 0), new Scripted(() => 0));
    await session.playTurn(new Scripted(() => 1), new Scripted(() => 0));

    const incoming = session.getContext(0).self;
    expect(incoming.name).toBe('エース');
    expect(incoming.statStages.SPATK).toBe(0);
  });
});
