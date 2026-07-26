/**
 * ItemHandlers - 道具のEvent Handler
 */
class ItemHandlers {
  constructor(engine) {
    this.engine = engine;
  }
  
  setup() {
    // ターン終了時のアイテム効果
    this.engine.events.on('end-turn', (data) => {
      const { team, engine } = data;
      
      for (const pokemon of team) {
        if (pokemon.isFainted) continue;
        
        // たべのこし
        if (pokemon.item === 'leftovers') {
          const heal = Math.floor(pokemon.maxHP / 16);
          pokemon.heal(heal);
          engine.log.push(`${pokemon.name}はたべのこしで${heal}回復した`);
        }
        
        // いのちのたま
        if (pokemon.item === 'life-orb') {
          const damage = Math.floor(pokemon.maxHP / 10);
          pokemon.takeDamage(damage, engine);
          engine.log.push(`${pokemon.name}はいのちのたまの反動で${damage}のダメージを受けた`);
        }
        
        // オボンのみ
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
  }
  
  // ダメージ付与時
  setupDamageHandler() {
    this.engine.events.on('apply-damage', (data) => {
      const { defender, engine } = data;
      
      // きあいのタスキ
      if (defender.item === 'focus-sash' && !defender.itemUsed && defender.currentHP === defender.maxHP) {
        defender.currentHP = 1;
        defender.itemUsed = true;
        engine.log.push(`${defender.name}はきあいのタスキで耐えた！`);
      }
    });
  }
  
  setup() {
    this.engine.events.on('end-turn', (data) => this.handleEndTurn(data));
    this.engine.events.on('apply-damage', (data) => this.handleApplyDamage(data));
  }
  
  handleEndTurn(data) {
    const { team, engine } = data;
    
    for (const pokemon of team) {
      if (pokemon.isFainted) continue;
      
      // たべのこし
      if (pokemon.item === 'leftovers') {
        const heal = Math.floor(pokemon.maxHP / 16);
        pokemon.heal(heal);
        engine.log.push(`${pokemon.name}はたべのこしで${heal}回復した`);
      }
      
      // いのちのたま
      if (pokemon.item === 'life-orb') {
        const damage = Math.floor(pokemon.maxHP / 10);
        pokemon.takeDamage(damage, engine);
        engine.log.push(`${pokemon.name}はいのちのたまの反動で${damage}のダメージを受けた`);
      }
      
      // オボンのみ
      if (pokemon.item === 'sitrus-berry' && !pokemon.itemUsed) {
        if (pokemon.currentHP <= pokemon.maxHP / 4) {
          const heal = Math.floor(pokemon.maxHP / 2);
          pokemon.heal(heal);
          pokemon.itemUsed = true;
          engine.log.push(`${pokemon.name}はオボンのみで${heal}回復した`);
        }
      }
    }
  }
  
  handleApplyDamage(data) {
    const { defender, engine } = data;
    
    // きあいのタスキ
    if (defender.item === 'focus-sash' && !defender.itemUsed && defender.currentHP === defender.maxHP) {
      defender.currentHP = 1;
      defender.itemUsed = true;
      engine.log.push(`${defender.name}はきあいのタスキで耐えた！`);
    }
    
    // ゴツゴツメット
    if (defender.item === 'rocky-helmet') {
      // 攻撃側にダメージ
    }
  }
}

module.exports = { ItemHandlers };
EOF