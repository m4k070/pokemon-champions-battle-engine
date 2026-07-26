/**
 * DamageSection - ダメージ算出セクション
 */
class DamageSection {
  constructor(engine) {
    this.engine = engine;
  }
  
  calculate(attack, defense, move, attacker, defender) {
    if (move.power === 0) return { damage: 0, effectiveness: 1.0 };
    
    let power = move.power;
    let attack = attacker.stats[move.category === 'physical' ? 'ATK' : 'SPATK'];
    let defense = defender.stats[move.category === 'physical' ? 'DEF' : 'SPDEF'];
    
    // タイプ一致ボーナス
    if (attacker.types && attacker.types.includes(move.type)) {
      power *= 1.5;
    }
    
    // いのちのたま補正
    if (attacker.item === 'life-orb') {
      power *= 1.3;
    }
    
    // 天候補正
    if (this.engine.weather === 'rain' && move.type === 'water') {
      power *= 1.5;
    } else if (this.engine.weather === 'sun' && move.type === 'fire') {
      power *= 1.5;
    } else if (this.engine.weather === 'rain' && move.type === 'fire') {
      power *= 0.5;
    } else if (this.engine.weather === 'sun' && move.type === 'water') {
      power *= 0.5;
    }
    
    // 火傷で物理攻撃半減
    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }
    
    let damage = Math.floor(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2;
    
    return { damage, effectiveness: 1.0 };
  }
}

module.exports = { DamageSection };
EOF