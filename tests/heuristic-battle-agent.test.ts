import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';
import type { MoveData, TypeName } from '../src/types.js';

// 方策エージェントの単体検証。
// 「相性・状況に応じて技を選び分けるか」だけを見る（勝率は calibrate.ts の担当）。

function makePokemon(
  name: string,
  types: TypeName[],
  moves: MoveData[],
  overrides: Partial<{ atk: number; spa: number; def: number; spd: number; speed: number; hp: number }> = {},
): Pokemon {
  return new Pokemon({
    name,
    types,
    ability: 'none',
    item: null,
    baseStats: {
      HP: overrides.hp ?? 150,
      ATK: overrides.atk ?? 100,
      DEF: overrides.def ?? 100,
      SPATK: overrides.spa ?? 100,
      SPDEF: overrides.spd ?? 100,
      SPEED: overrides.speed ?? 100,
    },
    moves,
    level: 50,
  });
}

function makeContext(self: Pokemon, opponent: Pokemon, overrides: Partial<BattleContext> = {}): BattleContext {
  return {
    turn: 1,
    self,
    selfTeam: [self],
    opponent,
    opponentTeam: [opponent],
    canMegaEvolve: false,
    mustSwitch: false,
    field: {
      weather: null,
      weatherTurnsLeft: 0,
      trickRoom: false,
      trickRoomTurnsLeft: 0,
      stealthRock: { self: false, opponent: false },
    },
    recentLog: [],
    ...overrides,
  };
}

const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' });
const thunderbolt = () => createMove({ name: '10まんボルト', type: 'electric', power: 90, accuracy: 100, pp: 15, category: 'special' });
const earthquake = () => createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' });
const swordsDance = () => createMove({
  name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status',
  selfStatChange: [{ stat: 'ATK', delta: 2 }],
});
const stealthRock = () => createMove({
  name: 'ステルスロック', type: 'rock', power: 0, accuracy: 100, pp: 20, category: 'status',
  fieldEffect: 'stealth-rock',
});
const recover = () => createMove({
  name: 'なまける', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status',
  selfHealPercent: 0.5,
});

describe('HeuristicBattleAgent', () => {
  it('相性の良い技を選ぶ（でんき vs みず）', async () => {
    const self = makePokemon('Self', ['normal'], [tackle(), thunderbolt()], { spa: 200 });
    const opponent = makePokemon('Opp', ['water'], [tackle()]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(makeContext(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
  });

  it('無効タイプの技は選ばない（ノーマル vs ゴースト）', async () => {
    const self = makePokemon('Self', ['normal'], [tackle(), earthquake()]);
    const opponent = makePokemon('Opp', ['ghost'], [tackle()]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(makeContext(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
  });

  it('能力ランクが上限なら積み技を撃たない', async () => {
    const self = makePokemon('Self', ['normal'], [swordsDance(), tackle()]);
    self.statStages.ATK = 6;
    const opponent = makePokemon('Opp', ['normal'], [tackle()]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(makeContext(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
  });

  it('ステロが未設置なら設置を優先する（決定打が無い相手）', async () => {
    const self = makePokemon('Self', ['normal'], [tackle(), stealthRock()]);
    // ゴーストにはノーマル技が通らないので、実質ステロしか打つ手がない。
    const opponent = makePokemon('Opp', ['ghost'], [tackle()]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(makeContext(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
  });

  it('ステロが設置済みなら撃たない', async () => {
    const self = makePokemon('Self', ['normal'], [tackle(), stealthRock()]);
    const opponent = makePokemon('Opp', ['normal'], [tackle()]);
    const context = makeContext(self, opponent);
    context.field.stealthRock.opponent = true;
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context);
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 0 });
  });

  it('HPが満タンなら回復技を撃たない', async () => {
    const self = makePokemon('Self', ['normal'], [recover(), tackle()]);
    const opponent = makePokemon('Opp', ['normal'], [tackle()]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(makeContext(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
  });

  it('技が全て使えなければ交代する', async () => {
    const self = makePokemon('Self', ['normal'], [tackle()]);
    const bench = makePokemon('Bench', ['water'], [tackle()]);
    const opponent = makePokemon('Opp', ['normal'], [tackle()]);
    self.moves[0]!.pp = 0;
    const context = makeContext(self, opponent, { selfTeam: [self, bench], mustSwitch: true });
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context);
    expect(decision.action).toMatchObject({ type: 'switch', pokemonIndex: 1 });
  });

  it('メガシンカ可能なら技に添えて宣言する', async () => {
    const self = makePokemon('Self', ['normal'], [tackle()]);
    const opponent = makePokemon('Opp', ['normal'], [tackle()]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(makeContext(self, opponent, { canMegaEvolve: true }));
    expect(decision.action).toMatchObject({ type: 'move', megaEvolve: true });
  });

  it('同じ状況なら同じ手を選ぶ（seed固定で再現）', async () => {
    const build = () => {
      const self = makePokemon('Self', ['normal'], [tackle(), earthquake()]);
      const opponent = makePokemon('Opp', ['normal'], [tackle()]);
      return makeContext(self, opponent);
    };
    const first = await new HeuristicBattleAgent(new SeededRandom(7)).selectAction(build());
    const second = await new HeuristicBattleAgent(new SeededRandom(7)).selectAction(build());
    expect(first.action).toEqual(second.action);
  });
});
