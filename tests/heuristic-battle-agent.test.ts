import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent, damageRatio } from '../src/ai/heuristic-battle-agent.js';
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
      terrain: null,
      terrainTurnsLeft: 0,
      trickRoom: false,
      trickRoomTurnsLeft: 0,
      stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 },
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

describe('フィールドを考慮した技の評価', () => {
  const terrainPulse = () => createMove({
    name: 'だいちのはどう', type: 'normal', power: 50, accuracy: 100, pp: 10, category: 'special', terrainPulse: true,
  });
  const wideForce = () => createMove({
    name: 'ワイドフォース', type: 'psychic', power: 80, accuracy: 100, pp: 10, category: 'special', boostedByPsychicTerrain: true,
  });

  it('だいちのはどうはフィールド下でタイプが変わり威力2倍として評価される', () => {
    const user = makePokemon('User', ['water'], [terrainPulse()], { spa: 150 });
    // はがね相手: ノーマルでは等倍、サイコフィールド下のエスパーでは等倍、エレキなら等倍。
    // ここでは「はがね/かくとう」相手にノーマル(0.5) vs エスパー(2.0) の差が出ることを見る。
    const target = makePokemon('Target', ['fighting'], [tackle()]);
    const withoutField = damageRatio(user, target, terrainPulse());
    const withTerrain = damageRatio(user, target, terrainPulse(), {
      weather: null, weatherTurnsLeft: 0, terrain: 'psychic-terrain', terrainTurnsLeft: 5,
      trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 },
    });
    expect(withTerrain).toBeGreaterThan(withoutField * 3);
  });

  it('ワイドフォースはサイコフィールド下で1.5倍として評価される', () => {
    const user = makePokemon('User', ['psychic'], [wideForce()], { spa: 150 });
    const target = makePokemon('Target', ['normal'], [tackle()]);
    const withoutField = damageRatio(user, target, wideForce());
    const withTerrain = damageRatio(user, target, wideForce(), {
      weather: null, weatherTurnsLeft: 0, terrain: 'psychic-terrain', terrainTurnsLeft: 5,
      trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 },
    });
    expect(withTerrain / withoutField).toBeCloseTo(1.5, 1);
  });

  it('始動役（あめふらし等）を先頭に選ぶ', async () => {
    const setter = makePokemon('Setter', ['water'], [tackle()]);
    setter.ability = 'drizzle';
    const mega = makePokemon('Mega', ['water'], [tackle()]);
    mega.item = 'swampertite';
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const lead = await agent.selectLead([mega, setter]);
    expect(lead.name).toBe('Setter');
  });
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
