import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentAction, WeatherType } from '../types.js';
import type { Pokemon } from '../pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { getLegalActions, RandomBattleAgent } from './battle-agent.js';

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_MODEL = 'deepseek-v4-pro';

const WEATHER_NAMES: Record<WeatherType, string> = {
  sand: '砂嵐',
  rain: '雨',
  sun: '晴れ',
  hail: 'あられ',
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// OpenAI 互換 /chat/completions の応答のうち、tool_call の引数だけを取り出す。
// プロバイダによって欠けるフィールドがあるので、途中はすべて省略可能にしておく。
const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            tool_calls: z.array(z.object({ function: z.object({ arguments: z.string() }) })).optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

export interface OpenCodeBattleAgentOptions {
  // 未指定時は環境変数 OPENCODE_API_KEY を使う（キーをコードやログに直接書かない）。
  apiKey?: string;
  model?: string;
  baseURL?: string;
  fetchFn?: FetchLike;
  maxRetries?: number;
  // OpenCode Go は x-opencode-session ヘッダが無いと 400 (MissingSessionID) を返す。
  sessionId?: string;
  // 1回のAPI呼び出しの上限時間。無いと応答が返らないリクエストで対戦が永久に止まる。
  timeoutMs?: number;
}

function describePokemon(pokemon: Pokemon, legalMoveIndices: Set<number> | null): string {
  const hpPercent = Math.round((pokemon.currentHP / pokemon.maxHP) * 100);
  const status = pokemon.status ?? 'なし';
  const moves = pokemon.moves
    .map((move, index) => {
      const usable = legalMoveIndices === null || legalMoveIndices.has(index);
      const flag = legalMoveIndices !== null && !usable ? '（選択不可）' : '';
      const pivotFlag = move.pivot ? '（攻撃後に交代する技）' : '';
      return `  [${index}] ${move.name} (タイプ:${move.type} 分類:${move.category} 威力:${move.power} 命中:${move.accuracy} PP:${move.pp}/${move.maxPP})${pivotFlag}${flag}`;
    })
    .join('\n');

  const lockLine = pokemon.lockedMove !== null
    ? `  こだわり固定: [${pokemon.lockedMove}] ${pokemon.moves[pokemon.lockedMove]?.name ?? '不明'}（交代するまで他の技は選べない）`
    : null;

  return [
    `${pokemon.name} (${pokemon.isFainted ? '戦闘不能' : `HP ${hpPercent}% (${pokemon.currentHP}/${pokemon.maxHP})`})`,
    `  タイプ: ${pokemon.types.join('/')} / 特性: ${pokemon.ability} / 道具: ${pokemon.item ?? 'なし'} / 状態異常: ${status}`,
    moves,
    ...(lockLine !== null ? [lockLine] : []),
  ].join('\n');
}

export function buildBattlePrompt(context: BattleContext): string {
  const legal = getLegalActions(context);
  const legalMoveIndices = new Set(legal.moves.map((m) => m.index));
  const weatherName = context.field.weather ? WEATHER_NAMES[context.field.weather] : null;

  const fieldLines = [
    `天候: ${weatherName ?? 'なし'}${context.field.weather ? `（残り${context.field.weatherTurnsLeft}ターン）` : ''}`,
    `トリックルーム: ${context.field.trickRoom ? `発動中（残り${context.field.trickRoomTurnsLeft}ターン）` : 'なし'}`,
    `ステルスロック: 自分の場=${context.field.stealthRock.self ? 'あり' : 'なし'} / 相手の場=${context.field.stealthRock.opponent ? 'あり' : 'なし'}`,
  ].join('\n');

  const switchLines = legal.switches
    .map(({ index, pokemon }) => `  [${index}] ${pokemon.name} (HP ${Math.round((pokemon.currentHP / pokemon.maxHP) * 100)}%)`)
    .join('\n') || '  （交代可能なポケモンなし）';

  // 瀕死交代とpivot技の攻撃後交代は「技を選べず交代先だけを選ぶ」場面。
  // どちらもcontext.mustSwitchで表現されるため、指示文もここで切り替える。
  const headline = context.mustSwitch
    ? `ターン${context.turn}。交代先のポケモンを選んでください（技は選べません。actionType="switch"で回答すること）。`
    : `ターン${context.turn}。あなたの行動を選んでください。`;

  return [
    headline,
    '',
    '[盤面]',
    fieldLines,
    '',
    '[自分の場のポケモン]',
    describePokemon(context.self, legalMoveIndices),
    `  メガシンカ: ${context.canMegaEvolve ? '可能（技を選ぶ際にmegaEvolve=trueにすると同時に発動できる）' : '不可'}`,
    '',
    '[相手の場のポケモン]',
    describePokemon(context.opponent, null),
    '',
    '[交代可能な控え]',
    switchLines,
    '',
    '[直近のログ]',
    context.recentLog.slice(-8).join('\n') || '（なし）',
  ].join('\n');
}

// LLM が choose_action に渡す引数。JSON 文字列で届くので、形を検証してから使う。
const chosenActionSchema = z.object({
  reasoning: z.string().min(1),
  actionType: z.enum(['move', 'switch', 'forfeit']),
  moveIndex: z.number().optional(),
  pokemonIndex: z.number().optional(),
  megaEvolve: z.boolean().optional(),
});

type ChosenAction = z.infer<typeof chosenActionSchema>;

const CHOOSE_ACTION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'choose_action',
    description: 'このターンにポケモンが取る行動を1つ選ぶ。',
    parameters: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'この行動を選んだテンポ・ROIの観点での理由（日本語、2-3文程度）' },
        actionType: { type: 'string', enum: ['move', 'switch', 'forfeit'] },
        moveIndex: { type: 'integer', description: 'actionType=moveのとき、使用する技のインデックス' },
        pokemonIndex: { type: 'integer', description: 'actionType=switchのとき、交代先のインデックス' },
        megaEvolve: { type: 'boolean', description: 'actionType=moveのとき、この技と同時にメガシンカするか（メガシンカ可能な場合のみ有効）' },
      },
      required: ['reasoning', 'actionType'],
    },
  },
};

function toAgentAction(chosen: ChosenAction): AgentAction {
  if (chosen.actionType === 'move') {
    return { type: 'move', moveIndex: chosen.moveIndex!, target: 0, megaEvolve: chosen.megaEvolve };
  }
  if (chosen.actionType === 'switch') {
    return { type: 'switch', pokemonIndex: chosen.pokemonIndex! };
  }
  return { type: 'forfeit' };
}

function isLegal(action: AgentAction, context: BattleContext): boolean {
  const legal = getLegalActions(context);

  if (action.type === 'move') {
    return legal.moves.some((m) => m.index === action.moveIndex);
  }
  if (action.type === 'switch') {
    return legal.switches.some((s) => s.index === action.pokemonIndex);
  }
  return true; // forfeitは常に合法（詰み状態を含む）
}

// OpenCode Go（https://opencode.ai/zen）経由でLLMに行動選択させるBattleAgent。
// OpenAI互換のchat completions + tool callingで構造化出力を強制する。
// 非合法な応答やAPIエラー時は既定回数までリトライし、それでも失敗したらRandomBattleAgentにフォールバックする
// （1回のLLM呼び出し失敗でバトル全体を止めないため）。
export class OpenCodeBattleAgent implements BattleAgent {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;
  private readonly fetchFn: FetchLike;
  private readonly maxRetries: number;
  private readonly sessionId: string;
  private readonly timeoutMs: number;
  private readonly fallback = new RandomBattleAgent();

  constructor(options: OpenCodeBattleAgentOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENCODE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenCode APIキーが見つかりません。OPENCODE_API_KEY環境変数を設定するか、apiKeyオプションを渡してください。'
      );
    }

    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseURL = options.baseURL ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxRetries = options.maxRetries ?? 1;
    this.sessionId = options.sessionId ?? `pokebattle-${randomUUID()}`;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return team[0];
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const chosen = await this.requestAction(context);
        const action = toAgentAction(chosen);

        if (!isLegal(action, context)) {
          throw new Error(`LLMが非合法な行動を返しました: ${JSON.stringify(chosen)}`);
        }

        return { action, reasoning: chosen.reasoning };
      } catch (error) {
        lastError = error;
      }
    }

    const fallbackDecision = await this.fallback.selectAction(context);
    return {
      ...fallbackDecision,
      reasoning: `[LLM応答取得に失敗したためランダム行動にフォールバック: ${String(lastError)}]`,
    };
  }

  private async requestAction(context: BattleContext): Promise<ChosenAction> {
    const prompt = buildBattlePrompt(context);

    const response = await this.fetchFn(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'x-opencode-session': this.sessionId,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'あなたはポケモン対戦の思考エンジンです。テンポ（1手の価値）とROIを踏まえて最善の行動を選んでください。'
              + '必ずchoose_action関数を呼び出して回答すること。テキストで直接回答してはいけません。',
          },
          { role: 'user', content: prompt },
        ],
        tools: [CHOOSE_ACTION_TOOL],
        // 一部のOpenAI互換プロバイダ（OpenCode Go含む）は強制tool_choice（required/nested object）
        // や response_format:json_schema を受け付けないため、"auto"+システムプロンプトでの強制で代替する。
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenCode API呼び出しに失敗しました: ${response.status} ${response.statusText}`);
    }

    const data = chatCompletionSchema.safeParse(await response.json());
    const toolCall = data.success ? data.data.choices?.[0]?.message?.tool_calls?.[0] : undefined;
    if (!toolCall) {
      throw new Error('LLMの応答にtool_callが含まれていません');
    }

    const parsed = chosenActionSchema.safeParse(JSON.parse(toolCall.function.arguments));
    if (!parsed.success) {
      throw new Error(`LLMの応答が不正です: ${toolCall.function.arguments}`);
    }

    return parsed.data;
  }
}
