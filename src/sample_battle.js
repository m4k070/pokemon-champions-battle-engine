/**
 * サンプルバトル：妖竜 vs 状態異常撒きPT
 * 
 * このスクリプトは、バトルエンジンの動作を確認するためのサンプルです。
 */

const { Pokemon, BattleEngine } = require('./battle_engine.js');

// ポケモンデータの定義
const kabaldonData = {
  name: 'カバルドン',
  types: ['じめん'],
  ability: 'すなおこし',
  item: 'ゴツゴツメット',
  stats: { HP: 263, ATK: 135, DEF: 195, SPATK: 75, SPDEF: 135, SPEED: 65 },
  level: 50,
  moves: [
    { name: 'じしん', type: 'じめん', power: 100, accuracy: 100, pp: 10, maxPP: 10, category: 'physical' },
    { name: 'あくび', type: 'ノーマル', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status', status: 'sleep' },
    { name: 'こおりのキバ', type: 'こおり', power: 65, accuracy: 95, pp: 15, maxPP: 15, category: 'physical' },
    { name: 'まもる', type: 'ノーマル', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status' }
  ]
};

const windyData = {
  name: 'ウインディ',
  types: ['ほのお'],
  ability: 'いかく',
  item: 'オボンのみ',
  stats: { HP: 215, ATK: 145, DEF: 135, SPATK: 100, SPDEF: 135, SPEED: 95 },
  level: 50,
  moves: [
    { name: 'バークアウト', type: 'あく', power: 55, accuracy: 100, pp: 15, maxPP: 15, category: 'special' },
    { name: 'じだんだ', type: 'じめん', power: 75, accuracy: 100, pp: 10, maxPP: 10, category: 'physical' },
    { name: 'おにび', type: 'ほのお', power: 0, accuracy: 85, pp: 15, maxPP: 15, category: 'status', status: 'burn' },
    { name: 'あさのひざし', type: 'ノーマル', power: 0, accuracy: 100, pp: 5, maxPP: 5, category: 'status', heal: 0.5 }
  ]
};

const dragonData = {
  name: 'ドラパルト',
  types: ['ドラゴン', 'ゴースト'],
  ability: 'すりぬけ',
  item: 'いのちのたま',
  stats: { HP: 168, ATK: 175, DEF: 95, SPATK: 175, SPDEF: 95, SPEED: 213 },
  level: 50,
  moves: [
    { name: 'りゅうのはどう', type: 'ドラゴン', power: 85, accuracy: 100, pp: 10, maxPP: 10, category: 'special' },
    { name: 'たたりめ', type: 'ゴースト', power: 65, accuracy: 100, pp: 10, maxPP: 10, category: 'special' },
    { name: '10まんボルト', type: 'でんき', power: 90, accuracy: 100, pp: 15, maxPP: 15, category: 'special' },
    { name: 'かえんほうしゃ', type: 'ほのお', power: 90, accuracy: 100, pp: 15, maxPP: 15, category: 'special' }
  ]
};

// バトルエンジンの初期化
const engine = new BattleEngine();

// ポケモンの生成
const kabaldon = new Pokemon(kabaldonData);
const windy = new Pokemon(windyData);
const dragon = new Pokemon(dragonData);

// チームの定義
const teamA = [kabaldon]; // 妖竜の先発
const teamB = [windy, dragon]; // 状態異常撒きPT

// アクティブポケモン
let activeA = kabaldon;
let activeB = windy;

console.log('=== サンプルバトル開始 ===');
console.log(`Team A: ${teamA.map(p => p.name).join(', ')}`);
console.log(`Team B: ${teamB.map(p => p.name).join(', ')}`);
console.log();

// ターン1
engine.startTurn();

// 場に出す（特性発動）
activeA = engine.switchIn(activeA, teamA);
activeB = engine.switchIn(activeB, teamB);

// 行動速度を計算
const speedA = engine.calculateSpeed(activeA);
const speedB = engine.calculateSpeed(activeB);

// 速度判定
if (speedA > speedB) {
  console.log(`${activeA.name}が先に行動`);
  // カバルドンがまもるを選択（すなあらしは不要）
  engine.useMove(activeA, activeB, activeA.moves[3]); // まもる
  engine.useMove(activeB, activeA, activeB.moves[2]); // おにび
} else {
  console.log(`${activeB.name}が先に行動`);
  // ウインディがおにびを選択
  engine.useMove(activeB, activeA, activeB.moves[2]); // おにび
  engine.useMove(activeA, activeB, activeA.moves[3]); // まもる
}

engine.endTurn(teamA, teamB);

// ターン2
engine.startTurn();

// ウインディがドラパルトに交代
activeB = engine.switchIn(dragon, teamB);

// 速度判定
const speedA2 = engine.calculateSpeed(activeA);
const speedB2 = engine.calculateSpeed(activeB);

if (speedA2 > speedB2) {
  console.log(`${activeA.name}が先に行動`);
  engine.useMove(activeA, activeB, activeA.moves[0]); // じしん
  engine.useMove(activeB, activeA, activeB.moves[0]); // りゅうのはどう
} else {
  console.log(`${activeB.name}が先に行動`);
  engine.useMove(activeB, activeA, activeB.moves[0]); // りゅうのはどう
  engine.useMove(activeA, activeB, activeA.moves[0]); // じしん
}

engine.endTurn(teamA, teamB);

// バトルログを出力
console.log('\n' + '='.repeat(50));
console.log(engine.getLog());

