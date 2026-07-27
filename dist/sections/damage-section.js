export class DamageSection {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    calculate(_attack, _defense, move, attacker, defender) {
        if (move.power === 0)
            return { damage: 0 };
        let power = move.power;
        let attack = move.category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;
        let defense = move.category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;
        if (attacker.types && attacker.types.includes(move.type)) {
            power *= 1.5;
        }
        if (attacker.item === 'life-orb') {
            power *= 1.3;
        }
        if (this.engine.weather === 'rain' && move.type === 'water') {
            power *= 1.5;
        }
        else if (this.engine.weather === 'sun' && move.type === 'fire') {
            power *= 1.5;
        }
        else if (this.engine.weather === 'rain' && move.type === 'fire') {
            power *= 0.5;
        }
        else if (this.engine.weather === 'sun' && move.type === 'water') {
            power *= 0.5;
        }
        if (attacker.status === 'burn' && move.category === 'physical') {
            attack = Math.floor(attack / 2);
        }
        const damage = Math.floor(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2;
        return { damage };
    }
}
//# sourceMappingURL=damage-section.js.map