import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { Pokemon } from './pokemon.js';
import { Move } from './move.js';
import { BattleSession, BattleHistory } from './battle-runner.js';
import { RandomBattleAgent } from './ai/battle-agent.js';
import type { AgentDecision } from './ai/battle-agent.js';
import type { AgentAction, TypeName } from './types.js';

// このMCPサーバーは「ルール判定係」に徹する。行動を決めるのはMCPクライアント
// （このサーバーを呼び出すLLM/人間）であり、サーバー側でLLMを呼ぶことはしない。
// クライアントはget_battle_stateで盤面を確認し、apply_turn/apply_forced_switchに
// 決定済みの行動を渡す。actionA/actionBに"auto"を渡した陣営だけはRandomBattleAgentが
// 代わりに決める（対戦相手をランダムにしたい場合向け）。

const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;

const TypeNameSchema = z.enum(TYPE_NAMES);
const MoveCategorySchema = z.enum(['physical', 'special', 'status']);
const StatusConditionSchema = z.enum(['sleep', 'poison', 'burn', 'paralysis', 'freeze', 'badly-poisoned']);
const FieldEffectSchema = z.enum(['tailwind', 'trick-room', 'reflect']);
const StatStageKeySchema = z.enum(['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']);

const BaseStatsSchema = z.object({
  HP: z.number().int().positive(),
  ATK: z.number().int().nonnegative(),
  DEF: z.number().int().nonnegative(),
  SPATK: z.number().int().nonnegative(),
  SPDEF: z.number().int().nonnegative(),
  SPEED: z.number().int().nonnegative(),
});

// 上限（1能力32・合計66）はStatPointSystem.validateStatPointsが検証するため、ここでは非負整数のみ見る。
const StatPointsSchema = z.object({
  HP: z.number().int().nonnegative().optional(),
  ATK: z.number().int().nonnegative().optional(),
  DEF: z.number().int().nonnegative().optional(),
  SPATK: z.number().int().nonnegative().optional(),
  SPDEF: z.number().int().nonnegative().optional(),
  SPEED: z.number().int().nonnegative().optional(),
});

const MoveInputSchema = z.object({
  name: z.string(),
  type: TypeNameSchema,
  power: z.number().int().nonnegative(),
  accuracy: z.number().int().min(0).max(100).optional(),
  pp: z.number().int().nonnegative(),
  maxPP: z.number().int().nonnegative().optional(),
  category: MoveCategorySchema.optional(),
  status: StatusConditionSchema.nullable().optional(),
  priority: z.number().int().optional(),
  effectChance: z.number().nullable().optional(),
  fieldEffect: FieldEffectSchema.nullable().optional(),
  secondaryEffect: z.object({ status: StatusConditionSchema, chance: z.number().min(0).max(100) }).nullable().optional(),
  selfStatChange: z.array(z.object({ stat: StatStageKeySchema, delta: z.number().int() })).nullable().optional(),
  targetStatChange: z.array(z.object({ stat: StatStageKeySchema, delta: z.number().int(), chance: z.number().min(0).max(100) })).nullable().optional(),
  inflictsSeed: z.boolean().optional(),
  weatherHeal: z.boolean().optional(),
  multiHit: z.boolean().optional(),
  pivot: z.boolean().optional(),
  contact: z.boolean().optional(),
  restoresShieldForm: z.boolean().optional(),
});

const PokemonInputSchema = z.object({
  name: z.string(),
  types: z.array(TypeNameSchema).min(1).max(2),
  ability: z.string(),
  item: z.string().nullable(),
  baseStats: BaseStatsSchema,
  // 能力ポイント（1ポイント=実数値1。1能力32・合計66が上限）。省略した能力は無振り。
  statPoints: StatPointsSchema.optional(),
  // 性格名（「わんぱく」等のひらがな表記、「腕白」等の漢字表記のどちらでも可）。省略時は無補正。
  nature: z.string().nullable().optional(),
  moves: z.array(MoveInputSchema).min(1).max(4),
  currentHP: z.number().int().nonnegative().optional(),
  status: StatusConditionSchema.nullable().optional(),
  // フォルムチェンジ（バトルスイッチ等）。現在のフォルム名と、フォルム別種族値。
  form: z.string().optional(),
  formStats: z.record(z.string(), BaseStatsSchema).optional(),
});

const ConcreteActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    moveIndex: z.number().int().nonnegative(),
    megaEvolve: z.boolean().optional(),
  }),
  z.object({ type: z.literal('switch'), pokemonIndex: z.number().int().nonnegative() }),
  z.object({ type: z.literal('forfeit') }),
]);

const ActionInputSchema = z.union([ConcreteActionSchema, z.literal('auto')]);

type ActionInput = z.infer<typeof ActionInputSchema>;

interface StoredSession {
  history: BattleHistory;
}

function buildPokemon(spec: z.infer<typeof PokemonInputSchema>): Pokemon {
  return new Pokemon({
    name: spec.name,
    types: [...spec.types] as TypeName[],
    ability: spec.ability,
    item: spec.item,
    baseStats: spec.baseStats,
    statPoints: spec.statPoints,
    nature: spec.nature ?? null,
    currentHP: spec.currentHP,
    status: spec.status ?? null,
    form: spec.form,
    formStats: spec.formStats,
    moves: spec.moves.map((move) => new Move(move)),
  });
}

function pokemonView(pokemon: Pokemon) {
  return {
    name: pokemon.name,
    types: pokemon.types,
    ability: pokemon.ability,
    item: pokemon.item,
    status: pokemon.status,
    statStages: { ...pokemon.statStages },
    toxicCounter: pokemon.toxicCounter,
    isSeeded: pokemon.isSeeded,
    lockedMove: pokemon.lockedMove,
    isFainted: pokemon.isFainted,
    currentHP: pokemon.currentHP,
    maxHP: pokemon.maxHP,
    hpPercent: Math.round((pokemon.currentHP / pokemon.maxHP) * 100),
    moves: pokemon.moves.map((move, index) => ({
      index,
      name: move.name,
      type: move.type,
      category: move.category,
      power: move.power,
      accuracy: move.accuracy,
      pp: move.pp,
      maxPP: move.maxPP,
      pivot: move.pivot ?? false,
    })),
  };
}

function stateView(stored: StoredSession) {
  const { session } = stored.history;
  return {
    turn: session.engine.turn,
    weather: session.engine.weather,
    weatherTurnsLeft: session.engine.weatherTurnsLeft,
    trickRoom: session.engine.trickRoom,
    trickRoomTurnsLeft: session.engine.trickRoomTurnsLeft,
    stealthRock: { ...session.engine.field.stealthRock },
    tailwind: { ...session.engine.field.tailwind },
    reflect: { ...session.engine.field.reflect },
    teamA: session.teamA.map(pokemonView),
    teamB: session.teamB.map(pokemonView),
    activeIndexA: session.teamA.indexOf(session.activeA),
    activeIndexB: session.teamB.indexOf(session.activeB),
    canMegaEvolveSide0: session.megaEvolutionSystem.canMegaEvolve(session.activeA),
    canMegaEvolveSide1: session.megaEvolutionSystem.canMegaEvolve(session.activeB),
    needsForcedSwitchSide0: session.needsForcedSwitch(0),
    needsForcedSwitchSide1: session.needsForcedSwitch(1),
    needsPivotSwitchSide0: session.needsPivotSwitch(0),
    needsPivotSwitchSide1: session.needsPivotSwitch(1),
    isTurnComplete: session.isTurnComplete(),
    isFinished: session.isFinished(),
    winner: session.isFinished() ? session.winner() : null,
    canUndo: stored.history.canUndo(),
    canRedo: stored.history.canRedo(),
  };
}

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  };
}

async function handle(fn: () => Promise<unknown> | unknown): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}

// テストからも呼べるよう、サーバー構築（ツール登録）と起動（stdio接続）を分離している。
// 呼び出すたびにセッションストアを新しく持つ、独立したサーバーインスタンスを返す。
export function createBattleServer(): McpServer {
  const sessions = new Map<string, StoredSession>();
  const randomAgent = new RandomBattleAgent();

  function requireSession(sessionId: string): StoredSession {
    const stored = sessions.get(sessionId);
    if (!stored) {
      throw new Error(`セッションが見つかりません: ${sessionId}`);
    }
    return stored;
  }

  async function resolveDecision(
    input: ActionInput,
    side: 0 | 1,
    session: BattleSession,
    reasoning: string | undefined
  ): Promise<AgentDecision> {
    if (input === 'auto') {
      return randomAgent.selectAction(session.getContext(side));
    }
    return { action: input as AgentAction, reasoning };
  }

  const server = new McpServer({ name: 'pokemon-champions-battle-engine', version: '1.0.0' });

  server.registerTool(
    'start_battle',
    {
      description:
        '新しいバトルセッションを開始する。行動の決定は行わず、盤面の初期化だけを行う。'
        + 'sessionIdを覚えておき、以降の呼び出しに渡すこと。',
      inputSchema: {
        teamA: z.array(PokemonInputSchema).min(1).max(6),
        teamB: z.array(PokemonInputSchema).min(1).max(6),
        leadIndexA: z.number().int().nonnegative().optional(),
        leadIndexB: z.number().int().nonnegative().optional(),
      },
    },
    ({ teamA, teamB, leadIndexA, leadIndexB }) =>
      handle(async () => {
        const pokemonA = teamA.map(buildPokemon);
        const pokemonB = teamB.map(buildPokemon);

        const session = await BattleSession.start(pokemonA, pokemonB, {
          leadA: leadIndexA !== undefined ? pokemonA[leadIndexA] : undefined,
          leadB: leadIndexB !== undefined ? pokemonB[leadIndexB] : undefined,
        });

        const sessionId = randomUUID();
        const stored: StoredSession = { history: new BattleHistory(session) };
        sessions.set(sessionId, stored);

        return { sessionId, state: stateView(stored) };
      })
  );

  server.registerTool(
    'get_battle_state',
    {
      description: '指定したセッションの現在の盤面状態（両陣営のHP・技PP・天候・ステルスロック等）を取得する。',
      inputSchema: { sessionId: z.string() },
    },
    ({ sessionId }) => handle(() => stateView(requireSession(sessionId)))
  );

  server.registerTool(
    'apply_forced_switch',
    {
      description:
        '瀕死になったポケモンの交代先を指定する。needsForcedSwitchSide0/1がtrueの側でのみ有効。'
        + '両陣営とも瀕死交代が不要な状態でapply_turnを呼ぶ前に、必要な側から先に呼ぶこと。',
      inputSchema: {
        sessionId: z.string(),
        side: z.union([z.literal(0), z.literal(1)]),
        pokemonIndex: z.number().int().nonnegative(),
        reasoning: z.string().optional(),
      },
    },
    ({ sessionId, side, pokemonIndex, reasoning }) =>
      handle(() => {
        const stored = requireSession(sessionId);
        const { session } = stored.history;

        stored.history.checkpoint();
        session.beginTurn();
        session.applyForcedSwitch(side, { action: { type: 'switch', pokemonIndex }, reasoning });

        return stateView(stored);
      })
  );

  server.registerTool(
    'apply_turn',
    {
      description:
        '両陣営の行動を同時に適用し、1ターン進める。行動には具体的な行動'
        + '（{type:"move",moveIndex,megaEvolve?} / {type:"switch",pokemonIndex} / {type:"forfeit"}）か、'
        + '"auto"（その陣営はRandomBattleAgentに任せる）を指定する。'
        + 'megaEvolve:trueはcanMegaEvolveSide0/1がtrueの側でのみ有効で、その技と同時にメガシンカする。'
        + 'needsForcedSwitchSide0/1のいずれかがtrueの間は使えない（先にapply_forced_switchを呼ぶこと）。'
        + 'pivot:trueの技（とんぼがえり等）が成立するとターンはそこで中断し、'
        + 'needsPivotSwitchSide0/1がtrue・isTurnCompleteがfalseで返る。'
        + 'その場合はapply_pivot_switchで交代先を指定するとターンの残りが再開される。',
      inputSchema: {
        sessionId: z.string(),
        actionA: ActionInputSchema,
        actionB: ActionInputSchema,
        reasoningA: z.string().optional(),
        reasoningB: z.string().optional(),
      },
    },
    ({ sessionId, actionA, actionB, reasoningA, reasoningB }) =>
      handle(async () => {
        const stored = requireSession(sessionId);
        const { session } = stored.history;

        stored.history.checkpoint();
        session.beginTurn();

        if (session.needsForcedSwitch(0) || session.needsForcedSwitch(1)) {
          throw new Error('瀕死のポケモンが残っています。先にapply_forced_switchを呼んでください。');
        }

        const [decisionA, decisionB] = await Promise.all([
          resolveDecision(actionA, 0, session, reasoningA),
          resolveDecision(actionB, 1, session, reasoningB),
        ]);

        session.applyTurn(decisionA, decisionB);
        // pivot技で中断した場合はターンを閉じない（apply_pivot_switchが続きを進める）。
        if (session.isTurnComplete()) {
          session.endTurn();
        }

        return stateView(stored);
      })
  );

  server.registerTool(
    'apply_pivot_switch',
    {
      description:
        'とんぼがえり等のpivot技で攻撃後に退場する側の交代先を指定し、中断していたターンを再開する。'
        + 'needsPivotSwitchSide0/1がtrueの側でのみ有効。'
        + '本編と同じく、技の結果（ダメージ・撃破の有無・相手の行動）を見てから交代先を選べる。'
        + '再開後に相手もpivot技を使っていた場合は再びneedsPivotSwitchが立つため、'
        + 'isTurnCompleteがtrueになるまで繰り返し呼ぶこと。',
      inputSchema: {
        sessionId: z.string(),
        side: z.union([z.literal(0), z.literal(1)]),
        pokemonIndex: z.number().int().nonnegative(),
        reasoning: z.string().optional(),
      },
    },
    ({ sessionId, side, pokemonIndex, reasoning }) =>
      handle(() => {
        const stored = requireSession(sessionId);
        const { session } = stored.history;

        session.applyPivotSwitch(side, { action: { type: 'switch', pokemonIndex }, reasoning });
        if (session.isTurnComplete()) {
          session.endTurn();
        }

        return stateView(stored);
      })
  );

  server.registerTool(
    'undo',
    {
      description: '直前の操作（apply_turnまたはapply_forced_switch）を取り消す。',
      inputSchema: { sessionId: z.string() },
    },
    ({ sessionId }) =>
      handle(() => {
        const stored = requireSession(sessionId);
        stored.history.undo();
        return stateView(stored);
      })
  );

  server.registerTool(
    'redo',
    {
      description: 'undoで取り消した操作をやり直す。',
      inputSchema: { sessionId: z.string() },
    },
    ({ sessionId }) =>
      handle(() => {
        const stored = requireSession(sessionId);
        stored.history.redo();
        return stateView(stored);
      })
  );

  server.registerTool(
    'fork_battle',
    {
      description:
        '現在の局面から独立した新しいセッションを複製する（別々の行動を試して比較する分岐探索用）。'
        + '複製後は元のセッションと状態を共有しない。',
      inputSchema: { sessionId: z.string() },
    },
    ({ sessionId }) =>
      handle(() => {
        const stored = requireSession(sessionId);
        const forkedHistory = stored.history.fork();
        const forkedSessionId = randomUUID();
        const forkedStored: StoredSession = { history: forkedHistory };
        sessions.set(forkedSessionId, forkedStored);
        return { sessionId: forkedSessionId, state: stateView(forkedStored) };
      })
  );

  server.registerTool(
    'get_battle_log',
    {
      description: 'これまでの戦闘ログ（本文）と、行動ごとの思考理由ログを取得する。',
      inputSchema: { sessionId: z.string() },
    },
    ({ sessionId }) =>
      handle(() => {
        const stored = requireSession(sessionId);
        return {
          log: stored.history.session.engine.getLog(),
          reasoningLog: stored.history.session.reasoningLog,
        };
      })
  );

  server.registerTool(
    'list_battles',
    {
      description: '現在サーバー上に存在するセッションIDの一覧を取得する。',
      inputSchema: {},
    },
    () => handle(() => ({ sessionIds: [...sessions.keys()] }))
  );

  return server;
}
