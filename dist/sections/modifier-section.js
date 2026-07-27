export class ModifierSection {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    applyModifiers(baseDamage, attacker, defender, move) {
        const effectiveness = this.engine.getTypeEffectiveness(move.type, defender.types);
        const finalDamage = Math.floor(baseDamage * effectiveness);
        this.engine.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });
        return { finalDamage, effectiveness };
    }
}
//# sourceMappingURL=modifier-section.js.map