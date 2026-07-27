export class Pokemon {
    name;
    types;
    ability;
    item;
    itemUsed;
    lockedMove;
    baseStats;
    stats;
    moves;
    currentHP;
    maxHP;
    status;
    statusTurnsLeft;
    isFainted;
    baseName;
    isMega;
    constructor(data) {
        this.name = data.name;
        this.types = data.types;
        this.ability = data.ability;
        this.item = data.item ?? null;
        this.itemUsed = data.itemUsed ?? false;
        this.lockedMove = data.lockedMove ?? null;
        this.baseStats = data.baseStats;
        this.moves = data.moves ?? [];
        this.status = data.status ?? null;
        this.statusTurnsLeft = data.statusTurnsLeft ?? 0;
        this.isFainted = false;
        this.baseName = data.baseName ?? data.name;
        this.isMega = data.isMega ?? false;
        if (data.stats) {
            this.stats = { ...data.stats };
        }
        else {
            this.stats = Pokemon.calculateStats(data.baseStats, data.level ?? 50);
        }
        this.maxHP = this.stats.HP;
        this.currentHP = data.currentHP ?? this.maxHP;
    }
    static calculateStats(baseStats, level) {
        return {
            HP: Math.floor(((baseStats.HP * 2 + 31) * level) / 100) + level + 10,
            ATK: Math.floor(((baseStats.ATK * 2 + 31) * level) / 100) + 5,
            DEF: Math.floor(((baseStats.DEF * 2 + 31) * level) / 100) + 5,
            SPATK: Math.floor(((baseStats.SPATK * 2 + 31) * level) / 100) + 5,
            SPDEF: Math.floor(((baseStats.SPDEF * 2 + 31) * level) / 100) + 5,
            SPEED: Math.floor(((baseStats.SPEED * 2 + 31) * level) / 100) + 5,
        };
    }
    takeDamage(damage, engine) {
        if (engine) {
            engine.events.emit('apply-damage', { defender: this, damage, engine });
        }
        this.currentHP = Math.max(0, this.currentHP - damage);
        if (this.currentHP === 0) {
            this.isFainted = true;
        }
    }
    heal(amount) {
        this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
    }
    applyStatus(status) {
        if (this.status)
            return false;
        this.status = status;
        if (status === 'sleep') {
            this.statusTurnsLeft = Math.floor(Math.random() * 3) + 1;
        }
        return true;
    }
    removeStatus() {
        this.status = null;
        this.statusTurnsLeft = 0;
    }
    canUseMove(moveIndex) {
        if (this.lockedMove !== null && this.lockedMove !== moveIndex) {
            return false;
        }
        return true;
    }
    lockMove(moveIndex) {
        if (this.item === 'choice-scarf' || this.item === 'choice-band' || this.item === 'choice-specs') {
            this.lockedMove = moveIndex;
        }
    }
    resetLockedMove() {
        this.lockedMove = null;
    }
}
//# sourceMappingURL=pokemon.js.map