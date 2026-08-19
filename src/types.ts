export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type MoveCategory = 'physical' | 'special' | 'status';

export type StatusCondition = 'sleep' | 'poison' | 'burn' | 'paralysis' | 'freeze' | 'badly-poisoned';

export type WeatherType = 'sand' | 'rain' | 'sun' | 'hail';

export type StatKey = 'HP' | 'ATK' | 'DEF' | 'SPATK' | 'SPDEF' | 'SPEED';

export type BaseStats = Record<StatKey, number>;
export type Stats = Record<StatKey, number>;

// 能力ランクの対象はHPを除く5ステータス（-6〜+6）。
export type StatStageKey = Exclude<StatKey, 'HP'>;
export type StatStages = Record<StatStageKey, number>;

// 天候・フィールドではなく「陣営の場」に対して発動する効果技（おいかぜ・リフレクター）と、
// 盤面全体に対して発動する効果技（トリックルーム）。
// ハザード（ステルスロック・まきびし・どくびし）もここに含める。
// ひけんちえなみは「まきびしを設置する追加効果を持つ技」のため fieldEffect には含めない。
export type FieldEffect =
  | 'tailwind' | 'trick-room' | 'reflect'
  | 'stealth-rock' | 'spikes' | 'toxic-spikes';

// ダメージ技に追加効果として付随する状態異常（例: れいとうパンチの10%こおり）。
// status(ダメージ0の状態異常専用技)とは別概念のため独立したフィールドとして持つ。
export interface SecondaryStatusEffect {
  status: StatusCondition;
  chance: number; // 0-100（%）
}

// 技の使用者自身に能力ランク変化を与える（つるぎのまい・りゅうのまい等）。
// リーフストームのように威力を持つ技に付随することもある。
export interface SelfStatChange {
  stat: StatStageKey;
  delta: number;
}

// 命中した相手に能力ランク変化を与える（バークアウトの特攻ダウン等）。
// chance未満の乱数なら発動しない（バークアウト等は確定=100を指定する）。
export interface TargetStatChange {
  stat: StatStageKey;
  delta: number;
  chance: number; // 0-100（%）
}

export interface MoveData {
  name: string;
  type: TypeName;
  power: number;
  accuracy: number;
  pp: number;
  maxPP: number;
  category: MoveCategory;
  status: StatusCondition | null;
  priority: number;
  effectChance: number | null;
  fieldEffect?: FieldEffect | null;
  secondaryEffect?: SecondaryStatusEffect | null;
  selfStatChange?: SelfStatChange[] | null;
  targetStatChange?: TargetStatChange[] | null;
  // やどりぎのタネ: 命中した相手に「毎ターンHPを吸われる」状態を付与する（くさタイプは無効）。
  inflictsSeed?: boolean;
  // あさのひざし・こうごうせい・つきのひかり等、天候に応じて回復量が変化する自己回復技。
  // 天候なし=50%、はれ=2/3、それ以外の天候=25%（本編仕様）。
  weatherHeal?: boolean;
  // ロックブラスト等、通常配分（2発37.5%/3発37.5%/4発12.5%/5発12.5%）の多段技。
  multiHit?: boolean;
  // とんぼがえり・ボルトチェンジ・クイックターン等、攻撃後に使用者が自動で交代する技。
  pivot?: boolean;
  // 接触技（さめはだ・ゴツゴツメット・さまようたましい等の接触判定に使う）。
  // 物理技のほとんどは接触だが、いわゆる「非接触の物理技」（じしん・ストーンエッジ等）は false。
  contact?: boolean;
  // キングシールド等、使用するとバトルスイッチ持ち（ギルガルド）がシールドフォルムに戻る技。
  restoresShieldForm?: boolean;
  // ひけんちえなみ等、使用時に「まきびし」を相手側に設置する追加効果を持つ技。
  inflictsSpikes?: boolean;
}

export type TypeChart = Record<TypeName, Partial<Record<TypeName, number>>>;

export type BattleEventName =
  | 'switch-in'
  | 'end-turn'
  | 'calculate-attack'
  | 'calculate-defense'
  | 'apply-modifiers'
  | 'apply-damage'
  | 'before-move'
  | 'after-move';

export interface EventData {
  [key: string]: unknown;
}

export type EventHandler = (data: EventData) => void;

export interface MoveAction {
  type: 'move';
  moveIndex: number;
  target: number;
  // メガシンカは技の選択に添えて宣言する（交代・降参とは同時にできないため）。
  megaEvolve?: boolean;
}

export interface SwitchAction {
  type: 'switch';
  pokemonIndex: number;
}

export interface ForfeitAction {
  type: 'forfeit';
}

export type AgentAction = MoveAction | SwitchAction | ForfeitAction;
