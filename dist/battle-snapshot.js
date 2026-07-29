import { BattleEngine } from './battle-engine.js';
import { Pokemon } from './pokemon.js';
export function snapshotPokemon(pokemon) {
    return {
        name: pokemon.name,
        baseName: pokemon.baseName,
        types: [...pokemon.types],
        ability: pokemon.ability,
        item: pokemon.item,
        itemUsed: pokemon.itemUsed,
        lockedMove: pokemon.lockedMove,
        baseStats: { ...pokemon.baseStats },
        stats: { ...pokemon.stats },
        moves: pokemon.moves.map((move) => ({ ...move })),
        currentHP: pokemon.currentHP,
        status: pokemon.status,
        statusTurnsLeft: pokemon.statusTurnsLeft,
        isMega: pokemon.isMega,
    };
}
export function restorePokemon(snapshot) {
    return new Pokemon({
        name: snapshot.name,
        baseName: snapshot.baseName,
        types: [...snapshot.types],
        ability: snapshot.ability,
        item: snapshot.item,
        itemUsed: snapshot.itemUsed,
        lockedMove: snapshot.lockedMove,
        baseStats: { ...snapshot.baseStats },
        stats: { ...snapshot.stats },
        moves: snapshot.moves.map((move) => ({ ...move })),
        currentHP: snapshot.currentHP,
        status: snapshot.status,
        statusTurnsLeft: snapshot.statusTurnsLeft,
        isMega: snapshot.isMega,
    });
}
function snapshotField(field) {
    return {
        stealthRock: { ...field.stealthRock },
        spikes: { ...field.spikes },
        toxicSpikes: { ...field.toxicSpikes },
        stickyWeb: { ...field.stickyWeb },
        auroraVeil: { ...field.auroraVeil },
        reflect: { ...field.reflect },
        lightScreen: { ...field.lightScreen },
        tailwind: { ...field.tailwind },
    };
}
function restoreField(field, snapshot) {
    field.stealthRock = { ...snapshot.stealthRock };
    field.spikes = { ...snapshot.spikes };
    field.toxicSpikes = { ...snapshot.toxicSpikes };
    field.stickyWeb = { ...snapshot.stickyWeb };
    field.auroraVeil = { ...snapshot.auroraVeil };
    field.reflect = { ...snapshot.reflect };
    field.lightScreen = { ...snapshot.lightScreen };
    field.tailwind = { ...snapshot.tailwind };
}
export function snapshotBattle(engine, teamA, teamB, activeA, activeB) {
    return {
        turn: engine.turn,
        weather: engine.weather,
        weatherTurnsLeft: engine.weatherTurnsLeft,
        trickRoom: engine.trickRoom,
        trickRoomTurnsLeft: engine.trickRoomTurnsLeft,
        log: [...engine.log],
        field: snapshotField(engine.field),
        teamA: teamA.map(snapshotPokemon),
        teamB: teamB.map(snapshotPokemon),
        activeIndexA: teamA.indexOf(activeA),
        activeIndexB: teamB.indexOf(activeB),
    };
}
export function restoreBattle(snapshot) {
    const engine = new BattleEngine();
    engine.turn = snapshot.turn;
    engine.weather = snapshot.weather;
    engine.weatherTurnsLeft = snapshot.weatherTurnsLeft;
    engine.trickRoom = snapshot.trickRoom;
    engine.trickRoomTurnsLeft = snapshot.trickRoomTurnsLeft;
    engine.log = [...snapshot.log];
    restoreField(engine.field, snapshot.field);
    const teamA = snapshot.teamA.map(restorePokemon);
    const teamB = snapshot.teamB.map(restorePokemon);
    const activeA = teamA[snapshot.activeIndexA];
    const activeB = teamB[snapshot.activeIndexB];
    engine.setActivePokemon(0, activeA);
    engine.setActivePokemon(1, activeB);
    return { engine, teamA, teamB, activeA, activeB };
}
//# sourceMappingURL=battle-snapshot.js.map