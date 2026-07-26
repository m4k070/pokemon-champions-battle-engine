/**
 * BattleEngine - Section設計によるバトルエンジン
 * Game Freak CEDEC2026講演のアーキテクチャに準拠
 */
export class BattleEngine {
  constructor() {
    this.events = new EventEmitter();
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.turn = 0;
    this.log = [];
    
    // タイプ相性表
    this.typeChart = {
      normal: { rock: 0.5, ghost: 0.0, steel: 0.5 },
      fire: { water: 0.5, grass: 2.0, ice: 2.0, steel: 2.0, fire: 0.5, rock: 0.5, dragon: 0.5 },
      water: { fire: 2.0, water: 0.5, grass: 0.5, ground: 2.0, rock: 2.0, dragon: 0.5 },
      electric: { water: 2.0, electric: 0.5, grass: 0.5, ground: 0.0, flying: 2.0, dragon: 0.5 },
      grass: { water: 2.0, fire: 0.5, grass: 0.5, poison: 0.5, ground: 2.0, flying: 0.5, bug: 0.5, rock: 2.0, dragon: 0.5, steel: 0.5 },
      ice: { fire: 0.5, water: 0.5, grass: 2.0, ice: 0.5, ground: 2.0, flying: 2.0, dragon: 2.0, steel: 0.5 },
      fighting: { normal: 2.0, fire: 2.0, water: 2.0, electric: 2.0, grass: 2.0, ice: 2.0, poison: 0.5, ground: 2.0, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2.0, ghost: 0.0, dragon: 2.0, dark: 2.0, steel: 2.0, fairy: 0.5 },
      poison: { grass: 2.0, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0.0, fairy: 2.0 },
      ground: { fire: 2.0, electric: 2.0, grass: 0.5, poison: 2.0, flying: 0.0, bug: 0.5, rock: 2.0, steel: 2.0 },
      flying: { grass: 2.0, electric: 0.5, fighting: 2.0, bug: 2.0, rock: 0.5, steel: 0.5 },
      psychic: { fighting: 2.0, poison: 2.0, psychic: 0.5, dark: 0.0, steel: 0.5 },
      bug: { fire: 0.5, grass: 2.0, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2.0, ghost: 0.5, dark: 2.0, steel: 0.5, fairy: 0.5 },
      rock: { fire: 2.0, water: 2.0, grass: 2.0, fighting: 0.5, ground: 0.5, flying: 2.0, bug: 2.0, steel: 0.5 },
      ghost: { normal: 0.0, psychic: 2.0, ghost: 2.0, dark: 0.5 },
      dragon: { dragon: 2.0, steel: 0.5, fairy: 0.0 },
      dark: { fighting: 0.5, psychic: 2.0, ghost: 2.0, dark: 0.5, steel: 0.5, fairy: 0.5 },
      steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2.0, rock: 2.0, steel: 0.5, fairy: 2.0 },
      fairy: { fire: 0.5, fighting: 2.0, poison: 0.5, dragon: 2.0, dark: 2.0, steel: 0.5 }
    };
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // 特性ハンドラー
    this.events.on('switch-in', (data) => {
      const { pokemon, engine } = data;
      
      if (pokemon.ability === 'sand-stream' && engine.weather !== 'sand') {
        engine.weather = 'sand';
        engine.weatherTurnsLeft = 5;
        engine.log.push(`${pokemon.name}の特性「すなおこし」により砂嵐が発生した`);
      }
      
      if (pokemon.ability === 'intimidate') {
        const opponent = engine.getOpponent(pokemon);
        if (opponent && !opponent.isFainted) {
          opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
          engine.log.push(`${pokemon.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
        }
      }
    });
    
    // 道具ハンドラー
    this.events.on('end-turn', (data) => {
      const { team, engine } = data;
      
      for (const pokemon of team) {
        if (pokemon.isFainted) continue;
        
        if (pokemon.item === 'leftovers') {
          const heal = Math.floor(pokemon.maxHP / 16);
          pokemon.heal(heal);
          engine.log.push(`${pokemon.name}はたべのこしで${heal}回復した`);
        }
        
        if (pokemon.item === 'life-orb') {
          const damage = Math.floor(pokemon.maxHP / 10);
          pokemon.takeDamage(damage, engine);
          engine.log.push(`${pokemon.name}はいのちのたまの反動で${damage}のダメージを受けた`);
        }
        
        if (pokemon.item === 'sitrus-berry' && !pokemon.itemUsed) {
          if (pokemon.currentHP <= pokemon.maxHP / 4) {
            const heal = Math.floor(pokemon.maxHP / 2);
            pokemon.heal(heal);
            pokemon.itemUsed = true;
            engine.log.push(`${pokemon.name}はオボンのみで${heal}回復した`);
          }
        }
      }
    });
    
    this.events.on('apply-damage', (data) => {
      const { defender, engine } = data;
      
      if (defender.item === 'focus-sash' && !defender.itemUsed && defender.currentHP === defender.maxHP) {
        defender.currentHP = 1;
        defender.itemUsed = true;
        engine.log.push(`${defender.name}はきあいのタスキで耐えた！`);
      }
    });
  }
  
  // ===== Section: 攻撃力計算 =====
  calculateAttack(attacker, move) {
    let attack = attacker.stats[move.category === 'physical' ? 'ATK' : 'SPATK'];
    
    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }
    
    this.events.emit('calculate-attack', { attacker, move, attack });
    
    return attack;
  }
  
  // ===== Section: 防御力計算 =====
  calculateDefense(defender, move) {
    let defense = defender.stats[move.category === 'physical' ? 'DEF' : 'SPDEF'];
    
    this.events.emit('calculate-defense', { defender, move, defense });
    
    return defense;
  }
  
  // ===== Section: ダメージ算出 =====
  calculateBaseDamage(attack, defense, move) {
    let power = move.power;
    
    if (attacker.types && attacker.types.includes(move.type)) {
      power *= 1.5;
    }
    
    if (attacker.item === 'life-orb') {
      power *= 1.3;
    }
    
    if (this.weather === 'rain' && move.type === 'water') {
      power *= 1.5;
    } else if (this.weather === 'sun' && move.type === 'fire') {
      power *= 1.5;
    } else if (this.weather === 'rain' && move.type === 'fire') {
      power *= 0.5;
    } else if (this.weather === 'sun' && move.type === 'water') {
      power *= 0.5;
    }
    
    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }
    
    let damage = Math.floor(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2;
    
    return damage;
  }
  
  // ===== Section: タイプ相性 =====
  getTypeEffectiveness(attackType, defenderTypes) {
    let effectiveness = 1.0;
    for (const type of defenderTypes) {
      const chart = this.typeChart[attackType] || {};
      effectiveness *= (chart[type] !== undefined ? chart[type] : 1.0);
    }
    return effectiveness;
  }
  
  // ===== Section: ダメージ補正 =====
  applyModifiers(baseDamage, attacker, defender, move) {
    const effectiveness = this.getTypeEffectiveness(move.type, defender.types);
    let finalDamage = Math.floor(baseDamage * effectiveness);
    
    this.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });
    
    return { finalDamage, effectiveness };
  }
  
  // ===== Section: ダメージ付与 =====
  applyDamage(defender, damage) {
    this.events.emit('apply-damage', { defender, damage, engine: this });
    defender.takeDamage(damage, this);
  }
  
  // ===== 技使用 =====
  useMove(attacker, defender, move) {
    this.log.push(`${attacker.name}の${move.name}`);
    
    if (move.accuracy && move.accuracy < 100) {
      if (Math.random() * 100 > move.accuracy) {
        this.log.push(`技は外れた`);
        return { success: false };
      }
    }
    
    if (move.status) {
      const applied = defender.applyStatus(move.status);
      if (applied) {
        this.log.push(`${defender.name}は${move.status}状態になった`);
      } else {
        this.log.push(`効果がない`);
      }
      return { success: true, status: move.status };
    }
    
    const attack = this.calculateAttack(attacker, move);
    const defense = this.calculateDefense(defender, move);
    const baseDamage = this.calculateBaseDamage(attack, defense, move);
    const { finalDamage, effectiveness } = this.applyModifiers(baseDamage, attacker, defender, move);
    
    this.applyDamage(defender, finalDamage);
    
    if (effectiveness > 1) {
      this.log.push(`効果は抜群だ！`);
    } else if (effectiveness < 1 && effectiveness > 0) {
      this.log.push(`効果はいまひとつのようだ`);
    } else if (effectiveness === 0) {
      this.log.push(`効果がなかった`);
    }
    
    this.log.push(`${defender.name}に${finalDamage}のダメージ`);
    
    if (defender.isFainted) {
      this.log.push(`${defender.name}は戦闘不能になった`);
    }
    
    return { success: true, damage: finalDamage, effectiveness };
  }
  
  // ===== ターン管理 =====
  startTurn() {
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
        this.log.push(`トリックルームが終了しました`);
        this.trickRoom = false;
      }
    }
  }
  
  endTurn(teamA, teamB) {
    this.applyStatusEffects(teamA);
    this.applyStatusEffects(teamB);
    this.events.emit('end-turn', { team: [...teamA, ...teamB], engine: this });
  }
  
  applyStatusEffects(team) {
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
  
  switchIn(pokemon, team) {
    this.log.push(`${pokemon.name}が場に出た`);
    this.events.emit('switch-in', { pokemon, team, engine: this });
    return pokemon;
  }
  
  getOpponent(pokemon) {
    return null;
  }
  
  calculateSpeed(pokemon) {
    let speed = pokemon.stats.SPEED;
    
    if (pokemon.item === 'choice-scarf') {
      speed = Math.floor(speed * 1.5);
    }
    
    if (pokemon.status === 'paralysis') {
      speed = Math.floor(speed / 2);
    }
    
    return this.trickRoom ? -speed : speed;
  }
  
  getLog() {
    return this.log.join('\n');
  }
}

export class EventEmitter {
  constructor() {
    this.handlers = new Map();
    this.handlerCount = 0;
  }
  
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
    this.handlerCount++;
  }
  
  emit(event, data) {
    if (this.handlers.has(event)) {
      const results = [];
      for (const handler of this.handlers.get(event)) {
        results.push(handler(data));
      }
      return results;
    }
    return [];
  }
  
  off(event, handler) {
    if (this.handlers.has(event)) {
      const handlers = this.handlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        this.handlerCount--;
      }
    }
  }
  
  getHandlerCount() {
    return this.handlerCount;
  }
  
  getRegisteredEvents() {
    return Array.from(this.handlers.keys());
  }
}
EOF