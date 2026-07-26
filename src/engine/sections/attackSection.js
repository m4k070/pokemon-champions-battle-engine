/**
 * AttackSection - 攻撃力計算セクション
 */
class AttackSection {
  constructor(engine) {
    this.engine = engine;
  }
  
  calculate(attacker, move) {
    let attack = attacker.stats[move.category === 'physical' ? 'ATK' : 'SPATK'];
    
    // 火傷で物理攻撃半減
    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }
    
    this.engine.events.emit('calculate-attack', { attacker, move, attack });
    
    return attack;
  }
}

module.exports = { AttackSection };
EOF