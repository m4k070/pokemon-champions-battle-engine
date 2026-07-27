export class DefenseSection {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    calculate(defender, move) {
        const defense = move.category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;
        this.engine.events.emit('calculate-defense', { defender, move, defense });
        return defense;
    }
}
//# sourceMappingURL=defense-section.js.map