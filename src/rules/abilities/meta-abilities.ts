import type { AbilityDefinition } from './types.js';
import type { MoveData } from '../../types.js';

// ============================================================
// 上位構築（pokesol.app M-4 トップ5）で使われる特性の実装。
// 効果が既知でエンジンのフックで表現できるものから順に追加する。
// データ出典: data/pokesol-m4-top5-summary.json（2026-08-18 収集）
// ============================================================

// てんねん: 相手の能力変化を無視して攻撃・防御を計算する。
export const UNAWARE: AbilityDefinition = {
  name: 'unaware',
  ignoresOpponentStatChanges: () => true,
};

// さいせいりょく: 場を離れるとき最大HPの1/3回復。
export const REGENERATOR: AbilityDefinition = {
  name: 'regenerator',
  onSwitchOut: ({ pokemon, engine }) => {
    const heal = Math.floor(pokemon.maxHP / 3);
    pokemon.heal(heal);
    engine.log.push(`${pokemon.name}はさいせいりょくで${heal}回復した`);
  },
};

// さめはだ: 接触技を受けたとき、攻撃者に最大HPの1/8ダメージ。
export const ROUGH_SKIN: AbilityDefinition = {
  name: 'rough-skin',
  onDamaged: ({ defender, attacker, move }) => {
    if (move.contact) {
      const damage = Math.floor(defender.maxHP / 8);
      attacker.takeDamage(Math.max(1, damage));
      // takeDamage は engine なしで呼ぶためログはこちらで出す。
    }
  },
};

// かそく: 毎ターン終了時に素早さが1段階上がる。
export const SPEED_BOOST: AbilityDefinition = {
  name: 'speed-boost',
  onEndTurn: ({ pokemon, engine }) => {
    const changed = pokemon.modifyStatStage('SPEED', 1);
    if (changed !== 0) {
      engine.log.push(`${pokemon.name}のかそくで素早さが上がった`);
    }
  },
};

// テクニシャン: 威力60以下の技の威力が1.5倍になる。
export const TECHNICIAN: AbilityDefinition = {
  name: 'technician',
  modifyMovePower: ({ value }) => (value <= 60 ? Math.floor(value * 1.5) : value),
};

// ちからもち: 攻撃の実数値が2倍になる。
export const HUGE_POWER: AbilityDefinition = {
  name: 'huge-power',
  modifyAttack: ({ value }) => value * 2,
};

// じきゅうりょく: 攻撃を受けるたびに防御が1段階上がる。
export const STAMINA: AbilityDefinition = {
  name: 'stamina',
  onDamaged: ({ defender, engine }) => {
    const changed = defender.modifyStatStage('DEF', 1);
    if (changed !== 0) {
      engine.log.push(`${defender.name}のじきゅうりょくで防御が上がった`);
    }
  },
};

// あついしぼう: ほのお・こおりタイプの技のダメージが半減する。
export const THICK_FAT: AbilityDefinition = {
  name: 'thick-fat',
  onDamaged: ({ move, damage }) => {
    if (move.type === 'fire' || move.type === 'ice') {
      return Math.floor(damage / 2);
    }
  },
};

// がんじょう: HP満タン時に一撃で倒されるダメージをHP1で耐える。
export const STURDY: AbilityDefinition = {
  name: 'sturdy',
  onDamaged: ({ defender, damage }) => {
    if (defender.currentHP === defender.maxHP && damage >= defender.currentHP) {
      return defender.currentHP - 1;
    }
  },
};

// ふゆう: 地面タイプの技を無効化する。
export const LEVITATE: AbilityDefinition = {
  name: 'levitate',
  blocksMove: (move: MoveData) => move.type === 'ground',
};

// ノーガード: 互いの技が必中になる（命中判定は battle-engine 側で直接参照）。
export const NO_GUARD: AbilityDefinition = {
  name: 'no-guard',
};

// シェルアーマー: 急所に当たらない（エンジンに急所判定が無いため現状は定義のみ）。
export const SHELL_ARMOR: AbilityDefinition = {
  name: 'shell-armor',
};

// ふみん: ねむりにならない。
export const INSOMNIA: AbilityDefinition = {
  name: 'insomnia',
};

// シンクロ: 相手の状態異常を跳ね返す（現状は定義のみ。状態異常付与処理への組み込みは未実装）。
export const SYNCHRONIZE: AbilityDefinition = {
  name: 'synchronize',
};

export const META_ABILITIES: AbilityDefinition[] = [
  UNAWARE,
  REGENERATOR,
  ROUGH_SKIN,
  SPEED_BOOST,
  TECHNICIAN,
  HUGE_POWER,
  STAMINA,
  THICK_FAT,
  STURDY,
  LEVITATE,
  NO_GUARD,
  SHELL_ARMOR,
  INSOMNIA,
  SYNCHRONIZE,
];
