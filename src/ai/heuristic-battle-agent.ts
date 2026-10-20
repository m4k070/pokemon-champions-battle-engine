import type { Pokemon } from '../pokemon.js';
import type { MoveData, StatStageKey, TypeName } from '../types.js';
import { TYPE_CHART } from '../type-chart.js';
import { SYSTEM_RANDOM } from '../rng.js';
import type { RandomSource } from '../rng.js';
import { getLegalActions } from './battle-agent.js';
import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';

// ルールベースの方策エージェント。
//
// 目的: RandomBattleAgent（合法手から一様乱数）では「行動の価値」が平均化されて消えるため、
// 検量線（構築の強さが勝率に出るか）の判定に使える最低限の方策を用意する。
// ここで測りたいのは「型・数値・技範囲の総量」ではなく、判断つきの対戦で構築差が出るか。
//
// 前提と割り切り:
// - 完全情報（BattleContextは相手の控え・技・持ち物まで渡す）。実戦の読み合いは表現しない。
// - ダメージは実計算ではなく代理指標（威力×相性×タイプ一致×命中×攻撃/防御）。乱数・急所は見ない。
// - 方策は1本だけ。閾値は調整していない（チューニングすると「方策の強さ」を測ってしまうため）。
// - 引き分けを減らすことが第一目的なので、決め手がある時は決め手を優先する。

const EPSILON = 1e-9;

// 場を整える特性（先発に向く）。天候・フィールドの始動役。
const SETTER_ABILITIES = new Set([
  'drizzle', 'drought', 'sand-stream', 'snow-warning', 'sand-spit',
  'psychic-surge', 'electric-surge', 'grassy-surge', 'misty-surge',
]);

// 能力ランクの倍率（本編と同じ式）。
function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

function statWithStage(pokemon: Pokemon, key: StatStageKey): number {
  return pokemon.stats[key] * stageMultiplier(pokemon.statStages[key]);
}

// タイプ相性（複合タイプは積）。
export function typeMultiplier(attack: TypeName, defenders: TypeName[]): number {
  let multiplier = 1;
  for (const defender of defenders) {
    const row = TYPE_CHART[attack];
    const value = row?.[defender];
    multiplier *= typeof value === 'number' ? value : 1;
  }
  return multiplier;
}

// フィールドごとの だいちのはどう のタイプ（本編仕様）。
const TERRAIN_PULSE_TYPE = {
  'psychic-terrain': 'psychic',
  'electric-terrain': 'electric',
  'grassy-terrain': 'grass',
  'misty-terrain': 'fairy',
} as const;

function isGroundedAgainstTerrain(pokemon: Pokemon): boolean {
  return !pokemon.types.includes('flying') && pokemon.ability !== 'levitate';
}

// ダメージの代理指標。HPに対する割合で返す（0〜）。
// field を渡すと、だいちのはどうのタイプ変化・威力2倍と、ワイドフォースのフィールド補正を織り込む。
export function damageRatio(
  attacker: Pokemon,
  defender: Pokemon,
  move: MoveData,
  field?: BattleContext['field'],
): number {
  if (move.category === 'status') return 0;

  let effectiveType = move.type;
  let effectivePower = move.power;
  if (move.terrainPulse && field && field.terrain !== null && isGroundedAgainstTerrain(attacker)) {
    effectiveType = TERRAIN_PULSE_TYPE[field.terrain];
    effectivePower *= 2;
  }
  if (move.boostedByPsychicTerrain && field?.terrain === 'psychic-terrain' && isGroundedAgainstTerrain(attacker)) {
    effectivePower = Math.floor(effectivePower * 1.5);
  }

  const effectiveness = typeMultiplier(effectiveType, defender.types);
  if (effectiveness === 0) return 0;
  const stab = attacker.types.includes(effectiveType) ? 1.5 : 1;
  const attackKey: StatStageKey = move.usesDefenseForAttack
    ? 'DEF'
    : move.category === 'physical'
      ? 'ATK'
      : 'SPATK';
  const defenseKey: StatStageKey = move.category === 'physical' ? 'DEF' : 'SPDEF';
  const attack = statWithStage(attacker, attackKey);
  const defense = Math.max(1, statWithStage(defender, defenseKey));
  const accuracy = move.accuracy > 0 ? move.accuracy / 100 : 1;
  const raw = effectivePower * effectiveness * stab * accuracy * (attack / defense);
  // 実ダメージ式（レベル50相当の係数）に寄せた概算。係数は比較用なので絶対値の意味は薄い。
  return (raw * 0.09) / Math.max(1, defender.maxHP);
}

// りゅうせいぐん・オーバーヒートのように「撃つと自分の攻撃系ランクが下がる」技の割引。
// これを見ないと、火力の高さだけで連打して自分から弱っていく。
function selfDropPenalty(move: MoveData): number {
  if (move.category === 'status' || !move.selfStatChange) return 1;
  let penalty = 1;
  for (const change of move.selfStatChange) {
    if (change.delta < 0 && (change.stat === 'ATK' || change.stat === 'SPATK')) {
      penalty *= 1 / (1 + 0.45 * Math.abs(change.delta));
    }
  }
  return penalty;
}

function hpRatio(pokemon: Pokemon): number {
  return pokemon.currentHP / pokemon.maxHP;
}

function boostTotal(pokemon: Pokemon): number {
  let total = 0;
  for (const key of ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'] as StatStageKey[]) {
    total += pokemon.statStages[key];
  }
  return total;
}

// 変化技の価値。状況依存なので、条件を満たさないときは0にする（撃ち得でない技を撃たない）。
function statusMoveScore(move: MoveData, context: BattleContext): number {
  const self = context.self;
  const opponent = context.opponent;
  const selfHp = hpRatio(self);

  if (move.protects) return 20;

  // 回復（なまける・はねやすめ・あさのひざし等）
  if (move.selfHealPercent || move.weatherHeal || move.rests) {
    if (selfHp >= 0.9) return 0;
    return 150 * (1 - selfHp) * (move.rests ? 1.1 : 1);
  }

  // 積み技（つるぎのまい・りゅうのまい・てっぺき・ちょうのまい等）
  if (move.selfStatChange && move.selfStatChange.length > 0) {
    const positive = move.selfStatChange.filter((change) => change.delta > 0);
    const usable = positive.filter((change) => self.statStages[change.stat] < 6);
    if (usable.length === 0) return 0;
    const gain = usable.reduce((sum, change) => sum + change.delta, 0);
    // 体力が減っているときは積む余裕がないとみなす（全抜き前提の判断）。
    const readiness = selfHp >= 0.55 ? 1 : 0.15;
    // 相手の最大打点を食らって半分以下になるなら、積む前に落とされる（からをやぶる等の自己弱体化も同じ）。
    const worstIncoming = Math.max(
      0,
      ...context.opponent.moves.map((opponentMove) => damageRatio(context.opponent, self, opponentMove, context.field)),
    );
    const survivesSetup = selfHp - worstIncoming >= 0.5 ? 1 : 0.08;
    return 62 * (gain / 2) * readiness * survivesSetup;
  }

  // 場に残る効果（ステロ・まきびし・壁・おいかぜ・トリックルーム）
  if (move.fieldEffect) {
    switch (move.fieldEffect) {
      case 'stealth-rock':
        return context.field.stealthRock.opponent ? 0 : 95;
      case 'spikes':
      case 'toxic-spikes':
        return 50;
      case 'reflect':
      case 'aurora-veil':
      case 'tailwind':
        return 45;
      case 'trick-room':
        return 40;
      default:
        return 25;
    }
  }

  // あくび: 相手が状態異常でなく、ねむけでもないときだけ価値がある（ねむけは文脈に無いので状態で近似）。
  if (move.inflictsDrowsy) {
    return opponent.status === null && opponent.isFainted === false ? 85 : 0;
  }

  // 状態異常を入れる技（でんじは・おにび・どくどく等）
  if (move.category === 'status' && move.status) {
    return opponent.status === null ? 70 : 0;
  }

  if (move.inflictsEncore) return 30;
  if (move.resetsStatStages) return boostTotal(opponent) > 0 ? 60 : 0;
  if (move.createsSubstitute) return selfHp > 0.35 ? 35 : 0;
  if (move.forcesSwitch) return boostTotal(opponent) > 0 ? 45 : 20;
  if (move.wishes) return selfHp < 0.6 ? 35 : 10;
  if (move.weather) return 25;
  if (move.pivot) return 20;

  return 8;
}

interface ScoredAction {
  action: AgentDecision['action'];
  score: number;
  label: string;
}

// 交代先の評価。相手の実際の技（完全情報）から被ダメージ割合を出し、
// 「受けられるか」と「こちらから通せるか」の和で順位づけする。
function matchupScore(candidate: Pokemon, context: BattleContext): number {
  const opponent = context.opponent;
  let incoming = 0;
  for (const move of opponent.moves) {
    incoming = Math.max(incoming, damageRatio(opponent, candidate, move, context.field));
  }
  let outgoing = 0;
  for (const move of candidate.moves) {
    if (move.pp <= 0) continue;
    outgoing = Math.max(outgoing, damageRatio(candidate, opponent, move, context.field));
  }
  // 被ダメージが小さいほど高評価。1発で沈む候補は大きく減点する。
  const survivability = incoming >= 0.9 ? -120 : -incoming * 100;
  return survivability + outgoing * 160;
}

export interface HeuristicOptions {
  // 自分から交代するか（アブレーション用。false にすると瀕死交代だけになる）。
  allowVoluntarySwitch?: boolean;
  // メガストーン持ちを先頭に出す（false にすると team[0] 固定。アブレーション用）。
  leadWithMega?: boolean;
  // 天候・フィールドの始動役を先頭に出す（既定 true）。false なら メガ→team[0] の順で選ぶ。
  leadWithSetter?: boolean;
}

export class HeuristicBattleAgent implements BattleAgent {
  private readonly allowVoluntarySwitch: boolean;
  private readonly leadWithMega: boolean;
  private readonly leadWithSetter: boolean;

  constructor(private readonly rng: RandomSource = SYSTEM_RANDOM, options: HeuristicOptions = {}) {
    this.allowVoluntarySwitch = options.allowVoluntarySwitch ?? true;
    this.leadWithMega = options.leadWithMega ?? true;
    this.leadWithSetter = options.leadWithSetter ?? true;
  }

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    // 相手の情報が無い段階なので、選出の判断はしない。ただし「メガストーン持ちを先頭に置く」だけは
    // 行う。team[0] 固定だと、メガ枠が2番目以降の構築が1ターン目からメガを出せず、
    // 構築の強さではなく並び順を測ってしまう（2026-10-20 の検証で判明）。
    // 天候・フィールドの始動役を先頭に置く。イエカメ（イエッサン初手→メガカメックス）のように
    // 「場を整えてからエースを通す」構築は、先頭を間違えると構築の意図が消える。
    if (this.leadWithSetter) {
      const setter = team.find((pokemon) => SETTER_ABILITIES.has(pokemon.ability));
      if (setter) return setter;
    }
    if (this.leadWithMega) {
      const megaHolder = team.find((pokemon) => pokemon.item !== null && /ite(-z)?$/.test(pokemon.item));
      if (megaHolder) return megaHolder;
    }
    return team[0];
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const { moves, switches, canMegaEvolve } = getLegalActions(context);

    if (moves.length === 0) {
      if (switches.length === 0) return { action: { type: 'forfeit' } };
      const ranked = this.rankSwitches(context, switches);
      return { action: { type: 'switch', pokemonIndex: ranked[0]!.index } };
    }

    const scored: ScoredAction[] = moves.map(({ index, move }) => {
      const ratio = damageRatio(context.self, context.opponent, move, context.field);
      const lethal = ratio >= hpRatio(context.opponent) ? 1000 : 0;
      const damageScore = (ratio * 400 + lethal) * selfDropPenalty(move);
      const utility = move.category === 'status' ? statusMoveScore(move, context) : 0;
      const pivotBonus = move.pivot ? 10 : 0;
      return {
        action: { type: 'move', moveIndex: index, target: 0, megaEvolve: canMegaEvolve || undefined },
        score: damageScore + utility + pivotBonus,
        label: move.name,
      };
    });

    // 引っ込める判断: 決定打が無く、体力が少ない／相手の決定打を耐えられない場合のみ。
    const best = this.pickBest(scored);
    const bestDamageRatio = Math.max(
      ...context.self.moves.map((move) => damageRatio(context.self, context.opponent, move, context.field)),
    );
    const incomingWorst = Math.max(
      ...context.opponent.moves.map((move) => damageRatio(context.opponent, context.self, move)),
    );
    const noAnswer = bestDamageRatio < 0.25;
    const inDanger = hpRatio(context.self) < 0.4 || incomingWorst >= 0.8;
    if (this.allowVoluntarySwitch && noAnswer && inDanger && switches.length > 0) {
      const candidate = this.rankSwitches(context, switches)[0]!;
      if (matchupScore(candidate.pokemon, context) > -60) {
        return { action: { type: 'switch', pokemonIndex: candidate.index } };
      }
    }

    return { action: best.action, reasoning: `${best.label}（score ${best.score.toFixed(1)}）` };
  }

  // 同点は乱数で崩す（seed固定なら再現する）。
  private pickBest(scored: ScoredAction[]): ScoredAction {
    const max = Math.max(...scored.map((entry) => entry.score));
    const ties = scored.filter((entry) => entry.score >= max - EPSILON);
    return ties[Math.floor(this.rng.next() * ties.length)]!;
  }

  private rankSwitches(
    context: BattleContext,
    switches: { pokemon: Pokemon; index: number }[],
  ): { pokemon: Pokemon; index: number }[] {
    return [...switches].sort((a, b) => matchupScore(b.pokemon, context) - matchupScore(a.pokemon, context));
  }
}
