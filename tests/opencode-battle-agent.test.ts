import { OpenCodeBattleAgent, buildBattlePrompt } from '../src/ai/opencode-battle-agent.js';
import { getLegalActions } from '../src/ai/battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';

function makePokemon(overrides: { moves?: Move[]; currentHP?: number } = {}): Pokemon {
  return new Pokemon({
    name: 'Garchomp',
    types: ['dragon', 'ground'],
    ability: 'rough-skin',
    item: null,
    baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    currentHP: overrides.currentHP,
    moves: overrides.moves ?? [
      new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10 }),
      new Move({ name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 10 }),
    ],
  });
}

function makeContext(overrides: Partial<BattleContext> = {}): BattleContext {
  const self = overrides.self ?? makePokemon();
  const bench = makePokemon();
  return {
    turn: 3,
    self,
    selfTeam: overrides.selfTeam ?? [self, bench],
    opponent: overrides.opponent ?? makePokemon(),
    opponentTeam: overrides.opponentTeam ?? [overrides.opponent ?? makePokemon()],
    canMegaEvolve: overrides.canMegaEvolve ?? false,
    mustSwitch: overrides.mustSwitch ?? false,
    field: overrides.field ?? {
      weather: 'sand',
      weatherTurnsLeft: 3,
      trickRoom: false,
      trickRoomTurnsLeft: 0,
      stealthRock: { self: true, opponent: false },
    },
    recentLog: overrides.recentLog ?? ['ガブリアスが場に出た！', 'カバルドンのじしん'],
  };
}

function mockToolResponse(args: object) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return {
        choices: [
          { message: { tool_calls: [{ function: { name: 'choose_action', arguments: JSON.stringify(args) } }] } },
        ],
      };
    },
  } as Response;
}

describe('buildBattlePrompt', () => {
  test('includes HP%, moves with PP, and field state', () => {
    const context = makeContext();
    const prompt = buildBattlePrompt(context);

    expect(prompt).toContain('ターン3');
    expect(prompt).toContain('砂嵐');
    expect(prompt).toContain('ステルスロック: 自分の場=あり');
    expect(prompt).toContain('earthquake');
    expect(prompt).toContain('PP:10/10');
  });

  test('marks PP-exhausted moves as unselectable', () => {
    const self = makePokemon({
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 0 }),
        new Move({ name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 5 }),
      ],
    });
    const prompt = buildBattlePrompt(makeContext({ self, selfTeam: [self] }));

    expect(prompt).toContain('[0] earthquake');
    expect(prompt.split('\n').find((l) => l.includes('[0] earthquake'))).toContain('選択不可');
  });
});

describe('OpenCodeBattleAgent', () => {
  const originalEnv = process.env.OPENCODE_API_KEY;

  afterEach(() => {
    process.env.OPENCODE_API_KEY = originalEnv;
  });

  test('throws when no API key is available', () => {
    delete process.env.OPENCODE_API_KEY;
    expect(() => new OpenCodeBattleAgent()).toThrow('OpenCode APIキー');
  });

  test('returns the LLM-chosen legal move with its reasoning', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      mockToolResponse({ reasoning: 'こだわりスカーフ持ちなので確定数で押し切る', actionType: 'move', moveIndex: 1 })
    );
    const agent = new OpenCodeBattleAgent({ apiKey: 'test-key', fetchFn });

    const decision = await agent.selectAction(makeContext());

    expect(decision.action).toEqual({ type: 'move', moveIndex: 1, target: 0 });
    expect(decision.reasoning).toContain('確定数');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  test('falls back to a random legal action when the LLM keeps returning illegal moves', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      // moveIndex 99 は存在しない、非合法な応答
      mockToolResponse({ reasoning: '存在しない技を選ぶ', actionType: 'move', moveIndex: 99 })
    );
    const agent = new OpenCodeBattleAgent({ apiKey: 'test-key', fetchFn, maxRetries: 1 });

    const context = makeContext();
    const decision = await agent.selectAction(context);

    const legal = getLegalActions(context);
    expect(fetchFn).toHaveBeenCalledTimes(2); // 初回 + リトライ1回
    expect(decision.reasoning).toContain('フォールバック');
    const action = decision.action;
    if (action.type === 'move') {
      expect(legal.moves.some((m) => m.index === action.moveIndex)).toBe(true);
    }
  });

  test('falls back when the HTTP call itself fails', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' } as Response);
    const agent = new OpenCodeBattleAgent({ apiKey: 'test-key', fetchFn, maxRetries: 0 });

    const decision = await agent.selectAction(makeContext());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(decision.reasoning).toContain('フォールバック');
  });
});
