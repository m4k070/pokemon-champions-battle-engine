import type { Pokemon } from '../../pokemon.js';
import type { BattleEngine } from '../../battle-engine.js';
import type { MoveData, StatStageKey } from '../../types.js';

export interface AbilitySwitchInContext {
  pokemon: Pokemon;
  engine: BattleEngine;
}

export interface AbilityTurnContext {
  pokemon: Pokemon;
  engine: BattleEngine;
}

export interface AbilitySwitchOutContext {
  pokemon: Pokemon;
  engine: BattleEngine;
}

// 被弾時（ダメージ適用前）。返り値があればその値が実ダメージになる
// （がんじょう・きあいのタスキ相当の軽減、ミラーアーマーの反射等で使う）。
export interface AbilityDamagedContext {
  defender: Pokemon;
  attacker: Pokemon;
  move: MoveData;
  damage: number;
  engine: BattleEngine;
}

export interface AbilityMoveUsedContext {
  attacker: Pokemon;
  defender: Pokemon;
  move: MoveData;
  engine: BattleEngine;
}

// 実数値・技威力の補正フック。value を受け取り補正後の値を返す。
export interface AbilityModifyValueContext {
  pokemon: Pokemon;
  move: MoveData;
  value: number;
  engine: BattleEngine;
}

export interface AbilityStatChangeContext {
  pokemon: Pokemon;
  stat: StatStageKey;
  delta: number;
  engine: BattleEngine;
}

// フックは特性ごとに発動タイミングが異なるため、必要なものだけ実装すればよい。
export interface AbilityDefinition {
  name: string;
  onSwitchIn?(context: AbilitySwitchInContext): void;
  // 場を離れるとき（通常交代・強制交代・pivot技による交代のいずれも呼ばれる）。
  onSwitchOut?(context: AbilitySwitchOutContext): void;
  // ターン終了時（かそくの素早さ上昇、さいせいりょくの回復は onSwitchOut 側）。
  onEndTurn?(context: AbilityTurnContext): void;
  // 被弾時（ダメージ適用前）。返り値は実ダメージとして上書きされる。
  onDamaged?(context: AbilityDamagedContext): number | void;
  // ダメージ技を命中させた後（追加効果より前。テクニシャン等は modifyMovePower 側）。
  onMoveUsed?(context: AbilityMoveUsedContext): void;
  // ぼうだん・ぼうおん等、特定の技そのものを無効化する特性。
  // trueを返すと命中判定より前に「効果がないようだ」で終わる。
  blocksMove?(move: MoveData): boolean;
  // 攻撃実数値の補正（ちからもち等）。
  modifyAttack?(context: AbilityModifyValueContext): number;
  // 防御実数値の補正（あついしぼう等）。
  modifyDefense?(context: AbilityModifyValueContext): number;
  // 技威力の補正（テクニシャン等）。
  modifyMovePower?(context: AbilityModifyValueContext): number;
  // 能力変化の方向・量の補正（あまのじゃく等。既存は Pokemon.modifyStatStage が担当）。
  // ここでは「相手の能力変化を無視する（てんねん）」等の判定に使う。
  ignoresOpponentStatChanges?(): boolean;
  // タイプ相性の補正（きもったま等）。効果倍率を上書きして返す。
  modifyTypeEffectiveness?(context: {
    attackType: import('../../types.js').TypeName;
    defenderTypes: import('../../types.js').TypeName[];
    effectiveness: number;
    engine: import('../../battle-engine.js').BattleEngine;
  }): number;
}
