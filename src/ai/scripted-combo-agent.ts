import type { Pokemon } from '../pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { getLegalActions } from './battle-agent.js';
import { damageRatio } from './heuristic-battle-agent.js';
import { SYSTEM_RANDOM } from '../rng.js';
import type { RandomSource } from '../rng.js';

// コンボ構築を「手順どおりに演じる」校正用の方策。
// 積み技で能力を上げる → バトンタッチで引き継ぐ → 交代先で殴る、だけを行う。
// 一般の方策（ランダム／ヒューリスティック／ハイブリッド）が苦手な「演技」の上限を測るのが目的。

export interface ComboOptions {
  // 積みに使う技名（例: 'めいそう', 'ちょうのまい'）。
  setupMoves?: string[];
  passMove?: string;
  // 何段階積んだらバトンタッチするか（能力ランクの合計）。
  targetBoost?: number;
  // バトンタッチの引き継ぎ先（名前 or 表示名）。未指定なら「積み役でない最初の駒」。
  passTo?: string;
  // 積み役が場に出ている間、攻撃より積みを優先する（既定 true）。
  alwaysSetup?: boolean;
}

export class ScriptedComboAgent implements BattleAgent {
  private readonly setupMoves: string[];
  private readonly passMove: string;
  private readonly targetBoost: number;
  private readonly passTo: string | undefined;

  // 台本の実行回数（検証用）。
  batonCount = 0;
  setupCount = 0;

  constructor(private readonly rng: RandomSource = SYSTEM_RANDOM, options: ComboOptions = {}) {
    this.setupMoves = options.setupMoves ?? ['めいそう', 'ちょうのまい', 'わるだくみ', 'つるぎのまい', 'りゅうのまい', 'てっぺき', 'からをやぶる'];
    this.passMove = options.passMove ?? 'バトンタッチ';
    this.targetBoost = options.targetBoost ?? 2;
    this.passTo = options.passTo;
  }

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    // 積み役を先頭に出す。
    const setter = team.find((pokemon) => pokemon.moves.some((move) => this.setupMoves.includes(move.name)));
    return setter ?? team[0];
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const legal = getLegalActions(context);
    const self = context.self;

    if (context.mustSwitch) {
      // 台本で指定された引き継ぎ先（エース）を最優先する。
      const designated = this.passTo === undefined
        ? undefined
        : legal.switches.find(({ pokemon }) => pokemon.name === this.passTo);
      if (designated) {
        return { action: { type: 'switch', pokemonIndex: designated.index }, reasoning: `コンボ: ${this.passTo}へバトン` };
      }
      const candidates = legal.switches.filter(({ pokemon }) => !pokemon.moves.some((move) => this.setupMoves.includes(move.name)));
      const pick = candidates[0] ?? legal.switches[0];
      return { action: { type: 'switch', pokemonIndex: pick.index }, reasoning: 'コンボ: 引き継ぎ先へ' };
    }

    const boost = this.boostSum(self);
    const passIndex = legal.moves.find(({ move }) => move.name === this.passMove)?.index;
    const setupIndex = legal.moves.find(({ move }) => this.setupMoves.includes(move.name))?.index;

    // 瀕死寸前（タスキで1残し等）なら、積みが足りなくても即バトンタッチ。
    // 天候・設置技の削りで落ちる前に引き継ぐのが実戦の形。
    const hpRatio = self.currentHP / self.maxHP;
    if (passIndex !== undefined && hpRatio <= 0.25 && this.boostSum(self) > 0) {
      this.batonCount++;
      return { action: { type: 'move', moveIndex: passIndex, target: 0 }, reasoning: 'コンボ: 瀕死前に即バトン' };
    }

    // 積み切ったらバトンタッチ（引き継ぎ先が残っているときだけ）。
    const passTargetAlive = this.passTo === undefined
      || context.selfTeam.some((pokemon) => !pokemon.isFainted && pokemon !== self && (pokemon.name === this.passTo));
    if (passIndex !== undefined && boost >= this.targetBoost && passTargetAlive) {
      this.batonCount++;
      return { action: { type: 'move', moveIndex: passIndex, target: 0 }, reasoning: `コンボ: ${boost}段でバトン` };
    }
    // まだ足りなければ積む。
    if (setupIndex !== undefined && boost < this.targetBoost) {
      this.setupCount++;
      return { action: { type: 'move', moveIndex: setupIndex, target: 0, megaEvolve: legal.canMegaEvolve || undefined }, reasoning: `コンボ: 積み(${boost}段)` };
    }
    // 積み役でなければ最大打点。
    let best = legal.moves[0];
    let bestRatio = -1;
    for (const candidate of legal.moves) {
      if (candidate.move.category === 'status') continue;
      const ratio = damageRatio(self, context.opponent, candidate.move, context.field);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = candidate;
      }
    }
    if (legal.moves.length === 0) {
      const pick = legal.switches[0];
      if (!pick) return { action: { type: 'forfeit' } };
      return { action: { type: 'switch', pokemonIndex: pick.index } };
    }
    // メガシンカは技に添えて宣言する（宣言しないとメガ枠が素のまま戦ってしまう）。
    return { action: { type: 'move', moveIndex: best.index, target: 0, megaEvolve: legal.canMegaEvolve || undefined }, reasoning: 'コンボ: エースで攻撃' };
  }

  // 能力ランクの合計（命中・回避は除く）。
  private boostSum(pokemon: Pokemon): number {
    const stages = pokemon.statStages as Record<string, number>;
    return ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']
      .map((key) => stages[key] ?? 0)
      .reduce((sum, value) => sum + Math.max(0, value), 0);
  }
}
