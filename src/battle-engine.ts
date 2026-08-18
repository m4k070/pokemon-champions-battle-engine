import { EventEmitter } from './event-emitter.js';
import { TYPE_CHART } from './type-chart.js';
import { BattleField } from './battle-field.js';
import { getAbilityDefinition } from './rules/abilities/registry.js';
import type { Pokemon } from './pokemon.js';
import type { MoveData, StatStageKey, TypeName, WeatherType, TypeChart } from './types.js';

export interface UseMoveResult {
  success: boolean;
  damage?: number;
  effectiveness?: number;
  status?: string;
  // とんぼがえり等のpivot技が成立し、使用者が交代すべき状態になったことを呼び出し元へ伝える。
  // 交代先の決定と実行はチーム情報を持つBattleSession側の責務。
  pivot?: boolean;
}

// 猛毒(どくどく)のダメージ増加は本編仕様に合わせて15ターン目で頭打ちにする。
const TOXIC_MAX_COUNTER = 15;

// ウェザーボールは天候下でタイプが変化する（無天候時はノーマル固定のまま）。
const WEATHER_BALL_TYPE: Partial<Record<WeatherType, TypeName>> = {
  rain: 'water',
  sun: 'fire',
  sand: 'rock',
  hail: 'ice',
};

// あさのひざし等、天候依存の自己回復技の回復割合（本編仕様）。
const WEATHER_HEAL_PERCENT: Record<'none' | WeatherType, number> = {
  none: 0.5,
  sun: 2 / 3,
  rain: 0.25,
  sand: 0.25,
  hail: 0.25,
};

// 通常配分の多段技（スキルリンク等は非対応）のヒット数分布。
const MULTI_HIT_TABLE: { hits: number; weight: number }[] = [
  { hits: 2, weight: 0.375 },
  { hits: 3, weight: 0.375 },
  { hits: 4, weight: 0.125 },
  { hits: 5, weight: 0.125 },
];

export class BattleEngine {
  events: EventEmitter;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  turn: number;
  log: string[];
  typeChart: TypeChart;
  field: BattleField;

  private activePokemon0: Pokemon | null = null;
  private activePokemon1: Pokemon | null = null;
  // いのちのたまの反動は「そのターンにダメージを与えた攻撃者」だけに発動するため、
  // ターンをまたいで参照できるようendTurn()で記録・end-turnイベント処理後にリセットする。
  private attackersDealtDamageThisTurn: Set<Pokemon> = new Set();

  constructor() {
    this.events = new EventEmitter();
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.turn = 0;
    this.log = [];
    this.typeChart = TYPE_CHART;
    this.field = new BattleField();
    this.setupEventHandlers();
  }

  private sideKey(side: 0 | 1): 'playerA' | 'playerB' {
    return side === 0 ? 'playerA' : 'playerB';
  }

  setStealthRock(side: 0 | 1): void {
    this.field.stealthRock[this.sideKey(side)] = true;
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

  private getSide(pokemon: Pokemon): 0 | 1 | null {
    if (this.activePokemon0 === pokemon) return 0;
    if (this.activePokemon1 === pokemon) return 1;
    return null;
  }

  private setupEventHandlers(): void {
    this.events.on('switch-in', (data) => {
      const pokemon = data.pokemon;
      if (!pokemon || typeof pokemon !== 'object') return;
      const p = pokemon as Pokemon;

      const ability = getAbilityDefinition(p.ability);
      ability?.onSwitchIn?.({ pokemon: p, engine: this });
    });

    this.events.on('end-turn', (data) => {
      const team = data.team;
      if (!Array.isArray(team)) return;

      for (const pokemon of team) {
        if (!pokemon || typeof pokemon !== 'object') continue;
        const p = pokemon as Pokemon;
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
          p.applyStatus('badly-poisoned');
          p.itemUsed = true;
          this.log.push(`${p.name}はどくどくだまの毒に侵された`);
        }

        // 特性のターン終了時フック（かそく等）。
        const ability = getAbilityDefinition(p.ability);
        ability?.onEndTurn?.({ pokemon: p, engine: this });
      }
    });

    this.events.on('apply-damage', (data) => {
      const defender = data.defender;
      if (!defender || typeof defender !== 'object') return;
      const d = defender as Pokemon;
      const damage = data.damage as number;

      if (d.item === 'focus-sash' && !d.itemUsed && d.currentHP === d.maxHP && damage >= d.currentHP) {
        data.damage = d.currentHP - 1;
        d.itemUsed = true;
        this.log.push(`${d.name}はきあいのタスキで耐えた！`);
      }
    });
  }

  calculateAttack(attacker: Pokemon, move: { category: string }): number {
    const statKey: StatStageKey = move.category === 'physical' ? 'ATK' : 'SPATK';
    // 防御側がてんねん(ignoresOpponentStatChanges)なら、攻撃側の能力ランクを無視する。
    const defender = this.getOpponent(attacker);
    const ignoreStages = defender
      ? (getAbilityDefinition(defender.ability)?.ignoresOpponentStatChanges?.() ?? false)
      : false;
    const stageMultiplier = ignoreStages ? 1 : attacker.getStatStageMultiplier(statKey);
    let attack = Math.floor(attacker.stats[statKey] * stageMultiplier);

    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }

    const ability = getAbilityDefinition(attacker.ability);
    if (ability?.modifyAttack) {
      attack = ability.modifyAttack({ pokemon: attacker, move: move as MoveData, value: attack, engine: this });
    }

    this.events.emit('calculate-attack', { attacker, move, attack });

    return attack;
  }

  calculateDefense(defender: Pokemon, move: { category: string }): number {
    const statKey: StatStageKey = move.category === 'physical' ? 'DEF' : 'SPDEF';
    // 攻撃側がてんねん(ignoresOpponentStatChanges)なら、防御側の能力ランクを無視する。
    const attacker = this.getOpponent(defender);
    const ignoreStages = attacker
      ? (getAbilityDefinition(attacker.ability)?.ignoresOpponentStatChanges?.() ?? false)
      : false;
    const stageMultiplier = ignoreStages ? 1 : defender.getStatStageMultiplier(statKey);
    let defense = Math.floor(defender.stats[statKey] * stageMultiplier);

    const ability = getAbilityDefinition(defender.ability);
    if (ability?.modifyDefense) {
      defense = ability.modifyDefense({ pokemon: defender, move: move as MoveData, value: defense, engine: this });
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
        effectiveness *= chart[type] !== undefined ? chart[type]! : 1.0;
      }
    }
    return effectiveness;
  }

  applyModifiers(baseDamage: number, attacker: Pokemon, defender: Pokemon, move: MoveData): { finalDamage: number; effectiveness: number } {
    const effectiveness = this.getTypeEffectiveness(move.type, defender.types);
    let finalDamage = Math.floor(baseDamage * effectiveness);

    const defenderSide = this.getSide(defender);
    if (move.category === 'physical' && defenderSide !== null && this.field.reflect[this.sideKey(defenderSide)] > 0) {
      finalDamage = Math.floor(finalDamage / 2);
    }

    this.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });

    return { finalDamage, effectiveness };
  }

  applyDamage(defender: Pokemon, damage: number, attacker?: Pokemon, move?: MoveData): void {
    let effectiveDamage = damage;

    // 特性の被弾時フック（がんじょう・じきゅうりょく・あついしぼう・さめはだ等）。
    if (attacker && move) {
      const ability = getAbilityDefinition(defender.ability);
      const adjusted = ability?.onDamaged?.({ defender, attacker, move, damage, engine: this });
      if (typeof adjusted === 'number') effectiveDamage = adjusted;
    }

    // シュカのみ: 地面技のダメージを半減する（1回限り）。
    if (defender.item === 'shuca-berry' && !defender.itemUsed && move?.type === 'ground') {
      effectiveDamage = Math.floor(effectiveDamage / 2);
      defender.itemUsed = true;
      this.log.push(`${defender.name}はシュカのみで地面技のダメージを半減した`);
    }

    this.events.emit('apply-damage', { defender, damage: effectiveDamage, attacker, move, engine: this });
    defender.takeDamage(effectiveDamage, this);
  }

  useMove(attacker: Pokemon, defender: Pokemon, move: MoveData): UseMoveResult {
    if (move.pp <= 0) {
      this.log.push(`${attacker.name}は${move.name}を出そうとしたが、PPが残っていない！`);
      return { success: false };
    }
    move.pp -= 1;

    this.log.push(`${attacker.name}の${move.name}`);

    // ぼうだん等の技無効化特性は命中判定より前に解決する（本編仕様）。
    const defenderAbility = getAbilityDefinition(defender.ability);
    if (defenderAbility?.blocksMove?.(move)) {
      this.log.push(`${defender.name}の${defender.ability}で効果がないようだ`);
      return { success: false };
    }

    if (move.accuracy < 100) {
      // ノーガード(no-guard): 攻撃側・防御側どちらかが持てば命中率100%になる。
      const attackerNoGuard = getAbilityDefinition(attacker.ability)?.name === 'no-guard';
      const defenderNoGuard = getAbilityDefinition(defender.ability)?.name === 'no-guard';
      if (!attackerNoGuard && !defenderNoGuard && Math.random() * 100 > move.accuracy) {
        this.log.push('技は外れた');
        return { success: false };
      }
    }

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
      return { success: true };
    }

    if (move.fieldEffect === 'tailwind') {
      const side = this.getSide(attacker);
      if (side !== null) {
        this.field.tailwind[this.sideKey(side)] = 4;
        this.log.push(`${attacker.name}側の場に「おいかぜ」が吹き始めた`);
      }
      return { success: true };
    }

    if (move.fieldEffect === 'reflect') {
      const side = this.getSide(attacker);
      if (side !== null) {
        this.field.reflect[this.sideKey(side)] = 5;
        this.log.push(`${attacker.name}側の場に「リフレクター」の壁ができた`);
      }
      return { success: true };
    }

    if (move.weatherHeal) {
      const percent = WEATHER_HEAL_PERCENT[this.weather ?? 'none'];
      const heal = Math.floor(attacker.maxHP * percent);
      attacker.heal(heal);
      this.log.push(`${attacker.name}は${move.name}で${heal}回復した`);
      return { success: true };
    }

    // キングシールド等: バトルスイッチ持ち（ギルガルド）がシールドフォルムに戻る。
    if (move.restoresShieldForm) {
      const ability = getAbilityDefinition(attacker.ability);
      if (ability?.name === 'battle-switch' && attacker.form !== 'shield') {
        attacker.setForm('shield');
        this.log.push(`${attacker.name}はシールドフォルムに戻った`);
      }
      return { success: true };
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
      return { success: true };
    }

    if (move.selfStatChange && move.power === 0) {
      this.applySelfStatChange(attacker, move.selfStatChange);
      return { success: true };
    }

    if (move.status) {
      const applied = defender.applyStatus(move.status);
      if (applied) {
        this.log.push(`${defender.name}は${move.status}状態になった`);
      } else {
        this.log.push('効果がない');
      }
      return { success: true, status: move.status };
    }

    // ウェザーボールは天候下でタイプが変化する。
    const effectiveType = move.name === 'weather-ball' && this.weather && WEATHER_BALL_TYPE[this.weather]
      ? WEATHER_BALL_TYPE[this.weather]!
      : move.type;

    let power = move.power;

    if (attacker.types && attacker.types.includes(effectiveType)) {
      power *= 1.5;
    }

    if (attacker.item === 'life-orb') {
      power *= 1.3;
    }

    // こだわりハチマキ/メガネは該当カテゴリの威力を1.5倍にする（技は使用後に固定される）。
    if (attacker.item === 'choice-band' && move.category === 'physical') {
      power *= 1.5;
    } else if (attacker.item === 'choice-specs' && move.category === 'special') {
      power *= 1.5;
    }

    // 特性による威力補正（テクニシャン等）。
    const powerAbility = getAbilityDefinition(attacker.ability);
    if (powerAbility?.modifyMovePower) {
      power = powerAbility.modifyMovePower({ pokemon: attacker, move, value: power, engine: this });
    }

    const moveWithStab: MoveData = { ...move, power, type: effectiveType };

    // ロックブラスト等の多段技は命中判定こそ1回だが、当たった後の実ヒット数は乱数（本編仕様）。
    const hitCount = move.multiHit ? this.rollMultiHitCount() : 1;
    let totalDamage = 0;
    let lastEffectiveness = 1;

    for (let hit = 0; hit < hitCount && !defender.isFainted; hit++) {
      const attack = this.calculateAttack(attacker, moveWithStab);
      const defense = this.calculateDefense(defender, moveWithStab);
      const baseDamage = this.calculateBaseDamage(attack, defense, moveWithStab);
      const { finalDamage, effectiveness } = this.applyModifiers(baseDamage, attacker, defender, moveWithStab);

      this.applyDamage(defender, finalDamage, attacker, moveWithStab);
      totalDamage += finalDamage;
      lastEffectiveness = effectiveness;

      if (finalDamage > 0) {
        this.attackersDealtDamageThisTurn.add(attacker);
      }
    }

    if (move.multiHit) {
      this.log.push(`${hitCount}回攻撃した！`);
    }

    if (lastEffectiveness > 1) {
      this.log.push('効果は抜群だ！');
    } else if (lastEffectiveness < 1 && lastEffectiveness > 0) {
      this.log.push('効果はいまひとつのようだ');
    } else if (lastEffectiveness === 0) {
      this.log.push('効果がなかった');
    }

    this.log.push(`${defender.name}に${totalDamage}のダメージ`);

    // 特性の「ダメージ技を命中させた後」フック（バトルスイッチ等）。
    const attackerAbility = getAbilityDefinition(attacker.ability);
    attackerAbility?.onMoveUsed?.({ attacker, defender, move, engine: this });

    if (defender.isFainted) {
      this.log.push(`${defender.name}は戦闘不能になった`);
    } else {
      if (move.secondaryEffect && Math.random() * 100 < move.secondaryEffect.chance) {
        const applied = defender.applyStatus(move.secondaryEffect.status);
        if (applied) {
          this.log.push(`${defender.name}は${move.secondaryEffect.status}状態になった`);
        }
      }
      if (move.targetStatChange) {
        this.applyTargetStatChange(attacker, defender, move.targetStatChange);
      }
    }

    // リーフストームのような「威力を持つが使用者自身の能力も変化する」技。
    if (move.selfStatChange) {
      this.applySelfStatChange(attacker, move.selfStatChange);
    }

    // とんぼがえり等は攻撃が通った後に使用者が退場する。
    // 相手を倒しきった場合も本編では交代が発生するが、使用者自身が倒れていたら交代はしない。
    const pivot = move.pivot === true && !attacker.isFainted;

    return { success: true, damage: totalDamage, effectiveness: lastEffectiveness, pivot };
  }

  // 通常配分（2発37.5%/3発37.5%/4発12.5%/5発12.5%）でヒット数を決める。
  private rollMultiHitCount(): number {
    const roll = Math.random();
    let cumulative = 0;
    for (const { hits, weight } of MULTI_HIT_TABLE) {
      cumulative += weight;
      if (roll < cumulative) return hits;
    }
    return MULTI_HIT_TABLE[MULTI_HIT_TABLE.length - 1].hits;
  }

  private applyTargetStatChange(attacker: Pokemon, pokemon: Pokemon, changes: NonNullable<MoveData['targetStatChange']>): void {
    for (const change of changes) {
      if (Math.random() * 100 >= change.chance) continue;
      // ミラーアーマー: 相手から受ける能力低下をその相手に反射する。
      if (change.delta < 0 && pokemon.ability === 'mirror-armor') {
        const applied = attacker.modifyStatStage(change.stat, change.delta);
        if (applied === 0) continue;
        const direction = applied > 0 ? '上がった' : '下がった';
        this.log.push(`${attacker.name}の${change.stat}が${direction}（${pokemon.name}のミラーアーマー）`);
        continue;
      }
      const applied = pokemon.modifyStatStage(change.stat, change.delta);
      if (applied === 0) continue;
      const direction = applied > 0 ? '上がった' : '下がった';
      this.log.push(`${pokemon.name}の${change.stat}が${direction}`);
    }
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
    }
  }

  endTurn(teamA: Pokemon[], teamB: Pokemon[]): void {
    this.applyStatusEffects(teamA);
    this.applyStatusEffects(teamB);
    this.applyLeechSeed(teamA, teamB);
    this.applyWeatherDamage([...teamA, ...teamB]);
    this.events.emit('end-turn', { team: [...teamA, ...teamB], engine: this });
    this.attackersDealtDamageThisTurn.clear();
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

  applyStatusEffects(team: Pokemon[]): void {
    for (const pokemon of team) {
      if (pokemon.isFainted) continue;

      if (pokemon.status === 'burn') {
        const damage = Math.floor(pokemon.maxHP / 16);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}は火傷ダメージで${damage}のダメージを受けた`);
      } else if (pokemon.status === 'poison') {
        const damage = Math.floor(pokemon.maxHP / 8);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}は毒ダメージで${damage}のダメージを受けた`);
      } else if (pokemon.status === 'badly-poisoned') {
        pokemon.toxicCounter = Math.min(pokemon.toxicCounter + 1, TOXIC_MAX_COUNTER);
        const damage = Math.floor((pokemon.maxHP * pokemon.toxicCounter) / 16);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}は猛毒ダメージで${damage}のダメージを受けた（${pokemon.toxicCounter}ターン目）`);
      } else if (pokemon.status === 'sleep') {
        pokemon.statusTurnsLeft--;
        if (pokemon.statusTurnsLeft <= 0) {
          pokemon.removeStatus();
          this.log.push(`${pokemon.name}は眠りから覚めた`);
        } else {
          this.log.push(`${pokemon.name}は眠り続けている（残り${pokemon.statusTurnsLeft}ターン）`);
        }
      }
    }
  }

  switchIn(pokemon: Pokemon, team: Pokemon[], side?: 0 | 1): Pokemon {
    this.log.push(`${pokemon.name}が場に出た！`);
    this.events.emit('switch-in', { pokemon, team, engine: this });

    if (side !== undefined && !pokemon.isFainted && this.field.stealthRock[this.sideKey(side)]) {
      const effectiveness = this.getTypeEffectiveness('rock', pokemon.types);
      if (effectiveness > 0) {
        const damage = Math.floor((pokemon.maxHP / 8) * effectiveness);
        pokemon.takeDamage(damage, this);
        this.log.push(`${pokemon.name}はステルスロックのダメージで${damage}のダメージを受けた`);
      }
    }

    return pokemon;
  }

  calculateSpeed(pokemon: Pokemon): number {
    let speed = Math.floor(pokemon.stats.SPEED * pokemon.getStatStageMultiplier('SPEED'));

    if (pokemon.item === 'choice-scarf') {
      speed = Math.floor(speed * 1.5);
    }

    if (pokemon.status === 'paralysis') {
      speed = Math.floor(speed / 2);
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
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  getLog(): string {
    return this.log.join('\n');
  }
}
