/**
 * バトルエンジン v2.0 - メイン エントリーポイント
 * 
 * 機能:
 * - Poke API連携モジュール（データ取得 + JSONキャッシュ）
 * - Section設計バトルエンジン（Game Freak記事準拠）
 * - Event System（特性、道具、天気のEvent Handler）
 * - Champions固有ルール（能力ポイント、Lv.50固定、メガシンカ）
 * - メタチームテンプレート
 * - 選出AI（アーキタイプ検出 + 最適選出）
 */

const { PokemonDataCache, PokemonAPI } = require('./api/pokemonAPI.js');
const { EventEmitter } = require('./engine/eventEmitter.js');
const { BattleEngine } = require('./engine/battleEngine.js');
const { Pokemon, Move, Ability, Item, Team, BattleField, BattleState } = require('./domain/models.js');
const { StatPointSystem, Level50System } = require('./rules/championsRules.js');
const { MegaEvolutionSystem } = require('./rules/megaEvolution.js');
const { SelectionAI } = require('./battle/selectionAI.js');
const { META_TEAMS } = require('./data/metaTeams.js');

// メインエクスポート
module.exports = {
  // API
  PokemonDataCache,
  PokemonAPI,
  
  // Engine
  EventEmitter,
  BattleEngine,
  
  // Domain
  Pokemon,
  Move,
  Ability,
  Item,
  Team,
  BattleField,
  BattleState,
  
  // Champions Rules
  StatPointSystem,
  Level50System,
  MegaEvolutionSystem,
  
  // AI
  SelectionAI,
  
  // Meta Data
  META_TEAMS
};

// Default export
module.exports.default = {
  PokemonDataCache,
  PokemonAPI,
  EventEmitter,
  BattleEngine,
  Pokemon,
  Move,
  Ability,
  Item,
  Team,
  BattleField,
  BattleState,
  StatPointSystem,
  Level50System,
  MegaEvolutionSystem,
  SelectionAI,
  META_TEAMS
};
EOF