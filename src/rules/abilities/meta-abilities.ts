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

// バトルスイッチ: 攻撃技を使うとブレードフォルムになる。
// シールドフォルムへの復帰はキングシールド使用時（restoresShieldForm 技）に
// battle-engine 側で行う。フォルム別の種族値は Pokemon.formStats 側で指定する。
export const BATTLE_SWITCH: AbilityDefinition = {
  name: 'battle-switch',
  onMoveUsed: ({ attacker, engine }) => {
    if (attacker.form !== 'blade') {
      attacker.setForm('blade');
      engine.log.push(`${attacker.name}はブレードフォルムになった`);
    }
  },
};

// ミラーアーマー: 相手から受ける能力低下をその相手に反射する。
// 反射処理は battle-engine の applyTargetStatChange 側で name 判定して行う。
export const MIRROR_ARMOR: AbilityDefinition = {
  name: 'mirror-armor',
};

// かげふみ: 相手の交代を阻止する（ゴーストタイプは無効、瀕死交代・pivot交代は防げない）。
// 判定は battle-runner の通常交代処理側で name 判定して行う。
export const SHADOW_TAG: AbilityDefinition = {
  name: 'shadow-tag',
};

// ピンチ時1.5倍特性（げきりゅう/しんりょく/もうか）: HPが1/3以下のとき、
// 対応タイプの技の威力が1.5倍になる。
// 対応タイプは name から引けるように PINCH_TYPE_MAP を export する。
export const PINCH_TYPE_MAP: Record<string, MoveData['type']> = {
  'torrent': 'water',
  'overgrow': 'grass',
  'blaze': 'fire',
};

const makePinchAbility = (name: string, type: MoveData['type']): AbilityDefinition => ({
  name,
  modifyMovePower: ({ pokemon, move, value }) => {
    if (pokemon.currentHP <= Math.floor(pokemon.maxHP / 3) && move.type === type) {
      return Math.floor(value * 1.5);
    }
    return value;
  },
});

export const TORRENT: AbilityDefinition = makePinchAbility('torrent', 'water');
export const OVERGROW: AbilityDefinition = makePinchAbility('overgrow', 'grass');
export const BLAZE: AbilityDefinition = makePinchAbility('blaze', 'fire');

// マジシャン: 攻撃技を命中させた相手の持ち物を奪う（自分の持ち物が空のときのみ）。
export const MAGICIAN: AbilityDefinition = {
  name: 'magician',
  onMoveUsed: ({ attacker, defender, engine }) => {
    if (attacker.item === null && defender.item !== null) {
      const stolen = defender.item;
      attacker.item = defender.item;
      defender.item = null;
      engine.log.push(`${attacker.name}はマジシャンで${stolen}を奪った`);
    }
  },
};

// せいしんりょく: ひるまない（エンジンにひるみ機構が無いため現状は定義のみ）。
export const INNER_FOCUS: AbilityDefinition = {
  name: 'inner-focus',
};

// とびだすハバネロ: 攻撃技でダメージを受けたとき、攻撃者をやけどにする（100%）。
// フレイムボディ(ほのおのからだ)と違い、特殊技でも発動する。
// やけど状態の相手・ほのおタイプの相手には発動しない。
export const SPICY_SPRAY: AbilityDefinition = {
  name: 'spicy-spray',
  onDamaged: ({ defender, attacker, move }) => {
    if (move.category === 'status') return;
    if (attacker.status) return;
    if (attacker.types.includes('fire')) return;
    attacker.applyStatus('burn');
  },
};

// エレキメイカー: 入場時にエレキフィールドを展開する（5ターン）。
// でん技の威力が1.3倍になる効果は battle-engine 側で field.terrain を参照して実装する。
export const ELECTRIC_SURGE: AbilityDefinition = {
  name: 'electric-surge',
  onSwitchIn: ({ pokemon, engine }) => {
    if (engine.field.terrain === 'electric-terrain') return;
    engine.field.terrain = 'electric-terrain';
    engine.field.terrainTurnsLeft = 5;
    engine.log.push(`${pokemon.name}のエレキメイカーでエレキフィールドが発動した！`);
  },
  modifyMovePower: ({ move, value, engine }) => {
    if (move.type === 'electric' && engine.field.terrain === 'electric-terrain') {
      return Math.floor(value * 1.3);
    }
    return value;
  },
};

// すいすい: 雨のとき素早さが2倍になる（速度計算は battle-engine の calculateSpeed 側で判定）。
export const SWIFT_SWIM: AbilityDefinition = {
  name: 'swift-swim',
};

// おやこあい: 攻撃技が2回ヒットする（2回目は威力1/4）。
// ヒット処理は battle-engine の攻撃ループ側で name 判定して行う。
export const PARENTAL_BOND: AbilityDefinition = {
  name: 'parental-bond',
};

// マルチスケイル: HP満タン時に受けるダメージが半減する。
export const MULTISCALE: AbilityDefinition = {
  name: 'multiscale',
  onDamaged: ({ defender, damage }) => {
    if (defender.currentHP >= defender.maxHP) {
      return Math.floor(damage / 2);
    }
  },
};

// へんげんじざい: 技を使うと、その技のタイプに変わる（単一タイプになる）。
// メガシンカでタイプが typeChange にリセットされた場合も、次の技使用で再発動する
// （メガシンカは実質的な場への再登場のため、タイプ変化もやり直される）。
export const PROTEAN: AbilityDefinition = {
  name: 'protean',
  onMoveUsed: ({ attacker, move, engine }) => {
    if (attacker.types.length === 1 && attacker.types[0] === move.type) return; // 既に技タイプなら変化しない
    attacker.types = [move.type];
    engine.log.push(`${attacker.name}は${move.type}タイプになった`);
  },
};

// つめかえなし: 接触技の威力が1.3倍になる。
export const TOUGH_CLAWS: AbilityDefinition = {
  name: 'tough-claws',
  modifyMovePower: ({ move, value }) => (move.contact ? Math.floor(value * 1.3) : value),
};

// すなふぶき: すなあらし中、いわ・じめん・はがねタイプの技の威力が1.3倍になる。
export const SAND_FORCE: AbilityDefinition = {
  name: 'sand-force',
  modifyMovePower: ({ move, value, engine }) => {
    if (engine.weather === 'sand' && (move.type === 'rock' || move.type === 'ground' || move.type === 'steel')) {
      return Math.floor(value * 1.3);
    }
    return value;
  },
};

// ひらいしん: でん技をかわりに受け、特攻を1段階上げる。
// blocksMove ででん技を無効化すると onDamaged は呼ばれないため、
// SpAtk上昇も blocksMove 内で直接行う。
export const LIGHTNING_ROD: AbilityDefinition = {
  name: 'lightning-rod',
  blocksMove: (move: MoveData) => move.type === 'electric',
  // onDamaged は blocksMove=true の場合呼ばれないため、
  // SpAtk上昇は engine 側で wiring する代わりに、
  // blocksMove の結果を受けた側の useMove 内で SpAtk+1 を適用する必要がある。
  // 簡易化: blocksMove は boolean のみ返すため、SpAtk上昇は別途 wiring する。
};

// くだけるよろい: 物理技でダメージを受けたとき、防御が1段階下がり、素早さが2段階上がる。
export const WEAK_ARMOR: AbilityDefinition = {
  name: 'weak-armor',
  onDamaged: ({ defender, move, engine }) => {
    if (move.category === 'physical') {
      defender.modifyStatStage('DEF', -1);
      defender.modifyStatStage('SPEED', 2);
      engine.log.push(`${defender.name}のくだけるよろいで防御が下がり、素早さが上がった`);
    }
  },
};

// きもったま: Normal/Fightingタイプの技がゴーストタイプにも有効になる。
// メガミミロップの特性。
export const SCRAPPY: AbilityDefinition = {
  name: 'scrappy',
  modifyTypeEffectiveness: ({ attackType, defenderTypes, effectiveness }) => {
    if (effectiveness === 0 && defenderTypes.includes('ghost')) {
      if (attackType === 'normal' || attackType === 'fighting') {
        return 1.0;
      }
    }
    return effectiveness;
  },
};

// どくげしょう: 物理技でダメージを受けたとき、攻撃者の場にどくびしを設置する。
// 本編の「接触技で30%毒付与」とは異なる、Champions 独自仕様。
export const POISON_POINT: AbilityDefinition = {
  name: 'poison-point',
  onDamaged: ({ defender, attacker, move, engine }) => {
    if (move.category !== 'physical') return;
    // 攻撃者のサイドにどくびしを設置
    const attackerSide = engine.getSide(attacker);
    if (attackerSide === null) return;
    const key = attackerSide === 0 ? 'playerA' : 'playerB';
    if (engine.field.toxicSpikes[key] >= 2) return; // 最大2層
    engine.field.toxicSpikes[key]++;
    engine.log.push(`${defender.name}のどくげしょうで${attacker.name}側の場にどくびしが設置された`);
  },
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
  BATTLE_SWITCH,
  MIRROR_ARMOR,
  SHADOW_TAG,
  TORRENT,
  OVERGROW,
  BLAZE,
  MAGICIAN,
  INNER_FOCUS,
  SPICY_SPRAY,
  ELECTRIC_SURGE,
  SWIFT_SWIM,
  PARENTAL_BOND,
  MULTISCALE,
  PROTEAN,
  TOUGH_CLAWS,
  SAND_FORCE,
  LIGHTNING_ROD,
  WEAK_ARMOR,
  SCRAPPY,
  POISON_POINT,
];
