export class Move {
    name;
    type;
    power;
    accuracy;
    pp;
    maxPP;
    category;
    status;
    priority;
    effectChance;
    constructor(data) {
        this.name = data.name;
        this.type = data.type;
        this.power = data.power ?? 0;
        this.accuracy = data.accuracy ?? 100;
        this.pp = data.pp ?? 10;
        this.maxPP = data.maxPP ?? 10;
        this.category = data.category ?? 'physical';
        this.status = data.status ?? null;
        this.priority = data.priority ?? 0;
        this.effectChance = data.effectChance ?? null;
    }
}
//# sourceMappingURL=move.js.map