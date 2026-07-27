export class AttackSection {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    calculate(attacker, move) {
        let attack = move.category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;
        if (attacker.status === 'burn' && move.category === 'physical') {
            attack = Math.floor(attack / 2);
        }
        this.engine.events.emit('calculate-attack', { attacker, move, attack });
        return attack;
    }
}
//# sourceMappingURL=attack-section.js.map