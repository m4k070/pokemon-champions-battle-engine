import { EventEmitter } from './event-emitter.js';
import { TYPE_CHART } from './type-chart.js';
import { BattleField } from './battle-field.js';
import type { TerrainType } from './battle-field.js';
import { getAbilityDefinition } from './rules/abilities/registry.js';
import { Pokemon } from './pokemon.js';
import type { MoveData, StatusCondition, StatStageKey, TypeName, WeatherType, TypeChart } from './types.js';
import { STAT_STAGE_KEYS } from './types.js';
import { isDamageMove, isPhysicalMove, isSpecialMove, isStatusMove, cloneDamageMove, targetsOpponent } from './move.js';
import type { UseMoveResult, NoEffectReason } from './use-move-result.js';
import { SYSTEM_RANDOM } from './rng.js';
import { isMegaStone } from './rules/mega-evolution.js';
import type { RandomSource } from './rng.js';

export type { UseMoveResult, MoveFailureReason, NoEffectReason } from './use-move-result.js';

export interface MoveLogEntry {
  turn: number;
  side: 0 | 1;
  pokemonName: string;
  moveName: string;
  moveType: string;
  moveCategory: string;
}

// 猛毒(どくどく)のダメージ増加は本編仕様に合わせて15ターン目で頭打ちにする。
const TOXIC_MAX_COUNTER = 15;

// アンコール: 相手の直前の技を固定するターン数（本編仕様）。
const ENCORE_TURNS = 3;
// ちょうはつの持続。ターン終了時に1減るので、相手がまだ動いていないターンに当てると、そのターンを含めて3回の行動を封じる。
// 本編は相手が先に動いた後に当てると4ターンになるが、そこは区別していない。
const TAUNT_TURNS = 3;

// ターン終了時の割合ダメージの分母（やけどは最大HPの1/16、どくは1/8）。
// 猛毒は経過ターン数 n に対して maxHP * n / 16。
const BURN_DAMAGE_DENOMINATOR = 16;
const POISON_DAMAGE_DENOMINATOR = 8;
const TOXIC_DAMAGE_DENOMINATOR = 16;

// ウェザーボールは天候下でタイプが変化する（無天候時はノーマル固定のまま）。
const WEATHER_BALL_TYPE: Partial<Record<WeatherType, TypeName>> = {
  rain: 'water',
  sun: 'fire',
  sand: 'rock',
  hail: 'ice',
};

// だいちのはどう: フィールドの種類に応じてタイプが変わる（威力は2倍）。
// 使用者が接地しているときだけ適用する（ふゆう・ひこうは変化しない）。
// タイプ強化の持ち物: 対応するタイプの技の威力1.2倍（本編仕様）。
const TYPE_BOOST_ITEMS: Partial<Record<string, TypeName>> = {
  'black-glasses': 'dark',
  'dragon-fang': 'dragon',
  'mystic-water': 'water',
  'spell-tag': 'ghost',
};

// グラスフィールドで威力が半減する地面技（本編仕様。マグニチュードも対象だがチャンピオンズに無い）。
const GRASSY_HALVED_MOVE_NAMES = new Set(['じしん', 'じならし', 'earthquake', 'bulldoze']);

const TERRAIN_PULSE_TYPE: Record<NonNullable<TerrainType>, TypeName> = {
  'electric-terrain': 'electric',
  'psychic-terrain': 'psychic',
  'grassy-terrain': 'grass',
  'misty-terrain': 'fairy',
};

// あさのひざし等、天候依存の自己回復技の回復割合（本編仕様）。
const WEATHER_HEAL_PERCENT: Record<'none' | WeatherType, number> = {
  none: 0.5,
  sun: 2 / 3,
  rain: 0.25,
  sand: 0.25,
  hail: 0.25,
};

// ダメージの揺れ幅（本編・チャンピオンズ共通の16段階）。
// 0.85, 0.86, ... 0.99, 1.00 のいずれかを等確率で引く。
// 出典: champions.pokewiki.net「ダメージ計算式」（乱数は16パターン・各1/16）。
const DAMAGE_ROLL_MIN_PERCENT = 85;
const DAMAGE_ROLL_STEPS = 16;

// 急所。第7世代以降は1/24で発生し、ダメージが1.5倍になる。
// 壁（リフレクター等）と、攻撃側のマイナスランク・防御側のプラスランクを無視する。
// 出典: champions.pokewiki.net「ダメージ計算式」（急所 1/24・1.5倍・不利ランクと壁を無視）。
const CRIT_CHANCE_DENOMINATOR = 24;
const CRIT_MULTIPLIER = 1.5;

// 通常配分の多段技（スキルリンク等は非対応）のヒット数分布。
const MULTI_HIT_TABLE: { hits: number; weight: number }[] = [
  { hits: 2, weight: 0.375 },
  { hits: 3, weight: 0.375 },
  { hits: 4, weight: 0.125 },
  { hits: 5, weight: 0.125 },
];

// 変化技による状態異常付与を無効化するタイプ。
// 該当タイプを1つでも持つ相手には状態異常が入らない。
// じめんタイプはでんじはを無効化するが、まひそのものは通るため paralysis には含めない。
const STATUS_IMMUNE_TYPES: Partial<Record<StatusCondition, TypeName[]>> = {
  paralysis: ['electric'],
  burn: ['fire'],
  sleep: ['grass'],
  poison: ['steel'],
};

export interface BattleEngineOptions {
  // 乱数の供給源。省略時はシステム乱数（再現不可。従来の挙動）。
  rng?: RandomSource;
}

// 実数値・ダメージ補正の計算条件。急所かどうかで「不利なランクを無視する」等が変わる。
export interface AttackCalculationOptions {
  critical?: boolean;
  // ダメージ計算の相手。イカサマ（相手のこうげきを使う）で参照する。
  // 省略時は getOpponent(attacker) にフォールバックする。
  defender?: Pokemon;
}

export class BattleEngine {
  events: EventEmitter;
  rng: RandomSource;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  turn: number;
  log: string[];
  moveLog: MoveLogEntry[];
  typeChart: TypeChart;
  field: BattleField;

  private activePokemon0: Pokemon | null = null;
  private activePokemon1: Pokemon | null = null;
  // いのちのたまの反動は「そのターンにダメージを与えた攻撃者」だけに発動するため、
  // ターンをまたいで参照できるようendTurn()で記録・end-turnイベント処理後にリセットする。
  private attackersDealtDamageThisTurn: Set<Pokemon> = new Set();
  // そのターンにダメージを受けたポケモン（ダメおしの威力2倍判定に使う）。
  private defendersDamagedThisTurn: Set<Pokemon> = new Set();

  constructor(options: BattleEngineOptions = {}) {
    this.rng = options.rng ?? SYSTEM_RANDOM;
    this.events = new EventEmitter();
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.turn = 0;
    this.log = [];
    this.moveLog = [];
    this.typeChart = TYPE_CHART;
    this.field = new BattleField();
    this.setupEventHandlers();
  }

  private sideKey(side: 0 | 1): 'playerA' | 'playerB' {
    return side === 0 ? 'playerA' : 'playerB';
  }

  private opposingSide(side: 0 | 1): 0 | 1 {
    return side === 0 ? 1 : 0;
  }

  setStealthRock(side: 0 | 1): void {
    const key = this.sideKey(side);
    if (this.field.stealthRock[key]) return;
    this.field.stealthRock[key] = true;
    this.log.push(`${side === 0 ? 'プレイヤーA' : 'プレイヤーB'}側の場にステルスロックが設置された`);
  }

  setActivePokemon(side: 0 | 1, pokemon: Pokemon): void {
    if (side === 0) {
      this.activePokemon0 = pokemon;
    } else {
      this.activePokemon1 = pokemon;
    }
  }

  getOpponent(pokemon: Pokemon): Pokemon | null {
    if (this.activePokemon0 === pokemon) return this.activePokemon1;
    if (this.activePokemon1 === pokemon) return this.activePokemon0;
    return null;
  }

  getSide(pokemon: Pokemon): 0 | 1 | null {
    if (this.activePokemon0 === pokemon) return 0;
    if (this.activePokemon1 === pokemon) return 1;
    return null;
  }

  // ---- 特性の観測・共通判定 ----
  // 特性の効果は持ち物と違い双方から観測できるので、viewer ごとではなく個体に記録する。

  // 登録済みのチーム。フラワーヴェールやそうだいしょうのように味方の状態を見る特性で使う。
  private registeredTeams: [Pokemon[], Pokemon[]] | null = null;

  registerTeams(teamA: Pokemon[], teamB: Pokemon[]): void {
    this.registeredTeams = [teamA, teamB];
  }

  // 特性の挙動が外から見えたことを記録する（不完全情報モードの赤化判定に使う）。
  observeAbility(pokemon: Pokemon): void {
    pokemon.abilityRevealed = true;
  }

  teamOf(pokemon: Pokemon): Pokemon[] {
    if (!this.registeredTeams) return [pokemon];
    const [teamA, teamB] = this.registeredTeams;
    if (teamA.includes(pokemon)) return teamA;
    if (teamB.includes(pokemon)) return teamB;
    return [pokemon];
  }

  // フラワーヴェール: くさタイプの自分・味方は能力を下げられず、状態異常にもならない。
  flowerVeilProtects(pokemon: Pokemon): boolean {
    if (!pokemon.types.includes('grass')) return false;
    return this.teamOf(pokemon).some((ally) => !ally.isFainted && ally.ability === 'flower-veil');
  }

  // 特性による状態異常の無効化（ふみん・じゅうなん・ねつこうかん・フラワーヴェール）。
  blocksStatusByAbility(target: Pokemon, status: StatusCondition): boolean {
    if (this.flowerVeilProtects(target)) return true;
    if (status === 'sleep' && target.ability === 'insomnia') return true;
    if (status === 'paralysis' && target.ability === 'limber') return true;
    if (status === 'burn' && (target.ability === 'thermal-exchange' || target.ability === 'water-bubble')) return true;
    return false;
  }

  // どくげしょう: 対象の陣営の場にどくびしを置く（最大2層）。
  addToxicSpikes(pokemon: Pokemon, layers = 1): void {
    const side = this.getSide(pokemon);
    if (side === null) return;
    const key = this.sideKey(side);
    const before = this.field.toxicSpikes[key];
    this.field.toxicSpikes[key] = Math.min(2, before + layers);
    if (this.field.toxicSpikes[key] !== before) {
      this.log.push(`${pokemon.name}側の場にどくびしが${this.field.toxicSpikes[key]}層設置された`);
    }
  }

  // こぼれダネ等が地形を展開する。
  setTerrainFromAbility(terrain: NonNullable<TerrainType>, turns = 5): void {
    this.field.terrain = terrain;
    this.field.terrainTurnsLeft = turns;
  }

  private setupEventHandlers(): void {
    this.events.on('switch-in', (data) => {
      const p = data.pokemon;
      if (!(p instanceof Pokemon)) return;

      const ability = getAbilityDefinition(p.ability);
      ability?.onSwitchIn?.({ pokemon: p, engine: this });
    });

    this.events.on('end-turn', (data) => {
      const team = data.team;
      if (!Array.isArray(team)) return;

      // 持ち物による回復・反動は「その時点で場に出ているポケモン」にだけ適用する。
      // 以前は team（両陣営の全員＝12体）を回していたため、控えのポケモンが
      // たべのこしで回復し続けていた（2026-10-20 の検証で判明）。
      // activePokemon が未設定のケース（テストで直接エンジンを使う）だけ全員に適用する。
      const actives = [this.activePokemon0, this.activePokemon1].filter(
        (pokemon): pokemon is Pokemon => pokemon !== null,
      );
      const targets = actives.length > 0 ? actives : team;

      for (const p of targets) {
        if (!(p instanceof Pokemon)) continue;
        if (p.isFainted) continue;

        if (p.item === 'leftovers') {
          const heal = Math.floor(p.maxHP / 16);
          p.heal(heal);
          this.log.push(`${p.name}はたべのこしで${heal}回復した`);
        }

        if (p.item === 'life-orb' && this.attackersDealtDamageThisTurn.has(p)) {
          const damage = Math.floor(p.maxHP / 10);
          p.takeDamage(damage, this);
          this.log.push(`${p.name}はいのちのたまの反動で${damage}のダメージを受けた`);
        }

        if (p.item === 'sitrus-berry' && !p.itemUsed) {
          if (p.currentHP <= p.maxHP / 2) {
            const heal = Math.floor(p.maxHP / 4);
            p.heal(heal);
            p.itemUsed = true;
            this.log.push(`${p.name}はオボンのみで${heal}回復した`);
          }
        }

        // カゴのみ: ねむり状態を回復する（1回限り）。
        if (p.item === 'chesto-berry' && !p.itemUsed && p.status === 'sleep') {
          p.removeStatus();
          p.itemUsed = true;
          this.log.push(`${p.name}はカゴのみでねむりから目覚めた`);
        }

        // ラムのみ: 状態異常を回復する（1回限り）。
        if (p.item === 'lum-berry' && !p.itemUsed && p.status) {
          p.removeStatus();
          p.itemUsed = true;
          this.log.push(`${p.name}はラムのみで状態異常が回復した`);
        }

        // どくどくだま: ターン終了時に猛毒状態になる（1回限り）。
        if (p.item === 'toxic-orb' && !p.itemUsed && !p.status) {
          p.applyStatus('badly-poisoned', this.rng);
          p.itemUsed = true;
          this.log.push(`${p.name}はどくどくだまの毒に侵された`);
        }

        // メンタルハーブ: ちょうはつ状態を解除する（1回限り）。
        if (p.item === 'mental-herb' && !p.itemUsed && p.isTaunted) {
          p.resetTaunt();
          p.itemUsed = true;
          this.log.push(`${p.name}はメンタルハーブで挑発を解いた`);
        }

        // スピーダー: ターン終了時に素早さが1段階上がる（消耗品）。
        if (p.item === 'x-speed' && !p.itemUsed) {
          const changed = p.modifyStatStage('SPEED', 1);
          if (changed !== 0) {
            p.itemUsed = true;
            this.log.push(`${p.name}はスピーダーで素早さが上がった`);
          }
        }

        // 特性のターン終了時フック（かそく等）。
        const ability = getAbilityDefinition(p.ability);
        ability?.onEndTurn?.({ pokemon: p, engine: this });
      }
    });

    this.events.on('apply-damage', (data) => {
      const d = data.defender;
      const damage = data.damage;
      if (!(d instanceof Pokemon) || typeof damage !== 'number') return;

      if (d.item === 'focus-sash' && !d.itemUsed && d.currentHP === d.maxHP && damage >= d.currentHP) {
        data.damage = d.currentHP - 1;
        d.itemUsed = true;
        this.log.push(`${d.name}はきあいのタスキで耐えた！`);
      }
    });
  }

  calculateAttack(attacker: Pokemon, move: MoveData, options: AttackCalculationOptions = {}): number {
    // ボディプレスは「こうげき」ではなく「ぼうぎょ」とその能力ランクを参照する（本編仕様）。
    const usesDefense = isDamageMove(move) && move.usesDefenseForAttack === true;
    // イカサマは相手の「こうげき」とその能力ランクを使う（本編仕様）。
    // 使用者のこうげきを参照しないため、やけど・攻撃を強化する特性は適用しない。
    const usesTargetAttack = isDamageMove(move) && move.usesTargetAttack === true;
    const statKey: StatStageKey = usesDefense ? 'DEF' : isPhysicalMove(move) ? 'ATK' : 'SPATK';
    if (usesTargetAttack) {
      const target = options.defender ?? this.getOpponent(attacker);
      if (target) {
        const targetMultiplier = target.getStatStageMultiplier(statKey);
        const targetAttack = Math.floor(target.stats[statKey] * targetMultiplier);
        this.events.emit('calculate-attack', { attacker, move, attack: targetAttack });
        return targetAttack;
      }
    }
    // 急所は攻撃側のマイナスランクを無視する（0段階として扱う）。
    const ignoresDrop = options.critical === true && attacker.statStages[statKey] < 0;
    // 防御側がてんねん(ignoresOpponentStatChanges)なら、攻撃側の能力ランクを無視する。
    const defender = this.getOpponent(attacker);
    const ignoreStages = defender
      ? (getAbilityDefinition(defender.ability)?.ignoresOpponentStatChanges?.() ?? false)
      : false;
    const stageMultiplier = ignoreStages || ignoresDrop ? 1 : attacker.getStatStageMultiplier(statKey);
    let attack = Math.floor(attacker.stats[statKey] * stageMultiplier);

    // やけどは「こうげき」を半減させる効果なので、ぼうぎょを参照する技には効かない。
    // TODO: 出典確認（ちからもち等「こうげき」を倍にする特性との相互作用は未確認）
    if (attacker.status === 'burn' && isPhysicalMove(move) && !usesDefense) {
      attack = Math.floor(attack / 2);
    }

    const ability = getAbilityDefinition(attacker.ability);
    if (ability?.modifyAttack) {
      attack = ability.modifyAttack({ pokemon: attacker, move, value: attack, engine: this });
    }

    this.events.emit('calculate-attack', { attacker, move, attack });

    return attack;
  }

  calculateDefense(defender: Pokemon, move: MoveData, options: AttackCalculationOptions = {}): number {
    const statKey: StatStageKey = isPhysicalMove(move) ? 'DEF' : 'SPDEF';
    // 急所は防御側のプラスランクを無視する（0段階として扱う）。
    const ignoresBoost = options.critical === true && defender.statStages[statKey] > 0;
    // 攻撃側がてんねん(ignoresOpponentStatChanges)なら、防御側の能力ランクを無視する。
    const attacker = this.getOpponent(defender);
    const ignoreStages = attacker
      ? (getAbilityDefinition(attacker.ability)?.ignoresOpponentStatChanges?.() ?? false)
      : false;
    const stageMultiplier = ignoreStages || ignoresBoost ? 1 : defender.getStatStageMultiplier(statKey);
    let defense = Math.floor(defender.stats[statKey] * stageMultiplier);

    const ability = getAbilityDefinition(defender.ability);
    // かたやぶり（mold-breaker）持ちの攻撃は防御側の特性（あついしぼう等）を無視する
    const moldBreaker = attacker ? attacker.ability === 'mold-breaker' : false;
    if (ability?.modifyDefense && !moldBreaker) {
      defense = ability.modifyDefense({ pokemon: defender, move, value: defense, engine: this });
    }

    this.events.emit('calculate-defense', { defender, move, defense });

    return defense;
  }

  calculateBaseDamage(attack: number, defense: number, move: MoveData): number {
    if (move.power === 0) return 0;

    let power = move.power;

    // STAB - check from the move's type, not attacker types here
    // (attacker type check handled in useMove)

    if (this.weather === 'rain' && move.type === 'water') {
      power *= 1.5;
    } else if (this.weather === 'sun' && move.type === 'fire') {
      power *= 1.5;
    } else if (this.weather === 'rain' && move.type === 'fire') {
      power *= 0.5;
    } else if (this.weather === 'sun' && move.type === 'water') {
      power *= 0.5;
    }

    return Math.floor(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2;
  }

  getTypeEffectiveness(attackType: TypeName, defenderTypes: TypeName[]): number {
    let effectiveness = 1.0;
    for (const type of defenderTypes) {
      const chart = this.typeChart[attackType];
      if (chart) {
        effectiveness *= chart[type] ?? 1.0;
      }
    }
    return effectiveness;
  }

  // タイプ相性を求める。攻撃側の特性による補正（きもったま等）も反映する。
  // 変化技の無効判定とダメージ技の倍率計算の双方から使う。
  resolveTypeEffectiveness(attacker: Pokemon, defender: Pokemon, move: MoveData): number {
    // わるあがきはタイプ相性を受けない（本編仕様。無タイプ扱い）。
    if (move.ignoresTypeEffectiveness) return 1;
    const baseEffectiveness = this.getTypeEffectiveness(move.type, defender.types);
    // 攻撃側の特性によるタイプ相性補正（きもったま: Normal/Fighting→Ghost 有効化等）
    const attackerAbility = getAbilityDefinition(attacker.ability);
    if (!attackerAbility?.modifyTypeEffectiveness) return baseEffectiveness;

    return attackerAbility.modifyTypeEffectiveness({
      attackType: move.type,
      defenderTypes: defender.types,
      effectiveness: baseEffectiveness,
      engine: this,
    });
  }

  // ダメージ補正の合成。タイプ相性 → 急所 → 壁（リフレクター）の順に適用する。
  // 急所は壁を貫通するため、壁による軽減は急所のときに適用しない。
  // 乱数（0.85〜1.00）はここでは掛けない（rollDamage が担当）。
  applyModifiers(
    baseDamage: number,
    attacker: Pokemon,
    defender: Pokemon,
    move: MoveData,
    options: AttackCalculationOptions = {}
  ): { finalDamage: number; effectiveness: number } {
    const effectiveness = this.resolveTypeEffectiveness(attacker, defender, move);
    const critical = options.critical === true;
    let finalDamage = Math.floor(baseDamage * effectiveness);

    if (critical) {
      finalDamage = Math.floor(finalDamage * CRIT_MULTIPLIER);
    }

    const defenderSide = this.getSide(defender);
    if (!critical && isPhysicalMove(move) && defenderSide !== null && this.field.reflect[this.sideKey(defenderSide)] > 0) {
      finalDamage = Math.floor(finalDamage / 2);
    }

    // オーロラベール: 張られている側が受けるダメージを半減する（物理・特殊を問わない。本編仕様）。
    // 急所は壁を貫通するため適用しない。
    if (!critical && defenderSide !== null && this.field.auroraVeil[this.sideKey(defenderSide)] > 0) {
      finalDamage = Math.floor(finalDamage / 2);
    }

    this.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness, critical });

    return { finalDamage, effectiveness };
  }

  // くさむすび・けたぐり: 相手の体重で威力が変わる（本編仕様）。
  powerFromWeight(weightKg: number): number {
    if (weightKg < 10) return 20;
    if (weightKg < 25) return 40;
    if (weightKg < 50) return 60;
    if (weightKg < 100) return 80;
    if (weightKg < 200) return 100;
    return 120;
  }

  // はたきおとすで落とせる持ち物か（メガストーンは落とせない）。
  hasRemovableItem(pokemon: Pokemon): boolean {
    return pokemon.item !== null && !isMegaStone(pokemon.item);
  }

  // 急所に当たったかを引く。急所無効の特性（シェルアーマー）を持つ相手には発生しない。
  rollCriticalHit(defender: Pokemon): boolean {
    const ability = getAbilityDefinition(defender.ability);
    if (ability?.preventsCriticalHits?.() === true) return false;
    return this.rng.next() < 1 / CRIT_CHANCE_DENOMINATOR;
  }

  // ダメージの揺れ（0.85〜1.00の16段階）を引く。
  rollDamageFactor(): number {
    const step = Math.floor(this.rng.next() * DAMAGE_ROLL_STEPS);
    return (DAMAGE_ROLL_MIN_PERCENT + step) / 100;
  }

  // 補正後のダメージに揺れを掛ける。タイプ相性が0倍でなければ最低1ダメージ残す（本編仕様）。
  rollDamage(damage: number, effectiveness: number): number {
    if (damage <= 0) return 0;
    const rolled = Math.floor(damage * this.rollDamageFactor());
    return rolled > 0 || effectiveness <= 0 ? rolled : 1;
  }

  // 実ダメージ（特性・持ち物の補正後）を返す。ばけのかわのように特性がダメージを差し替えるため、
  // 呼び出し側は補正前の値ではなく戻り値をログ・反動・ドレインの計算に使う。
  applyDamage(defender: Pokemon, damage: number, attacker?: Pokemon, move?: MoveData): number {
    let effectiveDamage = damage;

    // 特性の被弾時フック（がんじょう・じきゅうりょく・あついしぼう・さめはだ等）。
    // かたやぶり（mold-breaker）持ちの攻撃は防御側の特性を無視する。
    if (attacker && move && attacker.ability !== 'mold-breaker') {
      const ability = getAbilityDefinition(defender.ability);
      const adjusted = ability?.onDamaged?.({ defender, attacker, move, damage, engine: this });
      if (typeof adjusted === 'number') {
        effectiveDamage = adjusted;
        // 軽減・肩代わりが外から見えたので、特性を公開する。
        this.observeAbility(defender);
      }
    }

    // みがわり: 場に身代わりがあるときは、ダメージを身代わりが受ける（本編仕様）。
    // 身代わりが受けたぶんは本体のHPには及ばない。身代わりのHPが0になると壊れる。
    if (defender.substituteHP > 0) {
      const absorbed = Math.min(defender.substituteHP, effectiveDamage);
      defender.substituteHP -= absorbed;
      if (defender.substituteHP <= 0) {
        defender.substituteHP = 0;
        this.log.push(`${defender.name}のみがわりは こわれた`);
      }
      return absorbed;
    }

    // シュカのみ: 地面技のダメージを半減する（1回限り）。
    if (defender.item === 'shuca-berry' && !defender.itemUsed && move?.type === 'ground') {
      effectiveDamage = Math.floor(effectiveDamage / 2);
      defender.itemUsed = true;
      this.log.push(`${defender.name}はシュカのみで地面技のダメージを半減した`);
    }

    // 注意: 戻り値はHP差分ではなく補正後の計算値。きあいのタスキ等が takeDamage 内の
    // apply-damage イベントでダメージをさらに削る場合、その分は戻り値に反映されない
    // （ログ・反動の従来挙動を変えないため）。
    defender.takeDamage(effectiveDamage, this);
    return effectiveDamage;
  }

  useMove(attacker: Pokemon, defender: Pokemon, move: MoveData): UseMoveResult {
    if (move.pp <= 0) {
      this.log.push(`${attacker.name}は${move.name}を出そうとしたが、PPが残っていない！`);
      return { outcome: 'failed', reason: 'no-pp' };
    }

    // 状態異常による行動阻害（カウンター減算は applyStatusEffects で行う）
    if (attacker.statusState.kind === 'sleep' && attacker.statusState.turnsLeft > 0) {
      this.log.push(`${attacker.name}は眠っている`);
      return { outcome: 'failed', reason: 'asleep' };
    }
    if (attacker.status === 'freeze') {
      if (this.rng.next() < 0.2) {
        attacker.removeStatus();
        this.log.push(`${attacker.name}はこおりがとけた！`);
      } else {
        this.log.push(`${attacker.name}はこごえて動けない`);
        return { outcome: 'failed', reason: 'frozen' };
      }
    }
    if (attacker.status === 'paralysis') {
      if (this.rng.next() < 0.25) {
        this.log.push(`${attacker.name}はまひして動けない`);
        return { outcome: 'failed', reason: 'paralyzed' };
      }
    }

    // まもる: そのターンの間、相手から受ける技を無効化する（本編仕様）。
    // 自分を対象にする技（つるぎのまい等）は防げないため targetsOpponent で限定する。
    if (defender.protecting && targetsOpponent(move)) {
      this.log.push(`${defender.name}は身を守っている`);
      return { outcome: 'failed', reason: 'protected' };
    }

    // マジックミラー（magic-bounce）: 変化技を跳ね返す（対象を入れ替えて再適用）。
    // 両者マジックミラーなら跳ね返し合いにならない（1回だけ跳ね返す）。
    if (isStatusMove(move) && defender.ability === 'magic-bounce' && attacker.ability !== 'magic-bounce') {
      this.log.push(`${defender.name}のマジックミラーが${attacker.name}の${move.name}を跳ね返した！`);
      return this.useMove(defender, attacker, move);
    }

    // プレッシャー: 相手が持っていると、こちらのPP消費が2倍になる（かたやぶりは無視）。
    // わるあがきはPPを持たないので消費しない（プレッシャーも乗らない）。
    if (move.ignoresTypeEffectiveness && move.name === 'わるあがき') {
      // no-op
    } else {
      const pressureTax = defender.ability === 'pressure' && attacker.ability !== 'mold-breaker' ? 2 : 1;
      if (pressureTax > 1) this.observeAbility(defender);
      move.pp = Math.max(0, move.pp - pressureTax);
    }

    // まもる以外の技を出したら連続使用のカウントは切れる（本編仕様）。
    if (!move.protects) {
      attacker.protectStreak = 0;
    }

    this.log.push(`${attacker.name}の${move.name}`);
    const attackerSide = this.getSide(attacker);
    if (attackerSide !== null) {
      this.moveLog.push({
        turn: this.turn,
        side: attackerSide,
        pokemonName: attacker.name,
        moveName: move.name,
        moveType: move.type,
        moveCategory: move.category,
      });
    }

    // ちょうはつ: 変化技の使用を阻止する（本編仕様）。
    // メンタルハーブ: ちょうはつを1回だけ解除して技を通す（消費される）。
    if (attacker.isTaunted && isStatusMove(move)) {
      if (attacker.item === 'mental-herb' && !attacker.itemUsed) {
        attacker.resetTaunt();
        attacker.itemUsed = true;
        this.log.push(`${attacker.name}はメンタルハーブで挑発を解いた`);
      } else {
        this.log.push(`${attacker.name}は挑発されて使えない！`);
        return { outcome: 'failed', reason: 'taunted' };
      }
    }

    // アンコール: 固定された技以外は出せない。合法手（getLegalActions）からも除外されるが、
    // 直接 useMove を呼ばれた場合にも効くようエンジン側でも拒否する。
    const encoredMove = attacker.encoredMoveIndex === null
      ? null
      : attacker.moves[attacker.encoredMoveIndex] ?? null;
    if (encoredMove && encoredMove.name !== move.name) {
      this.log.push(`${attacker.name}はアンコールで${encoredMove.name}しか出せない！`);
      return { outcome: 'failed', reason: 'encored' };
    }

    // サイコフィールド: 接地している相手には先制技（優先度+1以上）が効かない（本編仕様）。
    // 相手が接地していなければ（ひこう・ふゆう）通常どおり効く。
    if (this.field.terrain === 'psychic-terrain' && this.movePriority(attacker, move) > 0
        && targetsOpponent(move) && this.isGrounded(defender)) {
      this.log.push(`${defender.name}はサイコフィールドに守られている！`);
      return { outcome: 'failed', reason: 'blocked-by-terrain' };
    }

    // ふいうち: 相手がそのターン攻撃技を選んでいなければ失敗する（本編仕様）。
    // 「選んでいるか」は BattleRunner が毎ターン設定する（intendsToAttackThisTurn）。
    if (isDamageMove(move) && move.failsUnlessTargetAttacks && !defender.intendsToAttackThisTurn) {
      this.log.push(`${attacker.name}の${move.name}は決まらなかった`);
      return { outcome: 'failed', reason: 'target-not-attacking' };
    }

    // ポルターガイスト: 相手が持ち物を持っていなければ失敗する（本編仕様）。
    if (isDamageMove(move) && move.failsIfNoItem && defender.item === null) {
      this.log.push(`${attacker.name}の${move.name}は決まらなかった`);
      return { outcome: 'failed', reason: 'no-item' };
    }

    // ぼうだん等の技無効化特性は命中判定より前に解決する（本編仕様）。
    // かたやぶり（mold-breaker）持ちの攻撃は防御側の特性（ぼうだん・ひらいしん等）を無視する。
    const defenderAbility = getAbilityDefinition(defender.ability);
    if (attacker.ability !== 'mold-breaker' && defenderAbility?.blocksMove?.(move)) {
      // ひらいしん: でん技を弾いたとき、特攻を1段階上げる。
      if (defender.ability === 'lightning-rod' && move.type === 'electric') {
        defender.modifyStatStage('SPATK', 1);
        this.log.push(`${defender.name}のひらいしんで特攻が上がった`);
      }
      // ちくでん: でんき技を無効化し、特攻を1段階上げる。
      if (defender.ability === 'volt-absorb' && move.type === 'electric') {
        defender.modifyStatStage('SPATK', 1);
        this.log.push(`${defender.name}のちくでんで特攻が上がった`);
      }
      // もらいび: ほのお技を吸収し、以後じぶんのほのお技の威力が1.5倍になる。
      if (defender.ability === 'flash-fire' && move.type === 'fire') {
        defender.flashFireActive = true;
        this.log.push(`${defender.name}のもらいびでほのお技を吸収した`);
      }
      this.observeAbility(defender);
      this.log.push(`${defender.name}の${defender.ability}で効果がないようだ`);
      return { outcome: 'failed', reason: 'blocked-by-ability' };
    }

    // ふうせん: 割れるまでじめん技が当たらない（本編仕様。かたやぶりでも当たらない）。
    if (move.type === 'ground' && isDamageMove(move) && this.hasAirBalloon(defender)) {
      this.log.push(`${defender.name}はふうせんで浮いているので、${move.name}は当たらない`);
      return { outcome: 'failed', reason: 'blocked-by-item' };
    }

    // 変化技が成立したときに使用者が退場するか（バトンタッチ等）。
    // ダメージ解決と違い、この時点で使用者が倒れることはない。
    const statusMovePivot = move.pivot === true && !attacker.isFainted;
    // 天候・場・自分への効果が発動したときの結果。
    const effectApplied = (): UseMoveResult => ({ outcome: 'effect-applied', pivot: statusMovePivot });
    // 技は出たが何も起きなかったときの結果。
    const noEffect = (reason: NoEffectReason): UseMoveResult =>
      ({ outcome: 'no-effect', reason, pivot: statusMovePivot });

    // 相手を対象に取る変化技は、タイプ相性が0倍なら命中判定より前に無効化される
    // （でんじは→じめん、にらみつける→ゴースト等）。威力を持たないため、
    // 0倍以外の倍率（抜群・いまひとつ）は変化技の効果に影響しない。
    if (isStatusMove(move) && targetsOpponent(move)) {
      const statusMoveEffectiveness = this.resolveTypeEffectiveness(attacker, defender, move);
      if (statusMoveEffectiveness === 0) {
        this.log.push('効果がなかった');
        return noEffect('type-immune');
      }

      // みがわり: 身代わりがあるとき、相手に向けた変化技は身代わりに阻まれる（本編仕様）。
      // 場に置く技（ステロ・まきびし等）と自分を対象にする技は防がない。
      // あくび・アンコールは targetsOpponent に載っていないため個別に含める。
      if (defender.substituteHP > 0 && !move.fieldEffect && !move.selfStatChange && !move.createsSubstitute) {
        this.log.push(`${defender.name}は身代わりで${move.name}を防いだ`);
        return noEffect('no-applicable-effect');
      }

    }

    if (move.accuracy < 100) {
      // ノーガード(no-guard): 攻撃側・防御側どちらかが持てば命中率100%になる。
      const attackerNoGuard = getAbilityDefinition(attacker.ability)?.name === 'no-guard';
      const defenderNoGuard = getAbilityDefinition(defender.ability)?.name === 'no-guard';
      if (!attackerNoGuard && !defenderNoGuard && this.rng.next() * 100 > move.accuracy) {
        this.log.push('技は外れた');
        // 飛び膝蹴り等のクラッシュダメージ（最大HPの50%）
        if (isDamageMove(move) && move.crashDamage) {
          const crashDmg = Math.floor(attacker.maxHP / 2);
          this.applyDamage(attacker, crashDmg, attacker, move);
          this.log.push(`${attacker.name}は技がはずれてダメージを受けた！`);
          this.log.push(`${attacker.name}に${crashDmg}のダメージ`);
        }
        return { outcome: 'failed', reason: 'missed' };
      }
    }

    // 技が実行に進んだ時点で「直前に使った技」として記録する（アンコールの対象になる）。
    attacker.recordLastMove(move.name);

    if (move.fieldEffect === 'trick-room') {
      if (this.trickRoom) {
        this.trickRoom = false;
        this.trickRoomTurnsLeft = 0;
        this.log.push('トリックルームが解除された');
      } else {
        this.trickRoom = true;
        this.trickRoomTurnsLeft = 5;
        this.log.push(`${attacker.name}のトリックルームで時空がゆがんだ！`);
      }
      return effectApplied();
    }

    if (move.fieldEffect === 'tailwind') {
      const side = this.getSide(attacker);
      if (side !== null) {
        this.field.tailwind[this.sideKey(side)] = 4;
        this.log.push(`${attacker.name}側の場に「おいかぜ」が吹き始めた`);
      }
      return effectApplied();
    }

    if (move.fieldEffect === 'reflect') {
      const side = this.getSide(attacker);
      if (side !== null) {
        this.field.reflect[this.sideKey(side)] = attacker.item === 'light-clay' ? 8 : 5;
        this.log.push(`${attacker.name}側の場に「リフレクター」の壁ができた`);
      }
      return effectApplied();
    }

    // --- ハザード設置技 ---
    if (move.fieldEffect === 'stealth-rock') {
      const side = this.getSide(attacker);
      if (side !== null) {
        // 設置技は「相手の場」に置く（自分の場ではない）。
        const key = this.sideKey(this.opposingSide(side));
        if (this.field.stealthRock[key]) {
          this.log.push('ステルスロックは既に設置されている');
        } else {
          this.field.stealthRock[key] = true;
          this.log.push(`${defender.name}側の場にステルスロックが散りばめられた`);
        }
      }
      return effectApplied();
    }

    if (move.fieldEffect === 'spikes') {
      const side = this.getSide(attacker);
      if (side !== null) {
        const key = this.sideKey(this.opposingSide(side));
        if (this.field.spikes[key] >= 3) {
          this.log.push('まきびしはこれ以上盛れない');
        } else {
          this.field.spikes[key]++;
          this.log.push(`${defender.name}側の場にまきびしが${this.field.spikes[key]}層設置された`);
        }
      }
      return effectApplied();
    }

    if (move.fieldEffect === 'toxic-spikes') {
      const side = this.getSide(attacker);
      if (side !== null) {
        const key = this.sideKey(this.opposingSide(side));
        if (this.field.toxicSpikes[key] >= 2) {
          this.log.push('どくびしはこれ以上盛れない');
        } else {
          this.field.toxicSpikes[key]++;
          this.log.push(`${defender.name}側の場にどくびしが${this.field.toxicSpikes[key]}層設置された`);
        }
      }
      return effectApplied();
    }

    // サイコフィールド / ミストフィールド: 5ターンの間フィールドを展開する。
    // グランドコート持ちなら8ターンになる（本編仕様）。
    if (move.fieldEffect === 'psychic-terrain' || move.fieldEffect === 'misty-terrain') {
      const turns = attacker.item === 'terrain-extender' ? 8 : 5;
      const terrainName = move.fieldEffect === 'psychic-terrain' ? 'サイコフィールド' : 'ミストフィールド';
      this.field.terrain = move.fieldEffect;
      this.field.terrainTurnsLeft = turns;
      this.log.push(`${attacker.name}は${terrainName}を展開した（${turns}ターン）`);
      return effectApplied();
    }

    // オーロラベール: 5ターンの間、その側が受けるダメージを半減する（本編仕様）。
    // TODO: 出典確認（本編は あられ/ゆき が条件。チャンピオンズでの条件は未確認）
    if (move.fieldEffect === 'aurora-veil') {
      const side = this.getSide(attacker);
      if (side !== null) {
        // ひかりのねんど: 壁のターン数を8にする（本編仕様）。
        this.field.auroraVeil[this.sideKey(side)] = attacker.item === 'light-clay' ? 8 : 5;
        this.log.push(`${attacker.name}側にオーロラベールが張られた`);
      }
      return effectApplied();
    }

    // ほえる: 相手を控えと強制交代させる（本編仕様）。
    // チームを持っているのは BattleRunner なので、ここでは印を立てるだけ。
    // ダメージ技（ドラゴンテール）はダメージ解決の後に同じ印を立てるため、ここでは変化技に限定する。
    if (isStatusMove(move) && move.forcesSwitch) {
      defender.forcedOut = true;
      this.log.push(`${defender.name}は場を追い出された`);
      return effectApplied();
    }

    // ねがいごと: 次のターンの終了時に、その側の場に出ているポケモンを最大HPの半分回復する（本編仕様）。
    if (move.wishes) {
      const side = this.getSide(attacker);
      if (side !== null) {
        this.field.wish[this.sideKey(side)] = 2;
        this.log.push(`${attacker.name}は願い事をした`);
      }
      return effectApplied();
    }

    // あまごい・にほんばれ等: 天候を5ターン変化させる。
    if (move.weather) {
      this.weather = move.weather;
      this.weatherTurnsLeft = 5;
      const weatherName = { rain: 'あめ', sun: 'にほんばれ', sand: 'すなあらし', hail: 'あられ' }[move.weather];
      this.log.push(`${attacker.name}は${weatherName}を呼び出した`);
      return effectApplied();
    }

    if (move.weatherHeal) {
      const percent = WEATHER_HEAL_PERCENT[this.weather ?? 'none'];
      const heal = Math.floor(attacker.maxHP * percent);
      attacker.heal(heal);
      this.log.push(`${attacker.name}は${move.name}で${heal}回復した`);
      return effectApplied();
    }

    // みがわり: 自分のHPを最大HPの1/4払って身代わりを出す（本編仕様）。
    // 残りHPが代償以下なら失敗する。
    if (move.createsSubstitute) {
      if (attacker.substituteHP > 0) {
        this.log.push('しかし うまくきまらなかった');
        return noEffect('no-applicable-effect');
      }
      const cost = Math.floor(attacker.maxHP / 4);
      if (attacker.currentHP <= cost) {
        this.log.push('しかし うまくきまらなかった');
        return noEffect('not-enough-hp');
      }
      attacker.currentHP -= cost;
      attacker.substituteHP = cost;
      this.log.push(`${attacker.name}は身代わりを出した`);
      return effectApplied();
    }

    // くろいきり: 場に出ている全員の能力変化をリセットする（本編仕様）。
    if (move.resetsStatStages) {
      for (const pokemon of [attacker, defender]) {
        for (const key of STAT_STAGE_KEYS) {
          pokemon.statStages[key] = 0;
        }
      }
      this.log.push('すべての能力変化がリセットされた');
      return effectApplied();
    }

    // まもる: そのターン相手の技を防ぐ。連続で使うと成功率が半減していく（本編仕様）。
    if (move.protects) {
      const successChance = 1 / Math.pow(2, attacker.protectStreak);
      if (this.rng.next() >= successChance) {
        attacker.resetProtect();
        this.log.push('しかし うまくきまらなかった');
        return { outcome: 'failed', reason: 'protect-failed' };
      }
      attacker.protecting = true;
      attacker.protectStreak += 1;
      this.log.push(`${attacker.name}は身を守っている`);
      return effectApplied();
    }

    // ねむる: HPを全回復して2ターンのねむり状態になる（本編仕様）。
    // 既に状態異常があるとき、HPが満タンのときは失敗する。
    if (move.rests) {
      if (attacker.statusState.kind !== 'none') {
        this.log.push('しかし うまくきまらなかった');
        return noEffect('status-immune');
      }
      if (attacker.currentHP >= attacker.maxHP) {
        this.log.push('しかし うまくきまらなかった');
        return noEffect('full-hp');
      }
      attacker.heal(attacker.maxHP);
      attacker.applySleep(2); // 本編のねむるは2ターン
      this.log.push(`${attacker.name}は眠ってしまった`);
      return effectApplied();
    }

    // なまける等: 自分のHPを最大HPの一定割合だけ回復する。HPが満タンなら失敗する（本編仕様）。
    if (move.selfHealPercent !== null && move.selfHealPercent !== undefined) {
      if (attacker.currentHP >= attacker.maxHP) {
        this.log.push('しかし うまくきまらなかった');
        return noEffect('full-hp');
      }
      const heal = Math.floor(attacker.maxHP * move.selfHealPercent);
      attacker.heal(heal);
      this.log.push(`${attacker.name}は${move.name}で${heal}回復した`);
      return effectApplied();
    }

    // みがわり: あくび・アンコールは targetsOpponent に載らないため、ここでも防ぐ。
    if (defender.substituteHP > 0 && isStatusMove(move) && (move.inflictsDrowsy || move.inflictsEncore)) {
      this.log.push(`${defender.name}は身代わりで${move.name}を防いだ`);
      return noEffect('no-applicable-effect');
    }

    // あくび: 相手をねむけにし、次のターンの終了時にねむりにする（交代で解除）。
    // 出典: yakkun.com（チャンピオンズ）「相手を『ねむけ』状態にして、次のターン終了時に
    // 相手を『ねむり』状態にする。ただし、そのポケモンが交代されると効果は消える。必ず命中」。
    // タイプによる無効は無いため、変化技共通のタイプ相性判定（targetsOpponent）には載せない。
    if (move.inflictsDrowsy) {
      if (defender.isDrowsy) {
        this.log.push(`${defender.name}はすでにねむけている`);
        return noEffect('no-applicable-effect');
      }
      // すでに状態異常なら眠れないため、ねむけも付かない（本編仕様）。
      if (defender.status !== null) {
        this.log.push('効果がなかった');
        return noEffect('status-immune');
      }
      defender.applyDrowsy(this.turn + 1);
      this.log.push(`${defender.name}はねむけを誘われた`);
      return effectApplied();
    }

    // アンコール: 相手が直前に使った技を3ターンの間固定する（交代で解除）。
    // 直前の技が無い（まだ技を使っていない）場合は失敗する（本編仕様）。
    if (move.inflictsEncore) {
      if (defender.isEncored) {
        this.log.push(`${defender.name}はすでにアンコールされている`);
        return noEffect('no-applicable-effect');
      }
      const lastIndex = defender.lastMoveName === null
        ? -1
        : defender.moves.findIndex((candidate) => candidate.name === defender.lastMoveName);
      if (lastIndex < 0) {
        this.log.push('しかし うまくきまらなかった');
        return noEffect('no-applicable-effect');
      }
      defender.applyEncore(lastIndex, this.turn + ENCORE_TURNS);
      this.log.push(`${defender.name}はアンコールで${defender.moves[lastIndex].name}を選び続ける`);
      return effectApplied();
    }

    // ちょうはつ: 相手を変化技が使えない状態にする。みがわりは貫通する（本編仕様）。
    if (move.inflictsTaunt) {
      if (defender.isTaunted) {
        this.log.push(`${defender.name}はすでに挑発されている`);
        return noEffect('no-applicable-effect');
      }
      defender.applyTaunt(TAUNT_TURNS);
      this.log.push(`${defender.name}は挑発に乗ってしまった`);
      return effectApplied();
    }

    // キングシールド等: バトルスイッチ持ち（ギルガルド）がシールドフォルムに戻る。
    if (move.restoresShieldForm) {
      const ability = getAbilityDefinition(attacker.ability);
      if (ability?.name === 'battle-switch' && attacker.form !== 'shield') {
        attacker.setForm('shield');
        this.log.push(`${attacker.name}はシールドフォルムに戻った`);
      }
      return effectApplied();
    }

    if (move.inflictsSeed) {
      if (defender.types.includes('grass')) {
        this.log.push('くさタイプには効果がない');
      } else if (defender.isSeeded) {
        this.log.push(`${defender.name}にはすでにやどりぎのタネが植えられている`);
      } else {
        defender.isSeeded = true;
        this.log.push(`${defender.name}にやどりぎのタネを植え付けた`);
      }
      return effectApplied();
    }

    // 能力ランク変化だけを行う変化技（つるぎのまい・にらみつける等）。
    // 自分と相手の両方を変化させる技もあるため、どちらも適用してから終える。
    // 威力を持つ技の selfStatChange（リーフストーム等）はダメージ解決後に適用する。
    if (isStatusMove(move)) {
      const selfChanges = move.selfStatChange ?? null;
      const targetChanges = move.targetStatChange ?? null;

      if (selfChanges !== null || targetChanges !== null) {
        if (selfChanges !== null) {
          this.applySelfStatChange(attacker, selfChanges);
        }
        if (targetChanges !== null) {
          this.applyTargetStatChange(attacker, defender, targetChanges);
        }
        return effectApplied();
      }
    }

    // 状態異常の付与は変化技だけが持つ効果（ダメージ技の追加効果は secondaryEffect が担当する）。
    if (isStatusMove(move) && move.status !== null) {
      return this.inflictStatusCondition(defender, move.status, statusMovePivot);
    }

    // バトンタッチ: 技自体は「能力を引き継いで退場する」効果なので成立扱いにする。
    // 引き継ぎ本体は交代時（BattleSession.applyPivotSwitch）で処理する。
    if (isStatusMove(move) && move.passStats) {
      this.log.push(`${attacker.name}は能力を引き継ぐ準備をした`);
      return effectApplied();
    }

    // ここに到達する変化技は、対応する効果フィールドを持たないもの（まもる・はねる等の未実装技）。
    // 威力0のためダメージ計算に進めても何も起きないので、この時点で解決を終える。
    if (isStatusMove(move)) {
      this.log.push('しかし何も起こらなかった');
      return noEffect('no-applicable-effect');
    }

    // --- ここから先、move は DamageMoveData（物理・特殊）に絞り込まれている ---

    // ウェザーボールは天候下でタイプが変化する。
    let effectiveType = move.name === 'weather-ball' && this.weather && WEATHER_BALL_TYPE[this.weather]
      ? WEATHER_BALL_TYPE[this.weather]!
      : move.type;

    let power = move.power;

    // おはかまいり: 倒れている味方1体につき威力+50（本編仕様）。
    if (isDamageMove(move) && move.powerPerFaintedAlly) {
      const fainted = this.teamOf(attacker).filter((ally) => ally !== attacker && ally.isFainted).length;
      if (fainted > 0) {
        power += 50 * fainted;
        this.log.push(`${move.name}の威力が${power}になった`);
      }
    }

    // だいちのはどう: フィールド下ではタイプが変わり威力2倍。使用者が接地している場合のみ。
    if (move.terrainPulse === true && this.field.terrain !== null && this.isGrounded(attacker)) {
      effectiveType = TERRAIN_PULSE_TYPE[this.field.terrain];
      power *= 2;
    }

    // メガランチャー: 波動技の威力1.5倍（本編仕様）。
    if (move.pulse === true && attacker.ability === 'mega-launcher') {
      power = Math.floor(power * 1.5);
    }

    // アシストパワー: 自分の能力上昇1段階につき威力+20（本編仕様、上限860）。
    if (move.storedPower === true) {
      const stages = Object.entries(attacker.statStages as Record<string, number>)
        .filter(([key]) => key !== 'ACCURACY' && key !== 'EVASION')
        .reduce((sum, [, value]) => sum + Math.max(0, value), 0);
      power = Math.min(860, 20 + 20 * stages);
      this.log.push(`アシストパワーの威力が${power}になった`);
    }

    // スカイスキン（aerilate）: ノーマル技がひこう技になる（威力1.2倍）
    // フェアリースキン（pixilate）: ノーマル技がフェアリー技になる（威力1.2倍）
    if (effectiveType === 'normal') {
      if (attacker.ability === 'aerilate') {
        effectiveType = 'flying';
        power = Math.floor(power * 1.2);
      } else if (attacker.ability === 'pixilate') {
        effectiveType = 'fairy';
        power = Math.floor(power * 1.2);
      }
    }

    if (attacker.types && attacker.types.includes(effectiveType)) {
      // STAB: タイプ一致技は1.5倍（適応力持ちは2倍）
      power *= attacker.ability === 'adaptability' ? 2.0 : 1.5;
    }

    if (attacker.item === 'life-orb') {
      power *= 1.3;
    }

    if (attacker.item !== null && TYPE_BOOST_ITEMS[attacker.item] === effectiveType) {
      power *= 1.2;
    }

    // こだわりハチマキ/メガネは該当カテゴリの威力を1.5倍にする（技は使用後に固定される）。
    if (attacker.item === 'choice-band' && isPhysicalMove(move)) {
      power *= 1.5;
    } else if (attacker.item === 'choice-specs' && isSpecialMove(move)) {
      power *= 1.5;
    }

    // ワイドフォース: サイコフィールド下で接地していれば威力1.5倍（本編仕様）。
    if (isDamageMove(move) && move.boostedByPsychicTerrain === true
        && this.field.terrain === 'psychic-terrain' && this.isGrounded(attacker)) {
      power = Math.floor(power * 1.5);
    }

    // サイコフィールド: 接地している側のエスパー技は威力1.3倍（本編仕様）。
    if (this.field.terrain === 'psychic-terrain' && effectiveType === 'psychic'
        && this.isGrounded(attacker)) {
      power = Math.floor(power * 1.3);
    }

    // グラスフィールド: 接地している側のくさ技は威力1.3倍。接地している相手へのじしん・じならしは半減（本編仕様）。
    if (this.field.terrain === 'grassy-terrain') {
      if (effectiveType === 'grass' && this.isGrounded(attacker)) {
        power = Math.floor(power * 1.3);
      }
      if (GRASSY_HALVED_MOVE_NAMES.has(move.name) && this.isGrounded(defender)) {
        power = Math.floor(power * 0.5);
      }
    }

    // ミストフィールド: 接地している側が受けるドラゴン技は威力が半減する（本編仕様）。
    if (this.field.terrain === 'misty-terrain' && effectiveType === 'dragon' && this.isGrounded(defender)) {
      power = Math.floor(power * 0.5);
    }

    // 特性による威力補正（テクニシャン等）。
    const powerAbility = getAbilityDefinition(attacker.ability);
    if (powerAbility?.modifyMovePower) {
      power = powerAbility.modifyMovePower({ pokemon: attacker, move, value: power, engine: this });
    }

    // くさむすび・けたぐり: 相手の体重で威力が決まる（本編仕様）。
    if (isDamageMove(move) && move.weightBasedPower) {
      power = this.powerFromWeight(defender.weightKg);
    }

    // はたきおとす: 相手が落とせる持ち物を持っていれば威力1.5倍（本編仕様）。
    const knocksOffItem = isDamageMove(move) && move.knockOff && this.hasRemovableItem(defender);
    if (knocksOffItem) {
      power = Math.floor(power * 1.5);
    }

    // ダメおし: そのターン既に相手がダメージを受けていれば威力2倍（本編仕様）。
    if (isDamageMove(move) && move.doublesIfTargetDamaged && this.defendersDamagedThisTurn.has(defender)) {
      power *= 2;
    }

    const moveWithStab = cloneDamageMove(move, { power, type: effectiveType });

    // おやこあい: 攻撃技が2回ヒットする（2回目は威力1/4）。命中判定は1回（本編仕様）。
    const isParentalBond = attacker.ability === 'parental-bond';

    // ロックブラスト等の多段技は命中判定こそ1回だが、当たった後の実ヒット数は乱数（本編仕様）。
    // maxHitsが指定されていれば上限を適用
    const hitCount = move.multiHit
      ? (move.maxHits ? Math.min(this.rollMultiHitCount(), move.maxHits) : this.rollMultiHitCount())
      : isParentalBond ? 2 : 1;
    let totalDamage = 0;
    let substituteAbsorbed = false;
    let lastEffectiveness = 1;

    for (let hit = 0; hit < hitCount && !defender.isFainted; hit++) {
      // multiHitPowersが指定されていれば、ヒットごとに威力を変更
      // おやこあいの2回目は威力1/4で計算する
      let hitPower = moveWithStab.power;
      if (move.multiHitPowers && hit < move.multiHitPowers.length) {
        hitPower = move.multiHitPowers[hit];
      } else if (isParentalBond && hit > 0) {
        hitPower = Math.floor(moveWithStab.power / 4);
      }
      const hitMove = cloneDamageMove(moveWithStab, { power: hitPower });

      // 急所判定はヒットごとに行う（本編仕様）。乱数の消費順もここで固定される。
      // 必ず急所の技（トリックフラワー等）は乱数を引かない。
      const critical = isDamageMove(move) && move.alwaysCrit
        ? getAbilityDefinition(defender.ability)?.preventsCriticalHits?.() !== true
        : this.rollCriticalHit(defender);
      const attack = this.calculateAttack(attacker, hitMove, { critical, defender });
      const defense = this.calculateDefense(defender, hitMove, { critical });
      const baseDamage = this.calculateBaseDamage(attack, defense, hitMove);
      const { finalDamage, effectiveness } = this.applyModifiers(baseDamage, attacker, defender, hitMove, { critical });
      // 乱数（0.85〜1.00）はヒットごとに独立して引く。
      const rolledDamage = this.rollDamage(finalDamage, effectiveness);
      if (critical) {
        this.log.push('急所に当たった！');
      }
      const hadSubstitute = defender.substituteHP > 0;
      // タイプ無効（実ダメージ0）のときは applyDamage を呼ばない。呼ぶとばけのかわ・
      // さめはだ・じきゅうりょく等の被弾フックが誤って発動する（本編では無効化される）。
      const dealtDamage = rolledDamage > 0 ? this.applyDamage(defender, rolledDamage, attacker, hitMove) : 0;
      if (hadSubstitute) {
        substituteAbsorbed = true;
      }
      // ログ・反動・ドレインは特性適用後の実ダメージで積む
      // （ばけのかわは攻撃を無効化して1/8だけ通すため、rolledDamage とは一致しない）。
      totalDamage += dealtDamage;
      lastEffectiveness = effectiveness;

      if (dealtDamage > 0) {
        this.attackersDealtDamageThisTurn.add(attacker);
        this.defendersDamagedThisTurn.add(defender);
      }
    }

    // ふうせん: ダメージ技を受けると割れる（みがわりが受けた場合は割れない。本編仕様）。
    if (totalDamage > 0 && !substituteAbsorbed && this.hasAirBalloon(defender)) {
      defender.itemUsed = true;
      this.log.push(`${defender.name}のふうせんが割れた`);
    }

    if (move.multiHit) {
      this.log.push(`${hitCount}回攻撃した！`);
    } else if (isParentalBond) {
      this.log.push('おやこあいで2回攻撃した！');
    }

    if (lastEffectiveness > 1) {
      this.log.push('効果は抜群だ！');
    } else if (lastEffectiveness < 1 && lastEffectiveness > 0) {
      this.log.push('効果はいまひとつのようだ');
    } else if (lastEffectiveness === 0) {
      this.log.push('効果がなかった');
      // タイプ無効時は追加効果・能力変化を発動しない
      if (move.selfStatChange) {
        this.applySelfStatChange(attacker, move.selfStatChange);
      }
      return { outcome: 'no-effect', reason: 'type-immune', pivot: false };
    }

    this.log.push(
      substituteAbsorbed
        ? `${defender.name}の身代わりに${totalDamage}のダメージ`
        : `${defender.name}に${totalDamage}のダメージ`,
    );

    // 特性の「ダメージ技を命中させた後」フック（バトルスイッチ等）。
    const attackerAbility = getAbilityDefinition(attacker.ability);
    attackerAbility?.onMoveUsed?.({ attacker, defender, move, engine: this });

    // ドレイン技（きゅうけつ・ギガドレイン等）: 与えたダメージの一定割合を回復する。
    // 身代わりに吸われたぶんも「与えたダメージ」として回復に回る（本編仕様）。
    if (move.drainPercent !== null && move.drainPercent !== undefined && totalDamage > 0) {
      const drain = Math.floor(totalDamage * move.drainPercent);
      if (drain > 0) {
        attacker.heal(drain);
        this.log.push(`${attacker.name}は${move.name}で${drain}回復した`);
      }
    }

    // 反動技: 与えたダメージの一定割合、または最大HPの一定割合を自分も受ける（本編仕様）。
    if (isDamageMove(move) && totalDamage > 0) {
      const recoilOfDamage = move.recoilPercent ? Math.floor(totalDamage * move.recoilPercent) : 0;
      const recoilOfMaxHp = move.recoilMaxHpPercent
        ? Math.floor(attacker.maxHP * move.recoilMaxHpPercent)
        : 0;
      const recoil = recoilOfDamage + recoilOfMaxHp;
      if (recoil > 0) {
        attacker.takeDamage(recoil, this);
        this.log.push(`${attacker.name}は反動で${recoil}のダメージを受けた`);
        if (attacker.isFainted) {
          this.log.push(`${attacker.name}は戦闘不能になった`);
        }
      }
    }

    // はたきおとす: 命中したら相手の持ち物を落とす（本編仕様。メガストーンは落とせない）。
    if (knocksOffItem && !defender.isFainted) {
      this.log.push(`${defender.name}の${defender.item}を落とした`);
      defender.item = null;
    }

    // ドラゴンテール等: ダメージを与えたうえで相手を強制交代させる（本編仕様）。
    if (isDamageMove(move) && move.forcesSwitch && !defender.isFainted) {
      defender.forcedOut = true;
      this.log.push(`${defender.name}は場を追い出された`);
    }

    if (defender.isFainted) {
      this.log.push(`${defender.name}は戦闘不能になった`);
    } else {
      const mistyProtected = this.field.terrain === 'misty-terrain' && this.isGrounded(defender);
      if (move.secondaryEffect && !mistyProtected && this.rng.next() * 100 < move.secondaryEffect.chance) {
        // 特性による無効化は追加効果でも効く。
        if (this.blocksStatusByAbility(defender, move.secondaryEffect.status)) {
          this.observeAbility(defender);
          this.log.push(`${defender.name}の${defender.ability}で状態異常にならない`);
        } else {
          const applied = defender.applyStatus(move.secondaryEffect.status, this.rng);
          if (applied) {
            this.log.push(`${defender.name}は${move.secondaryEffect.status}状態になった`);
          }
        }
      }
      if (move.targetStatChange) {
        this.applyTargetStatChange(attacker, defender, move.targetStatChange);
      }
      // ひけんちえなみ等: 命中時に相手側にまきびしを設置する追加効果。
      if (move.inflictsSpikes) {
        const defenderSide = this.getSide(defender);
        if (defenderSide !== null) {
          const key = this.sideKey(defenderSide);
          if (this.field.spikes[key] >= 3) {
            this.log.push('まきびしはこれ以上盛れない');
          } else {
            this.field.spikes[key]++;
            this.log.push(`${defender.name}側の場にまきびしが${this.field.spikes[key]}層設置された`);
          }
        }
      }
    }

    // リーフストームのような「威力を持つが使用者自身の能力も変化する」技。
    if (move.selfStatChange) {
      this.applySelfStatChange(attacker, move.selfStatChange);
    }

    // とんぼがえり等は攻撃が通った後に使用者が退場する。
    // 相手を倒しきった場合も本編では交代が発生するが、使用者自身が倒れていたら交代はしない。
    const pivot = move.pivot === true && !attacker.isFainted;

    return { outcome: 'damaged', damage: totalDamage, effectiveness: lastEffectiveness, pivot };
  }

  // 通常配分（2発37.5%/3発37.5%/4発12.5%/5発12.5%）でヒット数を決める。
  private rollMultiHitCount(): number {
    const roll = this.rng.next();
    let cumulative = 0;
    for (const { hits, weight } of MULTI_HIT_TABLE) {
      cumulative += weight;
      if (roll < cumulative) return hits;
    }
    return MULTI_HIT_TABLE[MULTI_HIT_TABLE.length - 1].hits;
  }

  private applyTargetStatChange(attacker: Pokemon, pokemon: Pokemon, changes: NonNullable<MoveData['targetStatChange']>): void {
    for (const change of changes) {
      if (this.rng.next() * 100 >= change.chance) continue;
      // ミラーアーマー: 相手から受ける能力低下をその相手に反射する。
      if (change.delta < 0 && pokemon.ability === 'mirror-armor') {
        const applied = attacker.modifyStatStage(change.stat, change.delta);
        if (applied === 0) continue;
        const direction = applied > 0 ? '上がった' : '下がった';
        this.log.push(`${attacker.name}の${change.stat}が${direction}（${pokemon.name}のミラーアーマー）`);
        continue;
      }
      // しろいハーブ: 能力低下を1回だけ防ぐ（消費される）。
      if (change.delta < 0 && pokemon.item === 'white-herb' && !pokemon.itemUsed) {
        pokemon.itemUsed = true;
        this.log.push(`${pokemon.name}はしろいハーブで能力低下を防いだ`);
        continue;
      }
      // クリアボディ / フラワーヴェール: 相手からの能力低下を防ぐ。
      if (change.delta < 0 && (pokemon.ability === 'clear-body' || this.flowerVeilProtects(pokemon))) {
        this.observeAbility(pokemon);
        this.log.push(`${pokemon.name}の${pokemon.ability}で能力が下がらない`);
        continue;
      }
      const applied = pokemon.modifyStatStage(change.stat, change.delta);
      if (applied === 0) continue;
      const direction = applied > 0 ? '上がった' : '下がった';
      this.log.push(`${pokemon.name}の${change.stat}が${direction}`);
    }
  }

  // 変化技による状態異常の付与を解決する。タイプ無効化を先に判定してから付与する。
  // 既に別の状態異常なら付与できないため、その場合も「効果がなかった」として返す。
  private inflictStatusCondition(
    defender: Pokemon,
    status: StatusCondition,
    pivot: boolean
  ): UseMoveResult {
    const immuneTypes = STATUS_IMMUNE_TYPES[status] ?? [];
    const isImmuneByType = immuneTypes.some((type) => defender.types.includes(type));
    if (isImmuneByType) {
      this.log.push('効果がない');
      return { outcome: 'no-effect', reason: 'status-immune', pivot };
    }

    // ミストフィールド: 接地しているポケモンは状態異常にならない（本編仕様）。
    if (this.field.terrain === 'misty-terrain' && this.isGrounded(defender)) {
      this.log.push(`${defender.name}はミストフィールドに守られている`);
      return { outcome: 'no-effect', reason: 'status-immune', pivot };
    }

    // 特性による無効化（ふみん・じゅなん・ねつこうかん・フラワーヴェール）。
    if (this.blocksStatusByAbility(defender, status)) {
      this.observeAbility(defender);
      this.log.push(`${defender.name}の${defender.ability}で状態異常にならない`);
      return { outcome: 'no-effect', reason: 'status-immune', pivot };
    }

    const applied = defender.applyStatus(status, this.rng);
    if (!applied) {
      this.log.push('効果がない');
      return { outcome: 'no-effect', reason: 'status-immune', pivot };
    }

    this.log.push(`${defender.name}は${status}状態になった`);
    return { outcome: 'status-inflicted', status, pivot };
  }

  private applySelfStatChange(pokemon: Pokemon, changes: NonNullable<MoveData['selfStatChange']>): void {
    for (const change of changes) {
      const applied = pokemon.modifyStatStage(change.stat, change.delta);
      if (applied === 0) continue;
      const direction = applied > 0 ? '上がった' : '下がった';
      this.log.push(`${pokemon.name}の${change.stat}が${direction}`);
    }
  }

  startTurn(): void {
    this.turn++;
    this.log.push(`\n===== ターン${this.turn}開始 =====`);

    if (this.weatherTurnsLeft > 0) {
      this.weatherTurnsLeft--;
      if (this.weatherTurnsLeft === 0) {
        this.log.push(`天候「${this.weather}」が終了しました`);
        this.weather = null;
      }
    }

    if (this.trickRoomTurnsLeft > 0) {
      this.trickRoomTurnsLeft--;
      if (this.trickRoomTurnsLeft === 0) {
        this.log.push('トリックルームが終了しました');
        this.trickRoom = false;
      }
    }

    if (this.field.terrainTurnsLeft > 0) {
      this.field.terrainTurnsLeft--;
      if (this.field.terrainTurnsLeft === 0) {
        this.log.push('地形の効果が消えた');
        this.field.terrain = null;
      }
    }

    for (const side of [0, 1] as const) {
      const key = this.sideKey(side);
      if (this.field.tailwind[key] > 0) {
        this.field.tailwind[key]--;
        if (this.field.tailwind[key] === 0) {
          this.log.push(`${side === 0 ? 'プレイヤーA' : 'プレイヤーB'}側のおいかぜが止んだ`);
        }
      }
      if (this.field.reflect[key] > 0) {
        this.field.reflect[key]--;
        if (this.field.reflect[key] === 0) {
          this.log.push(`${side === 0 ? 'プレイヤーA' : 'プレイヤーB'}側のリフレクターが消えた`);
        }
      }
      if (this.field.auroraVeil[key] > 0) {
        this.field.auroraVeil[key]--;
        if (this.field.auroraVeil[key] === 0) {
          this.log.push(`${side === 0 ? 'プレイヤーA' : 'プレイヤーB'}側のオーロラベールが消えた`);
        }
      }
    }

    // まもる: 防護はそのターン限りなので、ターン開始時に解除する（本編仕様）。
    // 連続使用のカウント（protectStreak）は次のまもるで参照するため残す。
    for (const pokemon of [this.activePokemon0, this.activePokemon1]) {
      if (!pokemon) continue;
      pokemon.protecting = false;
    }

    // ちょうはつ: ターンごとに残りターンを減らし、0になったら解除。
    for (const pokemon of [this.activePokemon0, this.activePokemon1]) {
      if (!pokemon || pokemon.isFainted || pokemon.tauntTurnsLeft <= 0) continue;
      pokemon.tauntTurnsLeft--;
      if (pokemon.tauntTurnsLeft === 0) {
        this.log.push(`${pokemon.name}の挑発が解けた`);
      }
    }

    // アンコール: 期限のターン終了までは固定が続くため、それを過ぎたら解除する。
    for (const pokemon of [this.activePokemon0, this.activePokemon1]) {
      if (!pokemon || pokemon.isFainted || !pokemon.isEncored) continue;
      const until = pokemon.encoredUntilTurn;
      if (until !== null && this.turn > until) {
        pokemon.resetEncore();
        this.log.push(`${pokemon.name}のアンコールが解けた`);
      }
    }
  }

  endTurn(teamA: Pokemon[], teamB: Pokemon[]): void {
    // 場のポケモンのみに状態異常・天候ダメージを適用（控えには適用しない）
    // activePokemon が未設定なら全員に適用（テスト等で直接エンジンを使うケース）
    const activeA = this.activePokemon0;
    const activeB = this.activePokemon1;
    const hasActivePokemon = activeA !== null || activeB !== null;

    let statusWeatherTeam: Pokemon[];
    if (hasActivePokemon) {
      // activePokemon が team に含まれるか確認せずにそのまま使用
      // （setActivePokemon で設定されたオブジェクトは team 内の同一参照）
      statusWeatherTeam = [activeA, activeB].filter((p): p is Pokemon => p !== null && !p.isFainted);
    } else {
      statusWeatherTeam = [...teamA, ...teamB];
    }

    this.applyStatusEffects(statusWeatherTeam);
    // ねむけ→ねむりは状態異常の処理のあとに回す。同じターンに眠って即座に
    // 睡眠ターンを消費してしまうのを避けるため。
    this.applyDrowsySleep(statusWeatherTeam);
    this.applyLeechSeed(teamA, teamB);
    this.applyWeatherDamage(statusWeatherTeam);
    this.applyGrassyTerrainHeal(statusWeatherTeam);
    // ねがいごと: 残りターンを減らし、0になったらその側の場に出ているポケモンを回復する（本編仕様）。
    for (const side of [0, 1] as const) {
      const key = this.sideKey(side);
      if (this.field.wish[key] <= 0) continue;
      this.field.wish[key]--;
      if (this.field.wish[key] !== 0) continue;
      const active = side === 0 ? this.activePokemon0 : this.activePokemon1;
      if (!active || active.isFainted) continue;
      const heal = Math.floor(active.maxHP / 2);
      active.heal(heal);
      this.log.push(`${active.name}は願い事で${heal}回復した`);
    }

    this.events.emit('end-turn', { team: [...teamA, ...teamB], engine: this });
    this.attackersDealtDamageThisTurn.clear();
    this.defendersDamagedThisTurn.clear();
  }

  // やどりぎのタネ: 吸われている側から吸っている相手（本来のオーナーではなく、
  // 現在その陣営に出ているポケモン）へ毎ターンHPを移す。
  applyLeechSeed(teamA: Pokemon[], teamB: Pokemon[]): void {
    for (const pokemon of [...teamA, ...teamB]) {
      if (pokemon.isFainted || !pokemon.isSeeded) continue;

      const opponent = this.getOpponent(pokemon);
      if (!opponent || opponent.isFainted) continue;

      const drained = Math.floor(pokemon.maxHP / 8);
      pokemon.takeDamage(drained, this);
      opponent.heal(drained);
      this.log.push(`${pokemon.name}はやどりぎのタネで${drained}のダメージを受け、${opponent.name}のHPが回復した`);
    }
  }

  // グラスフィールド: 接地しているポケモンはターン終了時に最大HPの1/16回復する（本編仕様）。
  applyGrassyTerrainHeal(team: Pokemon[]): void {
    if (this.field.terrain !== 'grassy-terrain') return;
    for (const pokemon of team) {
      if (pokemon.isFainted || !this.isGrounded(pokemon) || pokemon.currentHP >= pokemon.maxHP) continue;
      const heal = Math.max(1, Math.floor(pokemon.maxHP / 16));
      pokemon.heal(heal);
      this.log.push(`${pokemon.name}はグラスフィールドで${heal}回復した`);
    }
  }

  applyWeatherDamage(team: Pokemon[]): void {
    if (this.weather !== 'sand' && this.weather !== 'hail') return;

    for (const pokemon of team) {
      if (pokemon.isFainted) continue;

      const isImmune = this.weather === 'sand'
        ? pokemon.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel')
        : pokemon.types.includes('ice');
      if (isImmune) continue;

      const damage = Math.floor(pokemon.maxHP / 16);
      pokemon.takeDamage(damage, this);
      const weatherName = this.weather === 'sand' ? '砂嵐' : 'あられ';
      this.log.push(`${pokemon.name}は${weatherName}のダメージで${damage}のダメージを受けた`);
    }
  }

  // あくび（ねむけ）: ねむけのポケモンは、あくびを使われた次のターンの終了時にねむりになる。
  // 交代で場を離れるとねむけは解除される（battle-runner の switchTo が resetDrowsy を呼ぶ）。
  // 「残りターン数」ではなくターン番号で期限を持つのは、あくびを使ったターンの終了では
  // 眠らず、その次のターンの終了で眠るため（比較だけで判定でき、数え漏れが起きない）。
  applyDrowsySleep(team: Pokemon[]): void {
    for (const pokemon of team) {
      if (pokemon.isFainted || !pokemon.isDrowsy) continue;
      const dueTurn = pokemon.drowsyUntilTurn;
      if (dueTurn === null || this.turn < dueTurn) continue;

      // 既に別の状態異常なら眠れない（ねむけは消える）。本編仕様。
      // ふみん・フラワーヴェールも眠らない（ねむけ自体は消える）。
      const blocked = this.blocksStatusByAbility(pokemon, 'sleep');
      const applied = blocked ? false : pokemon.applyStatus('sleep', this.rng);
      if (blocked) this.observeAbility(pokemon);
      pokemon.resetDrowsy();
      this.log.push(applied
        ? `${pokemon.name}はねむけの効果で眠ってしまった`
        : `${pokemon.name}はねむけだったが眠れなかった`);
    }
  }

  applyStatusEffects(team: Pokemon[]): void {
    for (const pokemon of team) {
      if (pokemon.isFainted) continue;
      this.applyStatusEffect(pokemon);
    }
  }

  // ターン終了時の状態異常処理。状態の種類を網羅的に分岐するため、
  // StatusCondition に状態を追加するとここが型エラーになり、実装漏れを防げる。
  private applyStatusEffect(pokemon: Pokemon): void {
    const state = pokemon.statusState;

    switch (state.kind) {
      // まひ・こおりの行動阻害は技を出す直前（useMove）で判定するため、ターン終了時は何もしない。
      case 'none':
      case 'paralysis':
      case 'freeze':
        return;

      case 'burn': {
        const damage = Math.floor(pokemon.maxHP / BURN_DAMAGE_DENOMINATOR);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}は火傷ダメージで${damage}のダメージを受けた`);
        return;
      }

      case 'poison': {
        const damage = Math.floor(pokemon.maxHP / POISON_DAMAGE_DENOMINATOR);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}は毒ダメージで${damage}のダメージを受けた`);
        return;
      }

      case 'badly-poisoned': {
        // 猛毒は経過ターン数に比例してダメージが増える（floor(maxHP * n / 16)）。
        const elapsedTurns = pokemon.advanceToxicCounter(TOXIC_MAX_COUNTER);
        const damage = Math.floor((pokemon.maxHP * elapsedTurns) / TOXIC_DAMAGE_DENOMINATOR);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}は猛毒ダメージで${damage}のダメージを受けた（${elapsedTurns}ターン目）`);
        return;
      }

      case 'sleep': {
        const turnsLeft = pokemon.consumeSleepTurn();
        if (turnsLeft <= 0) {
          this.log.push(`${pokemon.name}は眠りから覚めた`);
        } else {
          this.log.push(`${pokemon.name}は眠り続けている（残り${turnsLeft}ターン）`);
        }
        return;
      }

      default: {
        const unreachable: never = state;
        throw new TypeError(`未知の状態異常です: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  switchIn(pokemon: Pokemon, team: Pokemon[], side?: 0 | 1): Pokemon {
    this.log.push(`${pokemon.name}が場に出た！`);
    // もらいびの吸収状態は場を離れると解除される（volatile）。
    pokemon.flashFireActive = false;
    this.events.emit('switch-in', { pokemon, team, engine: this });

    if (side === undefined || pokemon.isFainted) return pokemon;

    const key = this.sideKey(side);

    // ステルスロック: 岩タイプ有効度に基づくダメージ（1/8 HP）
    if (this.field.stealthRock[key]) {
      const effectiveness = this.getTypeEffectiveness('rock', pokemon.types);
      if (effectiveness > 0) {
        const damage = Math.floor((pokemon.maxHP / 8) * effectiveness);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}はステルスロックのダメージで${damage}のダメージを受けた`);
      }
    }

    // まきびし: 飛行タイプは無効。層数に応じてダメージ。
    if (this.field.spikes[key] > 0) {
      if (this.isGrounded(pokemon)) {
        const spikesLayers = this.field.spikes[key];
        // 1層=1/8, 2層=1/6, 3層=1/4
        const denoms = [0, 8, 6, 4];
        const damage = Math.floor(pokemon.maxHP / denoms[spikesLayers]);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}はまきびしのダメージで${damage}のダメージを受けた`);
      }
    }

    // どくびし: どく/はがね/ひこうタイプ、ふゆう特性は無効。毒タイプは吸収して解除。
    if (this.field.toxicSpikes[key] > 0) {
      const isImmune =
        pokemon.types.includes('poison')
        || pokemon.types.includes('steel')
        || !this.isGrounded(pokemon);
      if (isImmune) {
        if (pokemon.types.includes('poison')) {
          // 毒タイプはどくびしを吸収して解除
          this.field.toxicSpikes[key] = 0;
          this.log.push(`${pokemon.name}はどくびしを吸収して消した`);
        }
        // はがね・接地していないポケモン（ひこう・ふゆう・ふうせん）は無効（何もしない）
      } else if (!pokemon.isFainted && pokemon.status === null) {
        // 状態異常でなければ毒付与（1層= poison, 2層= badly-poisoned）
        const toxicStatus: StatusCondition = this.field.toxicSpikes[key] >= 2 ? 'badly-poisoned' : 'poison';
        if (this.blocksStatusByAbility(pokemon, toxicStatus)) {
          this.observeAbility(pokemon);
          this.log.push(`${pokemon.name}の${pokemon.ability}でどくびしの毒を受けない`);
        } else if (toxicStatus === 'badly-poisoned') {
          pokemon.applyStatus('badly-poisoned', this.rng);
          this.log.push(`${pokemon.name}はどくびしの猛毒を受けた`);
        } else {
          pokemon.applyStatus('poison', this.rng);
          this.log.push(`${pokemon.name}はどくびしの毒を受けた`);
        }
      }
    }

    return pokemon;
  }

  // 接地しているか。フィールド（地形）の効果は接地しているポケモンだけが受ける。
  // ひこうタイプ・ふゆう特性・割れていないふうせんは地に足がついていない（本編仕様）。
  isGrounded(pokemon: Pokemon): boolean {
    return !pokemon.types.includes('flying') && pokemon.ability !== 'levitate' && !this.hasAirBalloon(pokemon);
  }

  // 割れていないふうせんを持っているか。
  hasAirBalloon(pokemon: Pokemon): boolean {
    return pokemon.item === 'air-balloon' && !pokemon.itemUsed;
  }

  // 技の実効優先度。グラススライダーはグラスフィールドで接地していれば+1（本編仕様）。
  movePriority(pokemon: Pokemon, move: MoveData): number {
    if (isDamageMove(move) && move.priorityInGrassyTerrain
        && this.field.terrain === 'grassy-terrain' && this.isGrounded(pokemon)) {
      return move.priority + 1;
    }
    return move.priority;
  }

  calculateSpeed(pokemon: Pokemon): number {
    let speed = Math.floor(pokemon.stats.SPEED * pokemon.getStatStageMultiplier('SPEED'));

    if (pokemon.item === 'choice-scarf') {
      speed = Math.floor(speed * 1.5);
    }

    // くろいてっきゅう: 素早さが半減する（じめん技が当たるようになる効果は未実装）。
    if (pokemon.item === 'iron-ball') {
      speed = Math.floor(speed / 2);
    }

    if (pokemon.status === 'paralysis') {
      speed = Math.floor(speed / 2);
    }

    // すいすい: 雨のとき素早さが2倍になる
    if (pokemon.ability === 'swift-swim' && this.weather === 'rain') {
      speed *= 2;
    }

    // ようりょくそ: 晴れのとき素早さが2倍になる
    if (pokemon.ability === 'chlorophyll' && this.weather === 'sun') {
      speed *= 2;
    }

    // かるわざ: 持ち物を失うと素早さが2倍になる（この実装では itemUsed を消費とみなす）。
    if (pokemon.ability === 'unburden' && pokemon.itemUsed) {
      speed *= 2;
    }

    const side = this.getSide(pokemon);
    if (side !== null && this.field.tailwind[this.sideKey(side)] > 0) {
      speed *= 2;
    }

    return this.trickRoom ? -speed : speed;
  }

  // すばやさが速い順に並べ替える。同速の場合はランダムに順序を決める
  // （同速判定に依存せず公平な乱数にするため、先にシャッフルしてから安定ソートする）。
  orderBySpeed<T extends { pokemon: Pokemon }>(entries: T[]): T[] {
    return this.shuffle(entries)
      .map((entry) => ({ entry, speed: this.calculateSpeed(entry.pokemon) }))
      .sort((a, b) => b.speed - a.speed)
      .map(({ entry }) => entry);
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  getLog(): string {
    return this.log.join('\n');
  }
}
