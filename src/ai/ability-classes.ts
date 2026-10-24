import type { AbilityName } from '../ability-names.js';

// 特性の「効果クラス」。37種を one-hot すると次元が増えすぎ、学習データも薄くなるため、
// 効果の種類に集約して特徴量にする（2026-10-24 の設計）。
// 1つの特性が複数クラスに属してよい（例: ようりょくそ＝天候利用＋素早さ）。
export type AbilityClass = 'weather' | 'denial' | 'stat' | 'contact' | 'recovery';

export const ABILITY_CLASSES: readonly AbilityClass[] = ['weather', 'denial', 'stat', 'contact', 'recovery'];

// 天候を起動する・天候で強化される・天候で回復する。
const WEATHER: readonly AbilityName[] = [
  'drizzle',
  'drought',
  'sand-stream',
  'snow-warning',
  'swift-swim',
  'chlorophyll',
  'sand-rush',
  'sand-force',
  'rain-dish',
  'sand-veil',
];

// 技の無効化・軽減（タイプ無効、一撃耐え、無効化フィールド等）。
const DENIAL: readonly AbilityName[] = [
  'bulletproof',
  'flash-fire',
  'volt-absorb',
  'lightning-rod',
  'levitate',
  'multiscale',
  'thick-fat',
  'wonder-guard',
  'magic-bounce',
  'mirror-armor',
  'magic-guard',
  'damp',
  'shell-armor',
  'disguise',
  'good-as-gold',
  'sturdy',
  'aura-guard',
];

// 能力ランク・能力値の操作（いかく、クリアボディ、あまのじゃく等）。
const STAT: readonly AbilityName[] = [
  'intimidate',
  'clear-body',
  'contrary',
  'defiant',
  'speed-boost',
  'weak-armor',
  'stamina',
  'moxie',
  'justified',
  'supreme-overlord',
  'unaware',
  'keen-eye',
  'adaptability',
  'huge-power',
  'technician',
  'tough-claws',
  'spicy-spray',
];

// 接触・被弾に反応する（さめはだ、どくげしょう、ほのおのからだ等）。
const CONTACT: readonly AbilityName[] = [
  'rough-skin',
  'poison-point',
  'poison-touch',
  'static',
  'cute-charm',
  'cursed-body',
  'spicy-spray',
  'synchronize',
  'toxic-debris',
  'thermal-exchange',
  'stamina',
];

// 退場・ターン終了時の回復（さいせいりょく、あめうけざら）。
const RECOVERY: readonly AbilityName[] = ['regenerator', 'rain-dish'];

const CLASS_TABLE: Record<AbilityClass, ReadonlySet<string>> = {
  weather: new Set(WEATHER),
  denial: new Set(DENIAL),
  stat: new Set(STAT),
  contact: new Set(CONTACT),
  recovery: new Set(RECOVERY),
};

// 特性名 → クラスのフラグ（0/1）。未知・'none' はすべて0。
export function abilityClassFlags(ability: AbilityName | string): Record<AbilityClass, number> {
  const flags = { weather: 0, denial: 0, stat: 0, contact: 0, recovery: 0 } as Record<AbilityClass, number>;
  for (const cls of ABILITY_CLASSES) {
    if (CLASS_TABLE[cls].has(ability as string)) flags[cls] = 1;
  }
  return flags;
}
