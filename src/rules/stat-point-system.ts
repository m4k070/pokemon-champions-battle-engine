import type { BaseStats, Stats, StatKey, StatStageKey } from '../types.js';

export interface StatPointsData {
  HP: number;
  ATK: number;
  DEF: number;
  SPATK: number;
  SPDEF: number;
  SPEED: number;
}

/** 能力ポイントは一部だけ指定できる。省略した能力は0（無振り）として扱う。 */
export type StatPointsInput = Partial<StatPointsData>;

/** 性格による能力補正。up の能力が1.1倍、down の能力が0.9倍になる。 */
export interface NatureModifier {
  up: StatStageKey;
  down: StatStageKey;
}

/** 補正のある20種の性格。無補正の5種（がんばりや・すなお・てれや・きまぐれ・まじめ）は含めない。 */
export const NATURES: Record<string, NatureModifier> = {
  いじっぱり: { up: 'ATK', down: 'SPATK' },
  ゆうかん: { up: 'ATK', down: 'SPEED' },
  やんちゃ: { up: 'ATK', down: 'SPDEF' },
  さみしがり: { up: 'ATK', down: 'DEF' },
  ずぶとい: { up: 'DEF', down: 'ATK' },
  わんぱく: { up: 'DEF', down: 'SPATK' },
  のうてんき: { up: 'DEF', down: 'SPDEF' },
  のんき: { up: 'DEF', down: 'SPEED' },
  ひかえめ: { up: 'SPATK', down: 'ATK' },
  おっとり: { up: 'SPATK', down: 'DEF' },
  うっかりや: { up: 'SPATK', down: 'SPDEF' },
  れいせい: { up: 'SPATK', down: 'SPEED' },
  おだやか: { up: 'SPDEF', down: 'ATK' },
  おとなしい: { up: 'SPDEF', down: 'DEF' },
  しんちょう: { up: 'SPDEF', down: 'SPATK' },
  なまいき: { up: 'SPDEF', down: 'SPEED' },
  おくびょう: { up: 'SPEED', down: 'ATK' },
  せっかち: { up: 'SPEED', down: 'DEF' },
  ようき: { up: 'SPEED', down: 'SPATK' },
  むじゃき: { up: 'SPEED', down: 'SPDEF' },
};

/** vault の育成論で使われる漢字表記をひらがな表記に寄せる。 */
export const NATURE_ALIASES: Record<string, string> = {
  意地っ張り: 'いじっぱり',
  勇敢: 'ゆうかん',
  腕白: 'わんぱく',
  能天気: 'のうてんき',
  控えめ: 'ひかえめ',
  冷静: 'れいせい',
  穏やか: 'おだやか',
  慎重: 'しんちょう',
  生意気: 'なまいき',
  臆病: 'おくびょう',
  陽気: 'ようき',
  無邪気: 'むじゃき',
};

/** 性格名（ひらがな・漢字どちらでも可）、または補正そのものを直接指定する。 */
export type NatureInput = string | NatureModifier | null;

const NATURE_BOOST_MULTIPLIER = 1.1;
const NATURE_PENALTY_MULTIPLIER = 0.9;
const NATURE_NEUTRAL_MULTIPLIER = 1.0;

/**
 * 性格補正の倍率を返す。
 * 未知の性格名・無補正の性格・HP に対しては 1.0 を返す（HP に性格補正は掛からない）。
 */
export function natureMultiplier(nature: NatureInput, stat: StatKey): number {
  if (nature === null) return NATURE_NEUTRAL_MULTIPLIER;
  if (stat === 'HP') return NATURE_NEUTRAL_MULTIPLIER;

  const modifier = typeof nature === 'object' ? nature : NATURES[NATURE_ALIASES[nature] ?? nature];
  if (modifier === undefined) return NATURE_NEUTRAL_MULTIPLIER;

  // 同じ能力を上げ下げする指定は無補正扱い（本編の無補正性格と同じ）。
  if (modifier.up === stat && modifier.down === stat) return NATURE_NEUTRAL_MULTIPLIER;
  if (modifier.up === stat) return NATURE_BOOST_MULTIPLIER;
  if (modifier.down === stat) return NATURE_PENALTY_MULTIPLIER;
  return NATURE_NEUTRAL_MULTIPLIER;
}

const NON_HP_STATS: StatStageKey[] = ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];

// Champions では個体値が廃止され、全能力が最大値（31相当）に固定されている。
const FIXED_INDIVIDUAL_VALUE = 31;

function normalizeStatPoints(statPoints: StatPointsInput): StatPointsData {
  return { HP: 0, ATK: 0, DEF: 0, SPATK: 0, SPDEF: 0, SPEED: 0, ...statPoints };
}

export class StatPointSystem {
  readonly maxPointsPerStat = 32;
  readonly maxTotalPoints = 66;

  validateStatPoints(points: StatPointsData): boolean {
    const total = Object.values(points).reduce((sum, val) => sum + val, 0);

    if (total > this.maxTotalPoints) {
      throw new Error(`能力ポイント合計が上限を超えています: ${total}/${this.maxTotalPoints}`);
    }

    for (const [stat, value] of Object.entries(points)) {
      if (value > this.maxPointsPerStat) {
        throw new Error(`${stat}の能力ポイントが上限を超えています: ${value}/${this.maxPointsPerStat}`);
      }
    }

    return true;
  }

  /**
   * 実数値を計算する。
   *
   * Champions の能力ポイントは **1ポイント = 実数値1** であり、本編の努力値（4ポイントで実数値1）とは
   * 別物である。加算は性格補正の前に行う。
   *
   *   HP     = floor((種族値*2 + 31) * Lv/100) + Lv + 10 + ポイント
   *   HP以外 = floor( ( floor((種族値*2 + 31) * Lv/100) + 5 + ポイント ) * 性格補正 )
   *
   * 検証: カバルドン B154/HP215・ドリュウズ A205（シーズンM-1 最終51位）、
   * 最速100族 167 / 142族 213 / 102族 169 / 80族 145（M-B 素早さ早見表）の7ケースで一致を確認済み。
   *
   * @param statPoints 能力ポイント。省略した能力は0（無振り）
   * @param nature     性格。省略時は無補正
   */
  calculateStats(
    baseStats: BaseStats,
    statPoints: StatPointsInput = {},
    nature: NatureInput = null,
    level = 50,
  ): Stats {
    const points = normalizeStatPoints(statPoints);
    this.validateStatPoints(points);

    const stats = {} as Stats;

    // HP のみ計算式が異なり、性格補正も掛からない。
    stats.HP =
      Math.floor(((baseStats.HP * 2 + FIXED_INDIVIDUAL_VALUE) * level) / 100) + level + 10 + points.HP;

    for (const stat of NON_HP_STATS) {
      const beforeNature =
        Math.floor(((baseStats[stat] * 2 + FIXED_INDIVIDUAL_VALUE) * level) / 100) + 5 + points[stat];
      stats[stat] = Math.floor(beforeNature * natureMultiplier(nature, stat));
    }

    return stats;
  }
}

export class Level50System {
  private system: StatPointSystem;

  constructor() {
    this.system = new StatPointSystem();
  }

  calculateStats(
    baseStats: BaseStats,
    statPoints: StatPointsInput = {},
    nature: NatureInput = null,
  ): Stats {
    return this.system.calculateStats(baseStats, statPoints, nature, 50);
  }
}
