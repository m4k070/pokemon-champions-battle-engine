import type { Pokemon } from '../../pokemon.js';
import type { BattleEngine } from '../../battle-engine.js';

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
}
