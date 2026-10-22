import { randomUUID } from 'node:crypto';
import type { AgentAction } from '../types.js';
import type { Pokemon } from '../pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { getLegalActions } from './battle-agent.js';
import { HeuristicBattleAgent, typeMultiplier } from './heuristic-battle-agent.js';
import { SYSTEM_RANDOM } from '../rng.js';
import type { RandomSource } from '../rng.js';

// ハイブリッド方策。
// 基本は HeuristicBattleAgent が決め、「判断が分かれる局面」だけ LLM に同意/上書きを聞く。
// LLM が遅い・失敗する場合はヒューリスティックの判断をそのまま使う（ランダムに落とさない）。

const SETUP_MOVES = new Set([
  'つるぎのまい', 'りゅうのまい', 'てっぺき', 'ちょうのまい', 'わるだくみ', 'からをやぶる', 'めいそう', 'ビルドアップ',
]);
const STATUS_MOVES = new Set(['あくび', 'でんじは', 'おにび', 'どくどく', 'こわいかお', 'アンコール', 'ちょうはつ', 'ねむりごな']);

export type ConsultReason =
  | '常時'         // 毎手相談（アブレーション用）
  | '判断が拮抗'   // 上位2候補のスコア差が小さい（ヒューリスティック自身が迷っている）
  | '単一技の読み'
  | '危険な被弾'
  | '積みの好機'
  | '状態技の押しどころ'
  | '終盤の詰め';

export interface ConsultationRecord {
  turn: number;
  reason: ConsultReason;
  agreed: boolean;
  ms: number;
  // ヒューリスティック側の迷い度合い（上位2候補のスコア差 / 1位のスコア）。
  margin?: number;
  // LLMが自己申告した確信度（0-1）。返さなければ undefined。
  confidence?: number;
  error?: string;
}

export interface HybridOptions {
  apiKey: string;
  model?: string;
  maxConsultations?: number;
  cooldownTurns?: number;
  timeoutMs?: number;
  // 機械判断を提示して同意を求めるか。既定 false（提示すると「同意」に寄るバイアスが出る）。
  revealProposal?: boolean;
  // 「迷い」と判定するスコア差の閾値（1位に対する相対値）。既定 0.12。
  hesitationMargin?: number;
  // 使うトリガーを限定する（アブレーション用）。既定は全部。
  triggers?: ConsultReason[];
  // 毎手相談する（上限コストの基準を測るため）。
  alwaysConsult?: boolean;
  // テスト用の差し替え口。プロンプトを受け取って生の応答文字列を返す。
  ask?: (prompt: string) => Promise<string>;
}

const DEFAULT_MODEL = 'deepseek-v4.1-flash';

export class HybridBattleAgent implements BattleAgent {
  private readonly inner: HeuristicBattleAgent;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxConsultations: number;
  private readonly cooldownTurns: number;
  private readonly timeoutMs: number;
  private readonly revealProposal: boolean;
  private readonly hesitationMargin: number;
  private readonly enabledTriggers: Set<ConsultReason>;
  private readonly alwaysConsult: boolean;
  private readonly sessionId: string;
  private readonly ask: (prompt: string) => Promise<string>;
  readonly consultations: ConsultationRecord[] = [];
  // 直近のLLM生応答（検証用。空応答＝同意と誤認していないか確認するため）。
  readonly rawResponses: string[] = [];
  private lastConsultTurn = -99;

  constructor(rng: RandomSource = SYSTEM_RANDOM, options: HybridOptions) {
    this.inner = new HeuristicBattleAgent(rng);
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxConsultations = options.maxConsultations ?? 8;
    this.cooldownTurns = options.cooldownTurns ?? 2;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.revealProposal = options.revealProposal ?? false;
    this.hesitationMargin = options.hesitationMargin ?? 0.12;
    // 既定は「拮抗」だけ。実測で、毎手相談と同等の上書き率を1/4のコストで拾えた唯一のトリガー。
    this.enabledTriggers = new Set(options.triggers ?? ['判断が拮抗']);
    this.alwaysConsult = options.alwaysConsult ?? false;
    this.sessionId = `hybrid-${randomUUID()}`;
    this.ask = options.ask ?? ((prompt) => this.callApi(prompt));
  }

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return this.inner.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const base = await this.inner.selectAction(context);
    const reason = this.shouldConsult(context);
    if (!reason) return base;

    this.lastConsultTurn = context.turn;
    const started = Date.now();
    try {
      const raw = await this.ask(this.buildPrompt(context, base, reason));
      this.rawResponses.push(raw);
      const proposed = parseReply(raw, context);
      const same = proposed === null || sameAction(proposed, base.action);
      this.consultations.push({
        turn: context.turn,
        reason,
        agreed: same,
        ms: Date.now() - started,
        margin: this.margin() ?? undefined,
        confidence: parseConfidence(raw),
      });
      if (same) return base;
      return { action: proposed, reasoning: `[hybrid:${reason}] LLMが上書き` };
    } catch (error) {
      this.consultations.push({
        turn: context.turn,
        reason,
        agreed: true,
        ms: Date.now() - started,
        margin: this.margin() ?? undefined,
        error: String(error).slice(0, 120),
      });
      return base;
    }
  }

  // 相談する局面かどうか。予算・クールダウン・有効なトリガーで絞る。
  private shouldConsult(context: BattleContext): ConsultReason | null {
    if (this.consultations.length >= this.maxConsultations) return null;
    if (this.alwaysConsult) return '常時';
    if (context.turn - this.lastConsultTurn < this.cooldownTurns) return null;

    // 優先順に見て、最初に「当たったかつ有効な」トリガーを採用する。
    for (const reason of this.matchedTriggers(context)) {
      if (this.enabledTriggers.has(reason)) return reason;
    }
    return null;
  }

  // 局面に当てはまるトリガーを優先順に列挙する（有効/無効は見ない）。
  private *matchedTriggers(context: BattleContext): Generator<ConsultReason> {
    const legal = getLegalActions(context);
    const hasSwitch = legal.switches.length > 0;
    const hpRatio = context.self.currentHP / context.self.maxHP;

    // ヒューリスティック自身が迷っている局面（上位2候補が僅差）は、判断の質が問われる。
    const margin = this.margin();
    if (margin !== null && margin < this.hesitationMargin && context.turn >= 2) yield '判断が拮抗';

    // 相手の見えている技が1つだけで、こちらの相性が極端（無効・半減 or 抜群）→ 交代読みが要る。
    if (context.opponent.moves.length === 1 && hasSwitch && context.turn >= 2) {
      const revealed = context.opponent.moves[0]!;
      const effectiveness = typeMultiplier(revealed.type, context.self.types);
      if (effectiveness === 0 || effectiveness >= 2) yield '単一技の読み';
    }

    // 相手の最大打点がHPの45%以上 → 居座るか逃げるか。
    if (hasSwitch && context.turn >= 2 && hpRatio < 0.9 && this.worstIncoming(context) >= 0.45) yield '危険な被弾';

    // 積み技を押すタイミングは結果を分ける。
    if (legal.moves.some(({ move }) => SETUP_MOVES.has(move.name))) {
      const opponentHp = context.opponent.currentHP / context.opponent.maxHP;
      if (hpRatio >= 0.6 && opponentHp >= 0.6 && context.turn >= 2) yield '積みの好機';
    }
    if (
      legal.moves.some(({ move }) => STATUS_MOVES.has(move.name)) &&
      context.opponent.status === null &&
      context.turn >= 4
    ) {
      yield '状態技の押しどころ';
    }

    // 終盤（どちらかの残り駒が2以下）。
    const selfLeft = context.selfTeam.filter((pokemon) => !pokemon.isFainted).length;
    const opponentLeft = context.opponentTeam.filter((pokemon) => !pokemon.isFainted).length;
    if (context.turn >= 6 && (selfLeft <= 2 || opponentLeft <= 2)) yield '終盤の詰め';
  }

  // トリガーが有効なら理由を返し、無効なら null。
  private enabled(reason: ConsultReason): ConsultReason | null {
    return this.enabledTriggers.has(reason) ? reason : null;
  }

  // 上位2候補のスコア差を1位に対する相対値で返す。候補が1つ以下なら null。
  private margin(): number | null {
    const scores = this.inner.lastEvaluation.map((entry) => entry.score).sort((a, b) => b - a);
    if (scores.length < 2) return null;
    const top = scores[0]!;
    const scale = Math.abs(top) > 1e-6 ? Math.abs(top) : 1;
    return (top - scores[1]!) / scale;
  }

  // 相手の最大打点をHP割合でざっくり見積もる（タイプ相性・一致・威力から。乱数と急所は無視）。
  private worstIncoming(context: BattleContext): number {
    let worst = 0;
    for (const move of context.opponent.moves) {
      if (move.category === 'status') continue;
      const effectiveness = typeMultiplier(move.type, context.self.types);
      if (effectiveness === 0) continue;
      const stab = context.opponent.types.includes(move.type) ? 1.5 : 1;
      const estimate = ((move.power * effectiveness * stab) / Math.max(1, context.self.maxHP)) * 0.4;
      worst = Math.max(worst, estimate);
    }
    return worst;
  }

  private buildPrompt(context: BattleContext, base: AgentDecision, reason: ConsultReason): string {
    const self = context.self;
    const opponent = context.opponent;
    const legal = getLegalActions(context);
    const moves = legal.moves.map(({ index, move }) => `${index}:${move.name}`).join(', ');
    const switches = legal.switches.map(({ index, pokemon }) => `${index}:${pokemon.name}`).join(', ');
    const known = opponent.moves.length > 0 ? opponent.moves.map((move) => move.name).join(', ') : '不明';
    const baseAction = base.action.type === 'move'
      ? `技${base.action.moveIndex}`
      : base.action.type === 'switch'
        ? `交代${base.action.pokemonIndex}`
        : '降参';

    const lines = [
      `自分: ${self.name} HP${Math.round((self.currentHP / self.maxHP) * 100)}% 状態:${self.status ?? 'なし'}`,
      `相手: ${opponent.name} HP${Math.round((opponent.currentHP / opponent.maxHP) * 100)}% 見えている技:[${known}]`,
      `天候:${context.field.weather ?? 'なし'} フィールド:${context.field.terrain ?? 'なし'} ターン:${context.turn}`,
      `選べる技:[${moves}] 交代先:[${switches}]`,
      // 直前の流れと控えの残量。これが無いとLLMは「読む」材料を持てない。
      `控え: ${context.selfTeam.filter((p) => !p.isFainted).map((p) => `${p.name}${Math.round((p.currentHP / p.maxHP) * 100)}%`).join(' ')}`,
      `直近の流れ: ${context.recentLog.slice(-4).join(' / ') || 'なし'}`,
    ];
    if (this.revealProposal) {
      lines.push(`機械的な判断:「${baseAction}」。相談理由: ${reason}`);
      lines.push('同意なら {"agree":true}。変えるなら {"action":{"type":"move","moveIndex":N},"reason":"20字以内"} か');
      lines.push('{"action":{"type":"switch","pokemonIndex":N},"reason":"20字以内"}。JSONだけを返す。');
    } else {
      lines.push(`この局面で最善の行動を1つ選べ（着眼点: ${reason}）。`);
      lines.push('{"action":{"type":"move","moveIndex":N},"confidence":0.0-1.0,"reason":"20字以内"} か');
      lines.push('{"action":{"type":"switch","pokemonIndex":N},"confidence":0.0-1.0,"reason":"20字以内"}。JSONだけを返す。');
    }
    return lines.join('\n');
  }

  private async callApi(prompt: string): Promise<string> {
    const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'Mozilla/5.0',
        'x-opencode-session': this.sessionId,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        max_tokens: 400,
        // 思考トークンを止める。'minimal' でも思考が上限まで伸びて content が空で返るため 'none' を使う。
        reasoning_effort: 'none',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? '';
    // 空応答は「同意」ではなく失敗として扱う（同意と誤認すると上書き率を過小評価する）。
    if (content.trim() === '') throw new Error('空応答（content が空）');
    return content;
  }

  // 予算・クールダウンを無視して必ず1回相談する（テスト用）。
  async consultForced(context: BattleContext, base: AgentDecision): Promise<AgentDecision> {
    const raw = await this.ask(this.buildPrompt(context, base, '終盤の詰め'));
    const override = parseReply(raw, context);
    return override === null ? base : { action: override, reasoning: '[hybrid:forced]' };
  }
}

// 自己申告の確信度（0-1）。無ければ undefined。
export function parseConfidence(raw: string): number | undefined {
  const match = /"confidence"\s*:\s*([0-9.]+)/.exec(raw);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function sameAction(a: AgentAction, b: AgentAction): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'move' && b.type === 'move') return a.moveIndex === b.moveIndex;
  if (a.type === 'switch' && b.type === 'switch') return a.pokemonIndex === b.pokemonIndex;
  return true;
}

// 応答JSONを行動に変換する。同意・解釈不能・非合法は null（＝ヒューリスティックを採用）。
export function parseReply(raw: string, context: BattleContext): AgentAction | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const record = parsed as { agree?: boolean; action?: { type?: string; moveIndex?: number; pokemonIndex?: number } };
  if (record.agree === true) return null;
  const action = record.action;
  if (!action) return null;

  const legal = getLegalActions(context);
  if (action.type === 'move' && typeof action.moveIndex === 'number') {
    return legal.moves.some(({ index }) => index === action.moveIndex)
      ? { type: 'move', moveIndex: action.moveIndex, target: 0 }
      : null;
  }
  if (action.type === 'switch' && typeof action.pokemonIndex === 'number') {
    return legal.switches.some(({ index }) => index === action.pokemonIndex)
      ? { type: 'switch', pokemonIndex: action.pokemonIndex }
      : null;
  }
  return null;
}
