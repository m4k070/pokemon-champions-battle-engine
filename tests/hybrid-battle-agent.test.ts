import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HybridBattleAgent, parseReply } from '../src/ai/hybrid-battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';

// ハイブリッド方策の検証。LLM呼び出しは ask を差し替えて固定する（ネットワーク不要）。

function makePokemon(name: string, moves: string[], types: ['normal'] | ['normal', 'flying'] = ['normal']): Pokemon {
  return new Pokemon({
    name,
    types,
    ability: 'none',
    baseStats: { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    moves: moves.map((moveName) => createMove({
      name: moveName, type: 'normal', power: 60, accuracy: 100, pp: 20, category: 'physical',
    })),
  });
}

function context(turn: number, selfHp = 0.8): BattleContext {
  const self = makePokemon('エース', ['たいあたり', 'ずつき']);
  const bench = makePokemon('受け', ['たいあたり']);
  // 見えている技は1つ。こちら（ノーマル）に抜群のでんげき → 「単一技の読み」の条件を満たす。
  const opponent = new Pokemon({
    name: '相手',
    types: ['electric'],
    ability: 'none',
    baseStats: { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    moves: [createMove({ name: 'でんげき', type: 'fighting', power: 60, accuracy: 100, pp: 20, category: 'physical' })],
  });
  self.currentHP = Math.floor(self.maxHP * selfHp);
  return {
    turn,
    self,
    selfTeam: [self, bench],
    opponent,
    opponentTeam: [opponent, makePokemon('相手2', ['ずつき'])],
    canMegaEvolve: false,
    mustSwitch: false,
    field: {
      weather: null, weatherTurnsLeft: 0,
      terrain: null, terrainTurnsLeft: 0,
      trickRoom: false, trickRoomTurnsLeft: 0,
      stealthRock: { self: false, opponent: false },
    },
    recentLog: [],
  };
}

describe('ハイブリッド方策', () => {
  test('相談条件を満たすとLLMに聞き、同意なら機械判断をそのまま使う', async () => {
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      hesitationMargin: -1, // 拮抗トリガーを切って単一技トリガーだけを見る
      ask: async () => '{"agree":true}',
    });
    const decision = await agent.selectAction(context(2));
    expect(agent.consultations).toHaveLength(1);
    expect(agent.consultations[0]!.agreed).toBe(true);
    expect(agent.consultations[0]!.reason).toBe('単一技の読み');
    expect(decision.action.type).toBe('move');
  });

  test('LLMが上書きすると合法手の中から上書き後の行動を返す', async () => {
    const expected = await new HeuristicBattleAgent(new SeededRandom(1)).selectAction(context(2));
    const different = expected.action.type === 'move' && expected.action.moveIndex === 0 ? 1 : 0;
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async () => `{"action":{"type":"move","moveIndex":${different}},"reason":"別の手"}`,
    });
    const decision = await agent.selectAction(context(2));
    expect(decision.action).toEqual({ type: 'move', moveIndex: different, target: 0 });
    expect(decision.reasoning).toContain('LLMが上書き');
    expect(agent.consultations[0]!.agreed).toBe(false);
  });

  test('LLMが失敗しても機械判断を採用する（ランダムに落とさない）', async () => {
    const rng = new SeededRandom(7);
    const heuristic = new HeuristicBattleAgent(new SeededRandom(7));
    const agent = new HybridBattleAgent(rng, {
      apiKey: 'dummy',
      ask: async () => { throw new Error('TimeoutError'); },
    });
    const ctx = context(2);
    const expected = await heuristic.selectAction(ctx);
    const decision = await agent.selectAction(ctx);
    expect(decision.action).toEqual(expected.action);
    expect(agent.consultations[0]!.error).toContain('TimeoutError');
  });

  test('非合法な上書きは捨てて機械判断を使う', async () => {
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async () => '{"action":{"type":"move","moveIndex":9}}',
    });
    const decision = await agent.selectAction(context(2));
    expect(decision.reasoning ?? '').not.toContain('LLMが上書き');
    expect(agent.consultations[0]!.agreed).toBe(true);
  });

  test('相談回数の上限を超えたら聞かない', async () => {
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      maxConsultations: 1,
      cooldownTurns: 0,
      ask: async () => '{"agree":true}',
    });
    await agent.selectAction(context(2));
    await agent.selectAction(context(5));
    expect(agent.consultations).toHaveLength(1);
  });

  test('既定のプロンプトは機械判断を伏せる（追従バイアスを避ける）', async () => {
    let seen = '';
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async (prompt) => { seen = prompt; return '{"agree":true}'; },
    });
    await agent.selectAction(context(2));
    expect(seen).not.toContain('機械的な判断');
    expect(seen).toContain('最善の行動');
  });

  test('機械判断と同じ行動を返したら同意として扱う', async () => {
    const expected = await new HeuristicBattleAgent(new SeededRandom(1)).selectAction(context(2));
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async () => JSON.stringify({ action: expected.action, reason: '同じ' }),
    });
    const decision = await agent.selectAction(context(2));
    expect(agent.consultations[0]!.agreed).toBe(true);
    expect(decision.reasoning ?? '').not.toContain('上書き');
  });

  test('上位2候補が僅差なら「判断が拮抗」で相談する', async () => {
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async () => '{"agree":true}',
    });
    // 同威力の2技 → スコア差がほぼ無い
    const decision = await agent.selectAction(context(2));
    expect(agent.consultations).toHaveLength(1);
    expect(agent.consultations[0]!.reason).toBe('判断が拮抗');
    expect(agent.consultations[0]!.margin).toBeLessThan(0.12);
    expect(decision.action.type).toBe('move');
  });

  test('上位が離れていれば相談しない', async () => {
    const strong = makePokemon('エース', ['たいあたり']);
    strong.moves.push(createMove({ name: 'ずつき', type: 'normal', power: 140, accuracy: 100, pp: 20, category: 'physical' }));
    strong.currentHP = Math.floor(strong.maxHP * 0.8);
    const bench = makePokemon('受け', ['たいあたり']);
    const opponent = makePokemon('相手', ['たいあたり']);
    opponent.moves.push(createMove({ name: 'ずつき', type: 'normal', power: 60, accuracy: 100, pp: 20, category: 'physical' }));
    const ctx: BattleContext = {
      turn: 1,
      self: strong,
      selfTeam: [strong, bench],
      opponent,
      opponentTeam: [opponent],
      canMegaEvolve: false,
      mustSwitch: false,
      field: {
        weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0,
        trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false },
      },
      recentLog: [],
    };
    const agent = new HybridBattleAgent(new SeededRandom(1), { apiKey: 'dummy', ask: async () => '{"agree":true}' });
    await agent.selectAction(ctx);
    expect(agent.consultations).toHaveLength(0);
  });

  test('LLMの自己申告の確信度を記録する', async () => {
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async () => '{"action":{"type":"move","moveIndex":0},"confidence":0.35,"reason":"迷う"}',
    });
    await agent.selectAction(context(2));
    expect(agent.consultations[0]!.confidence).toBeCloseTo(0.35, 5);
  });

  test('条件に当てはまらない序盤は相談しない', async () => {
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'dummy',
      ask: async () => '{"agree":true}',
    });
    const ctx = context(1);
    ctx.opponent.moves.push(createMove({ name: 'ずつき', type: 'normal', power: 60, accuracy: 100, pp: 20, category: 'physical' }));
    await agent.selectAction(ctx);
    expect(agent.consultations).toHaveLength(0);
  });

  test('parseReply はコードブロック付きの応答も読める', () => {
    const ctx = context(2);
    const action = parseReply('```json\n{"action":{"type":"switch","pokemonIndex":1}}\n```', ctx);
    expect(action).toEqual({ type: 'switch', pokemonIndex: 1 });
  });
});
