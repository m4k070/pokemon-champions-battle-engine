export class ItemHandlers {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    setup() {
        this.engine.events.on('end-turn', (data) => this.handleEndTurn(data));
        this.engine.events.on('apply-damage', (data) => this.handleApplyDamage(data));
    }
    handleEndTurn(data) {
        const team = data.team;
        if (!Array.isArray(team))
            return;
        for (const pokemon of team) {
            if (!pokemon || typeof pokemon !== 'object')
                continue;
            const p = pokemon;
            if (p.isFainted)
                continue;
            if (p.item === 'leftovers') {
                const heal = Math.floor(p.maxHP / 16);
                p.heal(heal);
                this.engine.log.push(`${p.name}はたべのこしで${heal}回復した`);
            }
            if (p.item === 'life-orb') {
                const damage = Math.floor(p.maxHP / 10);
                p.takeDamage(damage, this.engine);
                this.engine.log.push(`${p.name}はいのちのたまの反動で${damage}のダメージを受けた`);
            }
            if (p.item === 'sitrus-berry' && !p.itemUsed) {
                if (p.currentHP <= p.maxHP / 4) {
                    const heal = Math.floor(p.maxHP / 2);
                    p.heal(heal);
                    p.itemUsed = true;
                    this.engine.log.push(`${p.name}はオボンのみで${heal}回復した`);
                }
            }
        }
    }
    handleApplyDamage(data) {
        const defender = data.defender;
        if (!defender || typeof defender !== 'object')
            return;
        const p = defender;
        if (p.item === 'focus-sash' && !p.itemUsed && p.currentHP === p.maxHP) {
            p.currentHP = 1;
            p.itemUsed = true;
            this.engine.log.push(`${p.name}はきあいのタスキで耐えた！`);
        }
    }
}
//# sourceMappingURL=item-handlers.js.map