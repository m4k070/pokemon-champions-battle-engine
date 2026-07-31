import type { Pokemon } from '../../pokemon.js';
import type { BattleEngine } from '../../battle-engine.js';
import type { MoveData } from '../../types.js';

export interface AbilitySwitchInContext {
  pokemon: Pokemon;
  engine: BattleEngine;
}

// フックは特性ごとに発動タイミングが異なるため、必要なものだけ実装すればよい。
// switch-in以外のタイミング(道具の効果を無効化するなど)が必要になったら、
// 対応するコンテキスト型とフックをここに追加していく。
export interface AbilityDefinition {
  name: string;
  onSwitchIn?(context: AbilitySwitchInContext): void;
  // ぼうだん・ぼうおん等、特定の技そのものを無効化する特性。
  // trueを返すと命中判定より前に「効果がないようだ」で終わる。
  blocksMove?(move: MoveData): boolean;
}
