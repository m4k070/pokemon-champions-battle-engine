// 凍結ベースライン v1。
//
// 2026-10-24 時点の方策をそのまま複製したもの。以降の変更はこのファイルには入れない。
// A/B の相手を固定するための基準で、ここを更新すると過去の比較が無効になる。
import type { Pokemon } from '../../pokemon.js';
import type { MoveData, StatStageKey, TypeName } from '../../types.js';
import { STAT_STAGE_KEYS } from '../../types.js';
import { TYPE_CHART } from '../../type-chart.js';
import { SYSTEM_RANDOM } from '../../rng.js';
import type { RandomSource } from '../../rng.js';
import { getLegalActions } from '../battle-agent.js';
import { compatibleSets, defaultBelief, statusMoveProbability } from '../opponent-belief.js';
import type { Belief } from '../opponent-belief.js';
import type { BattleAgent, BattleContext, AgentDecision } from '../battle-agent.js';

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
  // アシストパワー: 能力上昇1段階につき威力+20（本編仕様）。バトンタッチで引き継いだ後が本命。
  if (move.storedPower) {
    const stages = (['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'] as const)
      .reduce((sum, key) => sum + Math.max(0, attacker.statStages[key]), 0);
    effectivePower = Math.min(860, 20 + 20 * stages);
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

// 相手の技が見えないとき（不完全情報モード）の被ダメージ推定。
// タイプ一致・威力90相当の攻撃が飛んでくる、という相場観で代用する。
function unknownThreatRatio(attacker: Pokemon, defender: Pokemon): number {
  const category = attacker.stats.ATK >= attacker.stats.SPATK ? 'physical' : 'special';
  const attack = category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;
  const defense = category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;
  let worst = 0;
  for (const type of attacker.types) {
    const effectiveness = typeMultiplier(type, defender.types);
    if (effectiveness === 0) continue;
    const ratio = (90 * effectiveness * 1.5 * (attack / Math.max(1, defense)) * 0.09) / Math.max(1, defender.maxHP);
    worst = Math.max(worst, ratio);
  }
  return worst;
}

// 相手から受ける最大打点（技が見えなければタイプ一致の想定で補う）。
function worstIncomingRatio(context: BattleContext, defender: Pokemon): number {
  if (context.opponent.moves.length === 0) return unknownThreatRatio(context.opponent, defender);
  return Math.max(
    0,
    ...context.opponent.moves.map((move) => damageRatio(context.opponent, defender, move, context.field)),
  );
}

// 相手の未公開枠を信念で平均した「受ける最大打点」。
// 伏せられた技を「無い」と扱うと脅威を過小評価するため、候補セット全体で平均する。
function expectedWorstIncomingRatio(
  context: BattleContext,
  defender: Pokemon,
  belief: Belief = defaultBelief(),
): number {
  const sets = compatibleSets(context.opponent, belief);
  if (sets.length === 0) return worstIncomingRatio(context, defender);
  let total = 0;
  for (const set of sets) {
    const revealed = context.opponent.moves;
    const moves = [...revealed];
    for (const move of set.moves) {
      if (moves.length >= 4) break;
      if (moves.some((known) => known.name === move.name)) continue;
      moves.push(move);
    }
    const worst = Math.max(0, ...moves.map((move) => damageRatio(context.opponent, defender, move, context.field)));
    total += worst;
  }
  return total / sets.length;
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

// 能力ランクの上昇合計（ATK/DEF/SPATK/SPDEF/SPEED）。
function positiveStageSum(pokemon: Pokemon): number {
  return (['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'] as const)
    .reduce((sum, key) => sum + Math.max(0, pokemon.statStages[key]), 0);
}

// その個体が相手に通せる最大のダメージ比率。
function bestDamageAgainst(attacker: Pokemon, defender: Pokemon, field?: BattleContext['field']): number {
  let best = 0;
  for (const move of attacker.moves) {
    if (move.category === 'status' || move.pp <= 0) continue;
    best = Math.max(best, damageRatio(attacker, defender, move, field));
  }
  return best;
}

// バトンタッチで能力変化を渡したとき、受け手の打点がどれだけ伸びるか（最大の伸び）。
// extra は「これから積む分」を渡す前評価に含めるための差分。
function passGain(
  context: BattleContext,
  extra: { stat: StatStageKey; delta: number }[] = [],
): number {
  const self = context.self;
  let best = 0;
  for (const candidate of context.selfTeam) {
    if (candidate.isFainted || candidate === self) continue;
    const before = bestDamageAgainst(candidate, context.opponent, context.field);
    const original = { ...candidate.statStages };
    const boosted = { ...original };
    for (const key of STAT_STAGE_KEYS) {
      boosted[key] = Math.max(-6, Math.min(6, boosted[key] + self.statStages[key]));
    }
    for (const change of extra) {
      boosted[change.stat] = Math.max(-6, Math.min(6, boosted[change.stat] + change.delta));
    }
    Object.assign(candidate.statStages, boosted);
    const after = bestDamageAgainst(candidate, context.opponent, context.field);
    Object.assign(candidate.statStages, original);
    best = Math.max(best, after - before);
  }
  return best;
}

// バトンタッチで渡した能力変化を、受け手が何ターン活かせるか見込む係数。
const SWEEP_HORIZON = 3;

// 積み技か（自分の能力を上げる変化技）。
function isSetupMove(move: MoveData): boolean {
  return (move.selfStatChange ?? []).some((change) => change.delta > 0);
}

function statusMoveScore(
  move: MoveData,
  context: BattleContext,
  belief: Belief = defaultBelief(),
  substituteScoring: 'expectation' | 'legacy' | 'off' = 'expectation',
): number {
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
    const worstIncoming = worstIncomingRatio(context, self);
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

  // あくび: 相手が状態異常でなく、まだねむけでもないときだけ価値がある。
  // ねむけを見ないと、寝る前の相手に撃ち続けて空振りする（実測で44%が空振りだった）。
  if (move.inflictsDrowsy) {
    return opponent.status === null && !opponent.isDrowsy ? 85 : 0;
  }

  // 状態異常を入れる技（でんじは・おにび・どくどく等）
  if (move.category === 'status' && move.status) {
    return opponent.status === null ? 70 : 0;
  }

  if (move.inflictsEncore) return 30;
  if (move.resetsStatStages) return boostTotal(opponent) > 0 ? 60 : 0;
  // みがわり: 置くだけで満足せず、次の3条件で価値を決める。
  // (a) 1発で壊れない（身代わりHPは最大HPの1/4）、(b) 相手が変化技を持っている、
  // (c) こちらに積み技があり、相手を脅かしている（＝相手が引く場面＝交代読みの代用）。
  if (move.createsSubstitute) {
    // 'off': この形式ではみがわりがマイナス（アブレーションで削除が最善）。撃たない。
    if (substituteScoring === 'off') return 0;
    // 既に身代わりがいる場合は必ず失敗する（エンジンが「うまくきまらなかった」を返す）。
    // 実測: 身代わり中の意思決定96件のうち74件がみがわりの再選択だった。
    if (self.substituteHP > 0) return 0;
    if (selfHp <= 0.35) return 0;
    let score = selfHp > 0.5 ? 15 : 0;
    const hasSetup = self.moves.some((candidate) => isSetupMove(candidate));
    if (substituteScoring === 'legacy') {
      // 旧実装: 見えている技だけを見る（伏せられた変化技を「無い」と誤読する）。
      const incoming = worstIncomingRatio(context, self);
      if (incoming > 0 && incoming <= 0.25) score += 20;
      const knownStatusMoves = opponent.moves.filter(
        (known) => known.inflictsDrowsy || known.inflictsEncore || (known.category === 'status' && known.status !== null),
      ).length;
      if (knownStatusMoves > 0) score += 20;
      if (hasSetup) score += 15;
      if (bestDamageAgainst(self, opponent, context.field) >= 0.35) score += 10;
      return score;
    }
    // 信念ベース: 未公開の枠を確率で扱う（見えていない＝無い、にしない）。
    const incoming = expectedWorstIncomingRatio(context, self, belief);
    if (incoming > 0 && incoming <= 0.25) score += 20;
    score += Math.round(20 * statusMoveProbability(opponent, belief));
    if (hasSetup) score += 15;
    if (bestDamageAgainst(self, opponent, context.field) >= 0.35) score += 10;
    return score;
  }
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

// 交代先の評価。相手から受ける最大打点と、こちらが通せる打点の和で順位づけする。
// 不完全情報モードでは相手の技が未知なので、タイプ一致の想定で補う（worstIncomingRatio）。
function matchupScore(candidate: Pokemon, context: BattleContext): number {
  const incoming = worstIncomingRatio(context, candidate);
  let outgoing = 0;
  for (const move of candidate.moves) {
    if (move.pp <= 0) continue;
    outgoing = Math.max(outgoing, damageRatio(candidate, context.opponent, move, context.field));
  }
  // 被ダメージが小さいほど高評価。1発で沈む候補は大きく減点する。
  const survivability = incoming >= 0.9 ? -120 : -incoming * 100;
  return survivability + outgoing * 160;
}

export interface HeuristicV1Options {
  // 相手の型に関する信念（省略時はメタの構築プールから作る）。
  belief?: Belief;
  // みがわりの評価式。'legacy' は旧実装（伏せ情報を「無い」と扱う）。A/B用。
  substituteScoring?: 'expectation' | 'legacy' | 'off';

  // 自分から交代するか（アブレーション用。false にすると瀕死交代だけになる）。
  allowVoluntarySwitch?: boolean;
  // メガストーン持ちを先頭に出す（false にすると team[0] 固定。アブレーション用）。
  leadWithMega?: boolean;
  // 天候・フィールドの始動役を先頭に出す（既定 true）。false なら メガ→team[0] の順で選ぶ。
  leadWithSetter?: boolean;
}

export class HeuristicV1BattleAgent implements BattleAgent {
  private readonly allowVoluntarySwitch: boolean;
  private readonly leadWithMega: boolean;
  private readonly leadWithSetter: boolean;

  // 直近の selectAction で各候補に付けたスコア（ハイブリッド方策の「迷い検出」用）。
  lastEvaluation: { label: string; score: number; kind: 'move' | 'switch' }[] = [];

  private readonly belief: Belief;
  private readonly substituteScoring: 'expectation' | 'legacy' | 'off';

  constructor(private readonly rng: RandomSource = SYSTEM_RANDOM, options: HeuristicV1Options = {}) {
    this.belief = options.belief ?? defaultBelief();
    this.substituteScoring = options.substituteScoring ?? 'legacy';
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
      this.lastEvaluation = ranked.map(({ pokemon }) => ({
        label: `交代:${pokemon.name}`,
        score: matchupScore(pokemon, context),
        kind: 'switch' as const,
      }));
      return { action: { type: 'switch', pokemonIndex: ranked[0].index } };
    }

    // バトンタッチ（能力変化を引き継いで退場する技）の価値。
    // 「積む→渡す」が噛み合う構築では、この2手を評価しないと永久に選ばれない。
    const hasPassMove = moves.some(({ move }) => move.passStats);
    const stagesHeld = positiveStageSum(context.self);
    const passGainNow = hasPassMove ? passGain(context) : 0;

    const scored: ScoredAction[] = moves.map(({ index, move }) => {
      const ratio = damageRatio(context.self, context.opponent, move, context.field);
      const lethal = ratio >= hpRatio(context.opponent) ? 1000 : 0;
      // ふいうち等「相手の行動を条件にする技」は、相手が変化技を击つと空振りする。
      // 相手の選択を予測しない方策では当てにできないので割り引く（実測: グソクムシャ構築の改善）。
      const conditionalPenalty = move.category !== 'status' && move.failsUnlessTargetAttacks ? 0.35 : 1;
      const damageScore = (ratio * 400 + lethal) * selfDropPenalty(move) * conditionalPenalty;
      let utility = move.category === 'status' ? statusMoveScore(move, context, this.belief, this.substituteScoring) : 0;
      if (hasPassMove) {
        // 渡す技そのもの: 積んだ段数が多いほど、かつ瀕死に近いほど（＝今渡す価値が高い）加点。
        if (move.passStats) {
          // 渡した後の受け手は複数ターン戦うので、1発分ではなく数ターン分として評価する。
          utility = stagesHeld > 0 ? passGainNow * 400 * SWEEP_HORIZON * (1 + (1 - hpRatio(context.self))) : 0;
        } else if (move.category === 'status' && isSetupMove(move)) {
          // 積み技: 「積んでから渡す」将来の伸びを先に見込む（渡す1ターンが残るので半減）。
          const changes = (move.selfStatChange ?? []).filter((change) => change.delta > 0);
          utility += passGain(context, changes) * 200 * SWEEP_HORIZON;
        }
      }
      const pivotBonus = move.pivot ? 10 : 0;
      // 何も積んでいないバトンタッチは、交代するだけの空振り。pivotボーナスも与えない。
      const emptyPass = move.passStats && stagesHeld === 0;
      return {
        action: { type: 'move', moveIndex: index, target: 0, megaEvolve: canMegaEvolve || undefined },
        score: emptyPass ? 0 : damageScore + utility + pivotBonus,
        label: move.name,
      };
    });

    this.lastEvaluation = scored.map(({ label, score }) => ({ label, score, kind: 'move' as const }));

    // 引っ込める判断: 決定打が無く、体力が少ない／相手の決定打を耐えられない場合のみ。
    const best = this.pickBest(scored);
    const bestDamageRatio = Math.max(
      ...context.self.moves.map((move) => damageRatio(context.self, context.opponent, move, context.field)),
    );
    const incomingWorst = worstIncomingRatio(context, context.self);
    const noAnswer = bestDamageRatio < 0.25;
    const inDanger = hpRatio(context.self) < 0.4 || incomingWorst >= 0.8;
    if (this.allowVoluntarySwitch && noAnswer && inDanger && switches.length > 0) {
      const candidate = this.rankSwitches(context, switches)[0];
      if (matchupScore(candidate.pokemon, context) > -60) {
        this.lastEvaluation = [
          { label: `交代:${candidate.pokemon.name}`, score: matchupScore(candidate.pokemon, context), kind: 'switch' as const },
          ...this.lastEvaluation,
        ];
        return { action: { type: 'switch', pokemonIndex: candidate.index } };
      }
    }

    return { action: best.action, reasoning: `${best.label}（score ${best.score.toFixed(1)}）` };
  }

  // 同点は乱数で崩す（seed固定なら再現する）。
  private pickBest(scored: ScoredAction[]): ScoredAction {
    const max = Math.max(...scored.map((entry) => entry.score));
    const ties = scored.filter((entry) => entry.score >= max - EPSILON);
    return ties[Math.floor(this.rng.next() * ties.length)];
  }

  private rankSwitches(
    context: BattleContext,
    switches: { pokemon: Pokemon; index: number }[],
  ): { pokemon: Pokemon; index: number }[] {
    return [...switches].sort((a, b) => matchupScore(b.pokemon, context) - matchupScore(a.pokemon, context));
  }
}
