import type { AbilityDefinition } from './types.js';
import type { MoveData } from '../../types.js';

// ぼうだんが無効化する「たま・ばくだん系」の技。
// 技データはPokeAPI由来のkebab-case英名で流れてくるため、名前で判定する。
const BALL_AND_BOMB_MOVES: ReadonlySet<string> = new Set([
  'acid-spray',
  'aura-sphere',
  'barrage',
  'beak-blast',
  'bullet-seed',
  'egg-bomb',
  'electro-ball',
  'energy-ball',
  'focus-blast',
  'gyro-ball',
  'ice-ball',
  'magnet-bomb',
  'mist-ball',
  'mud-bomb',
  'octazooka',
  'pollen-puff',
  'pyro-ball',
  'rock-blast',
  'rock-wrecker',
  'searing-shot',
  'seed-bomb',
  'shadow-ball',
  'sludge-bomb',
  'syrup-bomb',
  'weather-ball',
  'zap-cannon',
]);

export function isBallOrBombMove(move: MoveData): boolean {
  return BALL_AND_BOMB_MOVES.has(move.name);
}

// ぼうだん: たま・ばくだん系の技を完全に無効化する。
// メガライチュウのきあいだま/でんじほう等を封殺できるため、環境上の価値が高い。
export const BULLETPROOF: AbilityDefinition = {
  name: 'bulletproof',
  blocksMove(move: MoveData): boolean {
    return isBallOrBombMove(move);
  },
};
