import { Pokemon } from './pokemon.js';
import { BattleEngine } from './battle-engine.js';
const kabaldonData = {
    name: 'カバルドン',
    types: ['ground'],
    ability: 'sand-stream',
    item: 'rocky-helmet',
    baseStats: { HP: 263, ATK: 135, DEF: 195, SPATK: 75, SPDEF: 135, SPEED: 65 },
    moves: [
        { name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, maxPP: 10, category: 'physical', status: null, priority: 0, effectChance: null },
        { name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status', status: 'sleep', priority: 0, effectChance: null },
        { name: 'こおりのキバ', type: 'ice', power: 65, accuracy: 95, pp: 15, maxPP: 15, category: 'physical', status: null, priority: 0, effectChance: null },
        { name: 'まもる', type: 'normal', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status', status: null, priority: 0, effectChance: null },
    ],
};
const windyData = {
    name: 'ウインディ',
    types: ['fire'],
    ability: 'intimidate',
    item: 'sitrus-berry',
    baseStats: { HP: 215, ATK: 145, DEF: 135, SPATK: 100, SPDEF: 135, SPEED: 95 },
    moves: [
        { name: 'バークアウト', type: 'dark', power: 55, accuracy: 100, pp: 15, maxPP: 15, category: 'special', status: null, priority: 0, effectChance: null },
        { name: 'じだんだ', type: 'ground', power: 75, accuracy: 100, pp: 10, maxPP: 10, category: 'physical', status: null, priority: 0, effectChance: null },
        { name: 'おにび', type: 'fire', power: 0, accuracy: 85, pp: 15, maxPP: 15, category: 'status', status: 'burn', priority: 0, effectChance: null },
        { name: 'あさのひざし', type: 'normal', power: 0, accuracy: 100, pp: 5, maxPP: 5, category: 'status', status: null, priority: 0, effectChance: null },
    ],
};
const dragonData = {
    name: 'ドラパルト',
    types: ['dragon', 'ghost'],
    ability: 'infiltrator',
    item: 'life-orb',
    baseStats: { HP: 168, ATK: 175, DEF: 95, SPATK: 175, SPDEF: 95, SPEED: 213 },
    moves: [
        { name: 'りゅうのはどう', type: 'dragon', power: 85, accuracy: 100, pp: 10, maxPP: 10, category: 'special', status: null, priority: 0, effectChance: null },
        { name: 'たたりめ', type: 'ghost', power: 65, accuracy: 100, pp: 10, maxPP: 10, category: 'special', status: null, priority: 0, effectChance: null },
        { name: '10まんボルト', type: 'electric', power: 90, accuracy: 100, pp: 15, maxPP: 15, category: 'special', status: null, priority: 0, effectChance: null },
        { name: 'かえんほうしゃ', type: 'fire', power: 90, accuracy: 100, pp: 15, maxPP: 15, category: 'special', status: null, priority: 0, effectChance: null },
    ],
};
export { kabaldonData, windyData, dragonData };
const engine = new BattleEngine();
const kabaldon = new Pokemon(kabaldonData);
const windy = new Pokemon(windyData);
const dragon = new Pokemon(dragonData);
const teamA = [kabaldon];
const teamB = [windy, dragon];
let activeA = kabaldon;
let activeB = windy;
console.log('=== サンプルバトル開始 ===');
console.log(`Team A: ${teamA.map(p => p.name).join(', ')}`);
console.log(`Team B: ${teamB.map(p => p.name).join(', ')}`);
console.log();
engine.setActivePokemon(0, activeA);
engine.setActivePokemon(1, activeB);
engine.startTurn();
activeA = engine.switchIn(activeA, teamA);
activeB = engine.switchIn(activeB, teamB);
const speedA = engine.calculateSpeed(activeA);
const speedB = engine.calculateSpeed(activeB);
if (speedA > speedB) {
    console.log(`${activeA.name}が先に行動`);
    engine.useMove(activeA, activeB, activeA.moves[3]);
    engine.useMove(activeB, activeA, activeB.moves[2]);
}
else {
    console.log(`${activeB.name}が先に行動`);
    engine.useMove(activeB, activeA, activeB.moves[2]);
    engine.useMove(activeA, activeB, activeA.moves[3]);
}
engine.endTurn(teamA, teamB);
engine.startTurn();
activeB = engine.switchIn(dragon, teamB);
engine.setActivePokemon(1, activeB);
const speedA2 = engine.calculateSpeed(activeA);
const speedB2 = engine.calculateSpeed(activeB);
if (speedA2 > speedB2) {
    console.log(`${activeA.name}が先に行動`);
    engine.useMove(activeA, activeB, activeA.moves[0]);
    engine.useMove(activeB, activeA, activeB.moves[0]);
}
else {
    console.log(`${activeB.name}が先に行動`);
    engine.useMove(activeB, activeA, activeB.moves[0]);
    engine.useMove(activeA, activeB, activeA.moves[0]);
}
engine.endTurn(teamA, teamB);
console.log('\n' + '='.repeat(50));
console.log(engine.getLog());
//# sourceMappingURL=sample-battle.js.map