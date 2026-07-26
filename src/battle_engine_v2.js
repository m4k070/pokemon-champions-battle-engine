/**
 * バトルエンジン v2.0
 * 
 * 機能:
 * - Poke API連携モジュール（データ取得 + JSONキャッシュ）
 * - Section設計バトルエンジン（Game Freak記事準拠）
 * - Event System（特性、道具、天気のEvent Handler）
 * - Champions固有ルール（能力ポイント、Lv.50固定、メガシンカ）
 */

const POKE_API_BASE = 'https://pokeapi.co/api/v2';

// ===== JSONキャッシュ =====
class PokemonDataCache {
  constructor() {
    this.cache = new Map();
  }
  
  get(key) {
    return this.cache.get(key);
  }
  
  set(key, value) {
    this.cache.set(key, value);
  }
  
  has(key) {
    return this.cache.has(key);
  }
  
  toJSON() {
    return JSON.stringify(Object.fromEntries(this.cache), null, 2);
  }
  
  fromJSON(jsonString) {
    const data = JSON.parse(jsonString);
    this.cache = new Map(Object.entries(data));
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

// ===== Poke API =====
class PokemonAPI {
  constructor(cache = null) {
    this.cache = cache || new PokemonDataCache();
  }
  
  async fetchPokemonData(pokemonId) {
    const cacheKey = `pokemon_${pokemonId}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const url = `${POKE_API_BASE}/pokemon/${pokemonId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Pokemon ${pokemonId}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    const formatted = {
      id: data.id,
      name: data.name,
      baseStats: {
        HP: data.stats.find(s => s.stat.name === 'hp').base_stat,
        ATK: data.stats.find(s => s.stat.name === 'attack').base_stat,
        DEF: data.stats.find(s => s.stat.name === 'defense').base_stat,
        SPATK: data.stats.find(s => s.stat.name === 'special-attack').base_stat,
        SPDEF: data.stats.find(s => s.stat.name === 'special-defense').base_stat,
        SPEED: data.stats.find(s => s.stat.name === 'speed').base_stat
      },
      types: data.types.map(t => t.type.name),
      abilities: data.abilities.map(a => ({
        name: a.ability.name,
        isHidden: a.is_hidden
      })),
      moves: data.moves.map(m => m.move.name),
      weight: data.weight,
      height: data.height
    };
    
    this.cache.set(cacheKey, formatted);
    
    return formatted;
  }
  
  async fetchMoveData(moveName) {
    const cacheKey = `move_${moveName}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const url = `${POKE_API_BASE}/move/${moveName}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch move ${moveName}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    const formatted = {
      name: data.name,
      accuracy: data.accuracy,
      power: data.power,
      pp: data.pp,
      type: data.type.name,
      category: data.damage_class.name,
      priority: data.priority,
      effectChance: data.meta?.stat_chance || null
    };
    
    this.cache.set(cacheKey, formatted);
    
    return formatted;
  }
}

// ===== Event System =====
class EventEmitter {
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

// ===== Section設計バトルエンジン =====
class BattleEngine {
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
      'normal': { 'rock': 0.5, 'ghost': 0.0, 'steel': 0.5 },
      'fire': { 'water': 0.5, 'grass': 2.0, 'ice': 2.0, 'steel': 2.0, 'fire': 0.5, 'rock': 0.5, 'dragon': 0.5 },
      'water': { 'fire': 2.0, 'water': 0.5, 'grass': 0.5, 'ground': 2.0, 'rock': 2.0, 'dragon': 0.5 },
      'electric': { 'water': 2.0, 'electric': 0.5, 'grass': 0.5, 'ground': 0.0, 'flying': 2.0, 'dragon': 0.5 },
      'grass': { 'water': 2.0, 'fire': 0.5, 'grass': 0.5, 'poison': 0.5, 'ground': 2.0, 'flying': 0.5, 'bug': 0.5, 'rock': 2.0, 'dragon': 0.5, 'steel': 0.5 },
      'ice': { 'fire': 0.5, 'water': 0.5, 'grass': 2.0, 'ice': 0.5, 'ground': 2.0, 'flying': 2.0, 'dragon': 2.0, 'steel': 0.5 },
      'fighting': { 'normal': 2.0, 'fire': 2.0, 'water': 2.0, 'electric': 2.0, 'grass': 2.0, 'ice': 2.0, 'poison': 0.5, 'ground': 2.0, 'flying': 0.5, 'psychic': 0.5, 'bug': 0.5, 'rock': 2.0, 'ghost': 0.0, 'dragon': 2.0, 'dark': 2.0, 'steel': 2.0, 'fairy': 0.5 },
      'poison': { 'grass': 2.0, 'poison': 0.5, 'ground': 0.5, 'rock': 0.5, 'ghost': 0.5, 'steel': 0.0, 'fairy': 2.0 },
      'ground': { 'fire': 2.0, 'electric': 2.0, 'grass': 0.5, 'poison': 2.0, 'flying': 0.0, 'bug': 0.5, 'rock': 2.0, 'steel': 2.0 },
      'flying': { 'grass': 2.0, 'electric': 0.5, 'fighting': 2.0, 'bug': 2.0, 'rock': 0.5, 'steel': 0.5 },
      'psychic': { 'fighting': 2.0, 'poison': 2.0, 'psychic': 0.5, 'dark': 0.0, 'steel': 0.5 },
      'bug': { 'fire': 0.5, 'grass': 2.0, 'fighting': 0.5, 'poison': 0.5, 'flying': 0.5, 'psychic': 2.0, 'ghost': 0.5, 'dark': 2.0, 'steel': 0.5, 'fairy': 0.5 },
      'rock': { 'fire': 2.0, 'water': 2.0, 'grass': 2.0, 'fighting': 0.5, 'ground': 0.5, 'flying': 2.0, 'bug': 2.0, 'steel': 0.5 },
      'ghost': { 'normal': 0.0, 'psychic': 2.0, 'ghost': 2.0, 'dark': 0.5 },
      'dragon': { 'dragon': 2.0, 'steel': 0.5, 'fairy': 0.0 },
      'dark': { 'fighting': 0.5, 'psychic': 2.0, 'ghost': 2.0, 'dark': 0.5, 'steel': 0.5, 'fairy': 0.5 },
      'steel': { 'fire': 0.5, 'water': 0.5, 'electric': 0.5, 'ice': 2.0, 'rock': 2.0, 'steel': 0.5, 'fairy': 2.0 },
      'fairy': { 'fire': 0.5, 'fighting': 2.0, 'poison': 0.5, 'dragon': 2.0, 'dark': 2.0, 'steel': 0.5 }
    };
    
    // Event Handlerを登録
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
    
    if (attack.types && attack.types.includes(move.type)) {
      power *= 1.5;
    }
    
    if (attack.item === 'life-orb') {
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

// ===== Champions固有ルール =====
class StatPointSystem {
  constructor() {
    this.maxPointsPerStat = 32;
    this.maxTotalPoints = 66;
  }
  
  validateStatPoints(points) {
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
  
  calculateStats(baseStats, statPoints, level = 50) {
    this.validateStatPoints(statPoints);
    
    const stats = {};
    stats.HP = Math.floor(((baseStats.HP * 2 + 31 + Math.floor(statPoints.HP / 4)) * level) / 100) + level + 10;
    
    for (const stat of ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']) {
      stats[stat] = Math.floor(((baseStats[stat] * 2 + 31 + Math.floor(statPoints[stat] / 4)) * level) / 100) + 5;
    }
    
    return stats;
  }
}

class Level50System {
  calculateStats(baseStats, statPoints) {
    const system = new StatPointSystem();
    return system.calculateStats(baseStats, statPoints, 50);
  }
}

class MegaEvolutionSystem {
  constructor() {
    this.megaStones = {
      'charizardite-x': {
        pokemon: 'charizard',
        megaName: 'mega-charizard-x',
        typeChange: ['fire', 'dragon'],
        abilityChange: 'tough-claws'
      },
      'charizardite-y': {
        pokemon: 'charizard',
        megaName: 'mega-charizard-y',
        typeChange: ['fire', 'flying'],
        abilityChange: 'drought'
      },
      'garchompite': {
        pokemon: 'garchomp',
        megaName: 'mega-garchomp',
        typeChange: ['dragon', 'ground'],
        abilityChange: 'sand-force'
      }
    };
  }
  
  canMegaEvolve(pokemon) {
    if (pokemon.isMega) return false;
    if (!pokemon.item) return false;
    
    const stone = this.megaStones[pokemon.item];
    if (!stone) return false;
    if (stone.pokemon !== pokemon.baseName) return false;
    
    return true;
  }
  
  megaEvolve(pokemon) {
    if (!this.canMegaEvolve(pokemon)) {
      throw new Error(`${pokemon.name}はメガシンカできません`);
    }
    
    const stone = this.megaStones[pokemon.item];
    
    pokemon.baseName = pokemon.name;
    pokemon.name = stone.megaName;
    pokemon.types = stone.typeChange;
    pokemon.ability = stone.abilityChange;
    pokemon.isMega = true;
    
    for (const stat of ['HP', 'ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']) {
      pokemon.stats[stat] += 100;
      pokemon.maxHP = pokemon.stats.HP;
      pokemon.currentHP = Math.min(pokemon.currentHP + 100, pokemon.maxHP);
    }
    
    return true;
  }
}

// ===== Pokemonクラス =====
class Pokemon {
  constructor(data) {
    this.name = data.name;
    this.types = data.types;
    this.ability = data.ability;
    this.item = data.item;
    this.itemUsed = false;
    this.lockedMove = null;
    this.baseStats = data.stats;
    this.stats = this.calculateStats(data.stats, 50);
    this.moves = data.moves;
    this.currentHP = this.stats.HP;
    this.maxHP = this.stats.HP;
    this.status = null;
    this.statusTurnsLeft = 0;
    this.isFainted = false;
  }
  
  calculateStats(baseStats, level) {
    const stats = {};
    stats.HP = Math.floor(((baseStats.HP * 2 + 31) * level) / 100) + level + 10;
    
    for (const stat of ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']) {
      stats[stat] = Math.floor(((baseStats[stat] * 2 + 31) * level) / 100) + 5;
    }
    
    return stats;
  }
  
  takeDamage(damage, engine = null) {
    if (engine) {
      engine.events.emit('apply-damage', { defender: this, damage, engine });
    }
    
    this.currentHP = Math.max(0, this.currentHP - damage);
    if (this.currentHP === 0) {
      this.isFainted = true;
    }
  }
  
  heal(amount) {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }
  
  applyStatus(status) {
    if (this.status) return false;
    this.status = status;
    if (status === 'sleep') {
      this.statusTurnsLeft = Math.floor(Math.random() * 3) + 1;
    }
    return true;
  }
  
  removeStatus() {
    this.status = null;
    this.statusTurnsLeft = 0;
  }
  
  canUseMove(moveIndex) {
    if (this.lockedMove !== null && this.lockedMove !== moveIndex) {
      return false;
    }
    return true;
  }
  
  lockMove(moveIndex) {
    if (this.item === 'choice-scarf' || this.item === 'choice-band' || this.item === 'choice-specs') {
      this.lockedMove = moveIndex;
    }
  }
  
  resetLockedMove() {
    this.lockedMove = null;
  }
}

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PokemonDataCache,
    PokemonAPI,
    EventEmitter,
    BattleEngine,
    StatPointSystem,
    Level50System,
    MegaEvolutionSystem,
    Pokemon,
    META_TEAMS,
    SelectionAI
  };
}

