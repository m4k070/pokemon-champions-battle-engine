import { EventEmitter } from './event-emitter.js';
import { TYPE_CHART } from './type-chart.js';
import { BattleField } from './battle-field.js';
export class BattleEngine {
    events;
    weather;
    weatherTurnsLeft;
    trickRoom;
    trickRoomTurnsLeft;
    turn;
    log;
    typeChart;
    field;
    activePokemon0 = null;
    activePokemon1 = null;
    constructor() {
        this.events = new EventEmitter();
        this.weather = null;
        this.weatherTurnsLeft = 0;
        this.trickRoom = false;
        this.trickRoomTurnsLeft = 0;
        this.turn = 0;
        this.log = [];
        this.typeChart = TYPE_CHART;
        this.field = new BattleField();
        this.setupEventHandlers();
    }
    sideKey(side) {
        return side === 0 ? 'playerA' : 'playerB';
    }
    setStealthRock(side) {
        this.field.stealthRock[this.sideKey(side)] = true;
        this.log.push(`${side === 0 ? 'プレイヤーA' : 'プレイヤーB'}側の場にステルスロックが設置された`);
    }
    setActivePokemon(side, pokemon) {
        if (side === 0) {
            this.activePokemon0 = pokemon;
        }
        else {
            this.activePokemon1 = pokemon;
        }
    }
    getOpponent(pokemon) {
        if (this.activePokemon0 === pokemon)
            return this.activePokemon1;
        if (this.activePokemon1 === pokemon)
            return this.activePokemon0;
        return null;
    }
    setupEventHandlers() {
        this.events.on('switch-in', (data) => {
            const pokemon = data.pokemon;
            if (!pokemon || typeof pokemon !== 'object')
                return;
            const p = pokemon;
            if (p.ability === 'sand-stream' && this.weather !== 'sand') {
                this.weather = 'sand';
                this.weatherTurnsLeft = 5;
                this.log.push(`${p.name}の特性「すなおこし」により砂嵐が発生した`);
            }
            if (p.ability === 'intimidate') {
                const opponent = this.getOpponent(p);
                if (opponent && !opponent.isFainted) {
                    opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
                    this.log.push(`${p.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
                }
            }
        });
        this.events.on('end-turn', (data) => {
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
                    this.log.push(`${p.name}はたべのこしで${heal}回復した`);
                }
                if (p.item === 'life-orb') {
                    const damage = Math.floor(p.maxHP / 10);
                    p.takeDamage(damage, this);
                    this.log.push(`${p.name}はいのちのたまの反動で${damage}のダメージを受けた`);
                }
                if (p.item === 'sitrus-berry' && !p.itemUsed) {
                    if (p.currentHP <= p.maxHP / 2) {
                        const heal = Math.floor(p.maxHP / 4);
                        p.heal(heal);
                        p.itemUsed = true;
                        this.log.push(`${p.name}はオボンのみで${heal}回復した`);
                    }
                }
            }
        });
        this.events.on('apply-damage', (data) => {
            const defender = data.defender;
            if (!defender || typeof defender !== 'object')
                return;
            const d = defender;
            const damage = data.damage;
            if (d.item === 'focus-sash' && !d.itemUsed && d.currentHP === d.maxHP && damage >= d.currentHP) {
                data.damage = d.currentHP - 1;
                d.itemUsed = true;
                this.log.push(`${d.name}はきあいのタスキで耐えた！`);
            }
        });
    }
    calculateAttack(attacker, move) {
        let attack = move.category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;
        if (attacker.status === 'burn' && move.category === 'physical') {
            attack = Math.floor(attack / 2);
        }
        this.events.emit('calculate-attack', { attacker, move, attack });
        return attack;
    }
    calculateDefense(defender, move) {
        const defense = move.category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;
        this.events.emit('calculate-defense', { defender, move, defense });
        return defense;
    }
    calculateBaseDamage(attack, defense, move) {
        if (move.power === 0)
            return 0;
        let power = move.power;
        // STAB - check from the move's type, not attacker types here
        // (attacker type check handled in useMove)
        if (this.weather === 'rain' && move.type === 'water') {
            power *= 1.5;
        }
        else if (this.weather === 'sun' && move.type === 'fire') {
            power *= 1.5;
        }
        else if (this.weather === 'rain' && move.type === 'fire') {
            power *= 0.5;
        }
        else if (this.weather === 'sun' && move.type === 'water') {
            power *= 0.5;
        }
        return Math.floor(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2;
    }
    getTypeEffectiveness(attackType, defenderTypes) {
        let effectiveness = 1.0;
        for (const type of defenderTypes) {
            const chart = this.typeChart[attackType];
            if (chart) {
                effectiveness *= chart[type] !== undefined ? chart[type] : 1.0;
            }
        }
        return effectiveness;
    }
    applyModifiers(baseDamage, attacker, defender, move) {
        const effectiveness = this.getTypeEffectiveness(move.type, defender.types);
        const finalDamage = Math.floor(baseDamage * effectiveness);
        this.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });
        return { finalDamage, effectiveness };
    }
    applyDamage(defender, damage) {
        this.events.emit('apply-damage', { defender, damage, engine: this });
        defender.takeDamage(damage, this);
    }
    useMove(attacker, defender, move) {
        if (move.pp <= 0) {
            this.log.push(`${attacker.name}は${move.name}を出そうとしたが、PPが残っていない！`);
            return { success: false };
        }
        move.pp -= 1;
        this.log.push(`${attacker.name}の${move.name}`);
        if (move.accuracy < 100) {
            if (Math.random() * 100 > move.accuracy) {
                this.log.push('技は外れた');
                return { success: false };
            }
        }
        if (move.status) {
            const applied = defender.applyStatus(move.status);
            if (applied) {
                this.log.push(`${defender.name}は${move.status}状態になった`);
            }
            else {
                this.log.push('効果がない');
            }
            return { success: true, status: move.status };
        }
        let power = move.power;
        if (attacker.types && attacker.types.includes(move.type)) {
            power *= 1.5;
        }
        if (attacker.item === 'life-orb') {
            power *= 1.3;
        }
        const moveWithStab = { ...move, power };
        const attack = this.calculateAttack(attacker, moveWithStab);
        const defense = this.calculateDefense(defender, moveWithStab);
        const baseDamage = this.calculateBaseDamage(attack, defense, moveWithStab);
        const { finalDamage, effectiveness } = this.applyModifiers(baseDamage, attacker, defender, moveWithStab);
        this.applyDamage(defender, finalDamage);
        if (effectiveness > 1) {
            this.log.push('効果は抜群だ！');
        }
        else if (effectiveness < 1 && effectiveness > 0) {
            this.log.push('効果はいまひとつのようだ');
        }
        else if (effectiveness === 0) {
            this.log.push('効果がなかった');
        }
        this.log.push(`${defender.name}に${finalDamage}のダメージ`);
        if (defender.isFainted) {
            this.log.push(`${defender.name}は戦闘不能になった`);
        }
        return { success: true, damage: finalDamage, effectiveness };
    }
    startTurn() {
        this.turn++;
        this.log.push(`\n===== ターン${this.turn}開始 =====`);
        if (this.weatherTurnsLeft > 0) {
            this.weatherTurnsLeft--;
            if (this.weatherTurnsLeft === 0) {
                this.log.push(`天候「${this.weather}」が終了しました`);
                this.weather = null;
            }
        }
        if (this.trickRoomTurnsLeft > 0) {
            this.trickRoomTurnsLeft--;
            if (this.trickRoomTurnsLeft === 0) {
                this.log.push('トリックルームが終了しました');
                this.trickRoom = false;
            }
        }
    }
    endTurn(teamA, teamB) {
        this.applyStatusEffects(teamA);
        this.applyStatusEffects(teamB);
        this.applyWeatherDamage([...teamA, ...teamB]);
        this.events.emit('end-turn', { team: [...teamA, ...teamB], engine: this });
    }
    applyWeatherDamage(team) {
        if (this.weather !== 'sand' && this.weather !== 'hail')
            return;
        for (const pokemon of team) {
            if (pokemon.isFainted)
                continue;
            const isImmune = this.weather === 'sand'
                ? pokemon.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel')
                : pokemon.types.includes('ice');
            if (isImmune)
                continue;
            const damage = Math.floor(pokemon.maxHP / 16);
            pokemon.takeDamage(damage, this);
            const weatherName = this.weather === 'sand' ? '砂嵐' : 'あられ';
            this.log.push(`${pokemon.name}は${weatherName}のダメージで${damage}のダメージを受けた`);
        }
    }
    applyStatusEffects(team) {
        for (const pokemon of team) {
            if (pokemon.isFainted)
                continue;
            if (pokemon.status === 'burn') {
                const damage = Math.floor(pokemon.maxHP / 16);
                pokemon.takeDamage(damage, this);
                this.log.push(`${pokemon.name}は火傷ダメージで${damage}のダメージを受けた`);
            }
            else if (pokemon.status === 'poison') {
                const damage = Math.floor(pokemon.maxHP / 8);
                pokemon.takeDamage(damage, this);
                this.log.push(`${pokemon.name}は毒ダメージで${damage}のダメージを受けた`);
            }
            else if (pokemon.status === 'sleep') {
                pokemon.statusTurnsLeft--;
                if (pokemon.statusTurnsLeft <= 0) {
                    pokemon.removeStatus();
                    this.log.push(`${pokemon.name}は眠りから覚めた`);
                }
                else {
                    this.log.push(`${pokemon.name}は眠り続けている（残り${pokemon.statusTurnsLeft}ターン）`);
                }
            }
        }
    }
    switchIn(pokemon, team, side) {
        this.log.push(`${pokemon.name}が場に出た！`);
        this.events.emit('switch-in', { pokemon, team, engine: this });
        if (side !== undefined && !pokemon.isFainted && this.field.stealthRock[this.sideKey(side)]) {
            const effectiveness = this.getTypeEffectiveness('rock', pokemon.types);
            if (effectiveness > 0) {
                const damage = Math.floor((pokemon.maxHP / 8) * effectiveness);
                pokemon.takeDamage(damage, this);
                this.log.push(`${pokemon.name}はステルスロックのダメージで${damage}のダメージを受けた`);
            }
        }
        return pokemon;
    }
    calculateSpeed(pokemon) {
        let speed = pokemon.stats.SPEED;
        if (pokemon.item === 'choice-scarf') {
            speed = Math.floor(speed * 1.5);
        }
        if (pokemon.status === 'paralysis') {
            speed = Math.floor(speed / 2);
        }
        return this.trickRoom ? -speed : speed;
    }
    getLog() {
        return this.log.join('\n');
    }
}
//# sourceMappingURL=battle-engine.js.map