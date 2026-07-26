/**
 * Domain models - Domain層のモデル一括エクスポート
 */

const { Pokemon } = require('./pokemon.js');
const { Move, Ability, Item, Team, BattleField, BattleState } = require('./other.js');

module.exports = {
  Pokemon,
  Move,
  Ability,
  Item,
  Team,
  BattleField,
  BattleState
};
EOF