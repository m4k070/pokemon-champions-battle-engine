import { getLegalActions, RandomBattleAgent } from './battle-agent.js';
const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_MODEL = 'deepseek-v4-pro';
const WEATHER_NAMES = {
    sand: '砂嵐',
    rain: '雨',
    sun: '晴れ',
    hail: 'あられ',
};
function describePokemon(pokemon, legalMoveIndices) {
    const hpPercent = Math.round((pokemon.currentHP / pokemon.maxHP) * 100);
    const status = pokemon.status ?? 'なし';
    const moves = pokemon.moves
        .map((move, index) => {
        const usable = legalMoveIndices === null || legalMoveIndices.has(index);
        const flag = legalMoveIndices !== null && !usable ? '（選択不可）' : '';
        return `  [${index}] ${move.name} (タイプ:${move.type} 分類:${move.category} 威力:${move.power} 命中:${move.accuracy} PP:${move.pp}/${move.maxPP})${flag}`;
    })
        .join('\n');
    return [
        `${pokemon.name} (${pokemon.isFainted ? '戦闘不能' : `HP ${hpPercent}% (${pokemon.currentHP}/${pokemon.maxHP})`})`,
        `  タイプ: ${pokemon.types.join('/')} / 特性: ${pokemon.ability} / 道具: ${pokemon.item ?? 'なし'} / 状態異常: ${status}`,
        moves,
    ].join('\n');
}
export function buildBattlePrompt(context) {
    const legal = getLegalActions(context);
    const legalMoveIndices = new Set(legal.moves.map((m) => m.index));
    const weatherName = WEATHER_NAMES[context.field.weather] ?? context.field.weather;
    const fieldLines = [
        `天候: ${weatherName ?? 'なし'}${context.field.weather ? `（残り${context.field.weatherTurnsLeft}ターン）` : ''}`,
        `トリックルーム: ${context.field.trickRoom ? `発動中（残り${context.field.trickRoomTurnsLeft}ターン）` : 'なし'}`,
        `ステルスロック: 自分の場=${context.field.stealthRock.self ? 'あり' : 'なし'} / 相手の場=${context.field.stealthRock.opponent ? 'あり' : 'なし'}`,
    ].join('\n');
    const switchLines = legal.switches
        .map(({ index, pokemon }) => `  [${index}] ${pokemon.name} (HP ${Math.round((pokemon.currentHP / pokemon.maxHP) * 100)}%)`)
        .join('\n') || '  （交代可能なポケモンなし）';
    return [
        `ターン${context.turn}。あなたの行動を選んでください。`,
        '',
        '[盤面]',
        fieldLines,
        '',
        '[自分の場のポケモン]',
        describePokemon(context.self, legalMoveIndices),
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
const CHOOSE_ACTION_TOOL = {
    type: 'function',
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
            },
            required: ['reasoning', 'actionType'],
        },
    },
};
function toAgentAction(chosen) {
    if (chosen.actionType === 'move') {
        return { type: 'move', moveIndex: chosen.moveIndex, target: 0 };
    }
    if (chosen.actionType === 'switch') {
        return { type: 'switch', pokemonIndex: chosen.pokemonIndex };
    }
    return { type: 'forfeit' };
}
function isLegal(action, context) {
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
export class OpenCodeBattleAgent {
    apiKey;
    model;
    baseURL;
    fetchFn;
    maxRetries;
    fallback = new RandomBattleAgent();
    constructor(options = {}) {
        const apiKey = options.apiKey ?? process.env.OPENCODE_API_KEY;
        if (!apiKey) {
            throw new Error('OpenCode APIキーが見つかりません。OPENCODE_API_KEY環境変数を設定するか、apiKeyオプションを渡してください。');
        }
        this.apiKey = apiKey;
        this.model = options.model ?? DEFAULT_MODEL;
        this.baseURL = options.baseURL ?? DEFAULT_BASE_URL;
        this.fetchFn = options.fetchFn ?? fetch;
        this.maxRetries = options.maxRetries ?? 1;
    }
    async selectLead(team) {
        return team[0];
    }
    async selectAction(context) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const chosen = await this.requestAction(context);
                const action = toAgentAction(chosen);
                if (!isLegal(action, context)) {
                    throw new Error(`LLMが非合法な行動を返しました: ${JSON.stringify(chosen)}`);
                }
                return { action, reasoning: chosen.reasoning };
            }
            catch (error) {
                lastError = error;
            }
        }
        const fallbackDecision = await this.fallback.selectAction(context);
        return {
            ...fallbackDecision,
            reasoning: `[LLM応答取得に失敗したためランダム行動にフォールバック: ${String(lastError)}]`,
        };
    }
    async requestAction(context) {
        const prompt = buildBattlePrompt(context);
        const response = await this.fetchFn(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'あなたはポケモン対戦の思考エンジンです。テンポ（1手の価値）とROIを踏まえて最善の行動を選んでください。'
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
        const data = (await response.json());
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
            throw new Error('LLMの応答にtool_callが含まれていません');
        }
        const parsed = JSON.parse(toolCall.function.arguments);
        if (!parsed.actionType || !parsed.reasoning) {
            throw new Error(`LLMの応答が不正です: ${toolCall.function.arguments}`);
        }
        return parsed;
    }
}
//# sourceMappingURL=opencode-battle-agent.js.map