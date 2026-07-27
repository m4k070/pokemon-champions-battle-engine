import { EventEmitter } from './event-emitter.js';
import { TYPE_CHART } from './type-chart.js';
import type { Pokemon } from './pokemon.js';
import type { MoveData, TypeName, WeatherType, TypeChart } from './types.js';

export interface UseMoveResult {
  success: boolean;
  damage?: number;
  effectiveness?: number;
  status?: string;
}

export class BattleEngine {
  events: EventEmitter;
  weather: WeatherType | null;
  weatherTurnsLeft: number;
  trickRoom: boolean;
  trickRoomTurnsLeft: number;
  turn: number;
  log: string[];
  typeChart: TypeChart;

  private activePokemon0: Pokemon | null = null;
  private activePokemon1: Pokemon | null = null;

  constructor() {
    this.events = new EventEmitter();
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.turn = 0;
    this.log = [];
    this.typeChart = TYPE_CHART;
    this.setupEventHandlers();
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

  private setupEventHandlers(): void {
    this.events.on('switch-in', (data) => {
      const pokemon = data.pokemon;
      if (!pokemon || typeof pokemon !== 'object') return;
      const p = pokemon as Pokemon;

      if (p.ability === 'sand-stream' && this.weather !== 'sand') {
        this.weather = 'sand';
        this.weatherTurnsLeft = 5;
        this.log.push(`${p.name}の特性「すなおこし」により砂嵐が発生した`);
      }

      if (p.ability === 'intimidate') {
        const opponent = this.getOpponent(p);
        if (opponent && !opponent.isFainted) {
          opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
          this.log.push(`${p.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
        }
      }
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

        if (p.item === 'life-orb') {
          const damage = Math.floor(p.maxHP / 10);
          p.takeDamage(damage, this);
          this.log.push(`${p.name}はいのちのたまの反動で${damage}のダメージを受けた`);
        }

        if (p.item === 'sitrus-berry' && !p.itemUsed) {
          if (p.currentHP <= p.maxHP / 4) {
            const heal = Math.floor(p.maxHP / 2);
            p.heal(heal);
            p.itemUsed = true;
            this.log.push(`${p.name}はオボンのみで${heal}回復した`);
          }
        }
      }
    });

    this.events.on('apply-damage', (data) => {
      const defender = data.defender;
      if (!defender || typeof defender !== 'object') return;
      const d = defender as Pokemon;

      if (d.item === 'focus-sash' && !d.itemUsed && d.currentHP === d.maxHP) {
        d.currentHP = 1;
        d.itemUsed = true;
        this.log.push(`${d.name}はきあいのタスキで耐えた！`);
      }
    });
  }

  calculateAttack(attacker: Pokemon, move: { category: string }): number {
    let attack = move.category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;

    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }

    this.events.emit('calculate-attack', { attacker, move, attack });

    return attack;
  }

  calculateDefense(defender: Pokemon, move: { category: string }): number {
    const defense = move.category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;

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
    const finalDamage = Math.floor(baseDamage * effectiveness);

    this.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });

    return { finalDamage, effectiveness };
  }

  applyDamage(defender: Pokemon, damage: number): void {
    this.events.emit('apply-damage', { defender, damage, engine: this });
    defender.takeDamage(damage, this);
  }

  useMove(attacker: Pokemon, defender: Pokemon, move: { name: string; type: TypeName; power: number; accuracy?: number; pp?: number; category: string; status?: string | null }): UseMoveResult {
    this.log.push(`${attacker.name}の${move.name}`);

    const accuracy = move.accuracy;
    if (accuracy !== undefined && accuracy < 100) {
      if (Math.random() * 100 > accuracy) {
        this.log.push('技は外れた');
        return { success: false };
      }
    }

    if (move.status) {
      const applied = defender.applyStatus(move.status as any);
      if (applied) {
        this.log.push(`${defender.name}は${move.status}状態になった`);
      } else {
        this.log.push('効果がない');
      }
      return { success: true, status: move.status };
    }

    const moveFull: MoveData = {
      name: move.name,
      type: move.type,
      power: move.power,
      accuracy: accuracy ?? 100,
      pp: move.pp ?? 10,
      maxPP: move.pp ?? 10,
      category: (move.category as any) ?? 'physical',
      status: (move.status as any) ?? null,
      priority: 0,
      effectChance: null,
    };

    let power = move.power;

    if (attacker.types && attacker.types.includes(move.type)) {
      power *= 1.5;
    }

    if (attacker.item === 'life-orb') {
      power *= 1.3;
    }

    const moveWithStab: MoveData = { ...moveFull, power };

    const attack = this.calculateAttack(attacker, moveWithStab);
    const defense = this.calculateDefense(defender, moveWithStab);
    const baseDamage = this.calculateBaseDamage(attack, defense, moveWithStab);
    const { finalDamage, effectiveness } = this.applyModifiers(baseDamage, attacker, defender, moveWithStab);

    this.applyDamage(defender, finalDamage);

    if (effectiveness > 1) {
      this.log.push('効果は抜群だ！');
    } else if (effectiveness < 1 && effectiveness > 0) {
      this.log.push('効果はいまひとつのようだ');
    } else if (effectiveness === 0) {
      this.log.push('効果がなかった');
    }

    this.log.push(`${defender.name}に${finalDamage}のダメージ`);

    if (defender.isFainted) {
      this.log.push(`${defender.name}は戦闘不能になった`);
    }

    return { success: true, damage: finalDamage, effectiveness };
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
  }

  endTurn(teamA: Pokemon[], teamB: Pokemon[]): void {
    this.applyStatusEffects(teamA);
    this.applyStatusEffects(teamB);
    this.events.emit('end-turn', { team: [...teamA, ...teamB], engine: this });
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

  switchIn(pokemon: Pokemon, team: Pokemon[]): Pokemon {
    this.log.push(`${pokemon.name}が場に出た！`);
    this.events.emit('switch-in', { pokemon, team, engine: this });
    return pokemon;
  }

  calculateSpeed(pokemon: Pokemon): number {
    let speed = pokemon.stats.SPEED;

    if (pokemon.item === 'choice-scarf') {
      speed = Math.floor(speed * 1.5);
    }

    if (pokemon.status === 'paralysis') {
      speed = Math.floor(speed / 2);
    }

    return this.trickRoom ? -speed : speed;
  }

  getLog(): string {
    return this.log.join('\n');
  }
}
