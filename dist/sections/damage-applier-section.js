export class DamageApplierSection {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    applyDamage(defender, damage) {
        this.engine.events.emit('apply-damage', { defender, damage, engine: this.engine });
        defender.takeDamage(damage, this.engine);
    }
}
//# sourceMappingURL=damage-applier-section.js.map