# 実装済みアイテム一覧

`BattleEngine`が実際に効果を処理している持ち物の一覧。
判定は`Pokemon.item`の文字列（PokeAPI準拠のkebab-case英名）で行う。

## 実装済み

### 回復系
| 道具 | ID | 効果 | 実装箇所 |
|------|-----|------|---------|
| たべのこし | `leftovers` | 毎ターン終了時に最大HPの1/16回復 | `end-turn`ハンドラ |
| オボンのみ | `sitrus-berry` | HPが最大の1/2以下のとき最大HPの1/4回復（1回限り） | `end-turn`ハンドラ |

### 耐久系
| 道具 | ID | 効果 | 実装箇所 |
|------|-----|------|---------|
| きあいのタスキ | `focus-sash` | HP満タンから瀕死になる攻撃をHP1で耐える（1回限り） | `apply-damage`ハンドラ |

### 強化系
| 道具 | ID | 効果 | 実装箇所 |
|------|-----|------|---------|
| いのちのたま | `life-orb` | 技の威力1.3倍 / ダメージを与えたターンのみ最大HPの1/10の反動 | `useMove` + `end-turn`ハンドラ |
| こだわりスカーフ | `choice-scarf` | 素早さ1.5倍 + 技固定 | `calculateSpeed` + `Pokemon.lockMove` |
| こだわりハチマキ | `choice-band` | 物理技の威力1.5倍 + 技固定 | `useMove` + `Pokemon.lockMove` |
| こだわりメガネ | `choice-specs` | 特殊技の威力1.5倍 + 技固定 | `useMove` + `Pokemon.lockMove` |

#### こだわり系の技固定について
- 技を出した時点で固定される（命中しなかった場合・特性で無効化された場合も固定される）
- 場を離れると解除される（通常交代・強制交代・pivot技による交代のいずれも`BattleSession.switchTo()`を通る）
- 固定中は`getLegalActions()`が該当技のみを返すため、`RandomBattleAgent`・LLMエージェント双方が自動的に従う

### メガストーン
`MegaEvolutionSystem`が担当。`MEGA_STONE_SEEDS`の静的テーブル、または
`MegaEvolutionSystem.fromPokeApi(api)`でPokeAPIから取得する。
メガシンカは技の選択に添えて宣言する（`MoveAction.megaEvolve`）。

## ダメージ計算（乱数・急所）

| 項目 | 状態 | 実装箇所 |
|------|------|---------|
| 乱数（0.85〜1.00の16段階・ヒットごと） | 実装済み（2026-10-18 T0） | `BattleEngine.rollDamageFactor()` / `rollDamage()`（乱数列は注入済みの`rng`経由。seed固定で再現可） |
| 急所（1/24・1.5倍・壁と不利ランクを無視・最低1ダメージ） | 実装済み（2026-10-18 T0） | `BattleEngine.rollCriticalHit()` / `applyModifiers()` / `calculateAttack()` / `calculateDefense()`。テスト: `tests/damage-variance.test.ts` |
| 急所無効（シェルアーマー） | 実装済み | `AbilityDefinition.preventsCriticalHits` |
| 急所ランク（きょううん・するどいツメ・高急所技） | 未実装 | 出典: champions.pokewiki.net「ダメージ計算式」（ランク0=1/24、+1=1/8、+2=1/2、+3=1/1） |
| カブトアーマー | 未実装 | 特性名がレジストリ未登録のため |

## 技の効果（あくび・なまける）

| 技 | 効果 | 実装箇所 |
|------|------|---------|
| あくび | 相手を「ねむけ」にし、次のターンの終了時に「ねむり」にする。交代で解除。必ず命中 | `useMove`（`inflictsDrowsy`）→ `applyDrowsySleep`（`endTurn` から呼ぶ）→ `BattleRunner.switchTo` の `resetDrowsy`。テスト: `tests/status-state.test.ts` |
| なまける | 自分のHPを最大HPの1/2回復。HPが満タンなら効果なし（`no-effect` / `full-hp`） | `useMove`（`selfHealPercent`）。テスト: `tests/status-state.test.ts` |
| こわいかお | 相手のすばやさランクを2段階下げる（下限 -6） | `applyTargetStatChange`（`targetStatChange`）。テスト: `tests/stat-stages.test.ts` |
| てっぺき | 自分のぼうぎょランクを2段階上げる | `applySelfStatChange`（`selfStatChange`）。テスト: `tests/stat-stages.test.ts` |
| ボディプレス | ダメージ計算に「こうげき」ではなく「ぼうぎょ」とその能力ランクを使う。やけどでも半減しない | `calculateAttack`（`usesDefenseForAttack`）。テスト: `tests/stat-stages.test.ts` |
| かげうち | 優先度+1のゴースト物理技（解決順は既存の優先度ソートに載る） | `battle-runner` の優先度ソート。テスト: `tests/priority-and-encore.test.ts` |
| アンコール | 相手が直前に使った技を3ターン固定する（交代で解除。直前の技が無ければ失敗） | `useMove`（`inflictsEncore`）→ `Pokemon.applyEncore` / `canUseMove` / `startTurn` の期限解除。テスト: `tests/priority-and-encore.test.ts` |
| サイコフィールド | 5ターン（グランドコートで8ターン）フィールドを展開。接地している側のエスパー技を1.3倍、接地している相手への先制技を無効化 | `useMove`（`fieldEffect: 'psychic-terrain'`）+ `isGrounded` + 威力補正 + 先制技の無効化。テスト: `tests/terrain.test.ts` |
| ワイドフォース | サイコフィールド下で接地していれば威力1.5倍（フィールドの1.3倍も重なる） | `calculateAttack` 手前の威力補正（`boostedByPsychicTerrain`）。テスト: `tests/terrain.test.ts` |

### メガシンカ（Champions 独自）

| メガ | ストーン | タイプ / 特性 / 種族値 | テスト |
|------|---------|----------------------|--------|
| メガガブリアスZ | `garchompite-z` | ドラゴン単 / ふゆう / 108-130-85-141-85-151 | `tests/mega-evolution.test.ts` |

**注意**: 本編のメガガブリアス（`garchompite` → `mega-garchomp`・dragon/ground・すなのちから・S-10）とは別物。両方のテストで取り違えを防いでいる。

出典: yakkun.com（ポケモンチャンピオンズ図鑑）の技説明。

## 現環境PTカタログ（`src/data/meta-teams.ts`）

| 項目 | 内容 |
|------|------|
| エントリ | 12件 = 試作PT（カバルドン二軸デュアルメガ v1）＋ gamewith 最強パーティランキング Tier1〜3 の11構築 |
| 構築データ | `gamewith.jp/pokemon-champions/555537`（2026-10-19 取得）。6体・持ち物・特性・性格・能力ポイント・技・基本選出／代替選出 |
| 抽出データ | `data/gamewith-555537-2026-10-19.json`（ページDOMの `data-*` 属性から機械抽出） |
| 生成 | `scripts/fetch-pokeapi-catalog.mjs`（PokeAPI取得）→ `scripts/generate-meta-teams-catalog.mjs`（`src/data/meta-teams-catalog.ts` を生成） |
| 種族値・タイプ・技データ | PokeAPI（2026-10-19 取得）。技のタイプ/威力/命中/PP/分類/優先度/追加効果/自己・相手の能力変化 |
| 実数値の検算 | 全66体でページ記載の実数値とエンジンの計算式が一致。例外は メガラグラージ構築のラグラージ（ページ ぼうぎょ113 / 計算112。ポイント合計66の制約下では112が正しく、ページ側の記載ずれと判断） |
| pokedb 突き合わせ | ガブリアス（おくびょう H2 C32 S32・ガブリアスナイトZ = CS + h 23.7%）、ミミッキュ（いじっぱり H1 A32 B1 S32・いのちのたま = AS + hb 28.0%）、キラフロルの3件で、M-7 使用率1位の型・持ち物・能力ポイントと一致。実数値も両ソースと一致 |
| メガストーン | 未登録だった メガフラエッテ（`floettite`）・メガジュペッタ（`banettite`）・メガウツボット（`victreebelite`）を追加。種族値・タイプ・特性はページのメガ形態データから算出（合計+100を検証）。英語名が未公開のため `floettite` と特性 `tobidasu-nakami` は暫定キー |
| 検証 | `tests/meta-teams.test.ts`: 全12構築で `start_battle` → ミラー1試合を完走（seed固定）。メガストーン解決・能力ポイント上限・PP非共有も固定 |

**注意（ページの版差）**: 同じURLでも 2026-10-19 20:40 時点のページは **11構築**（メガガブリアスZ / メガグソクムシャ / カバマンダ / メガリザードンY / メガジュペッタ / メガカメックス / カイリューガルド / メガライチュウY / クエスピクシー / カバルカ / メガラグラージ）。以前の取得時（同日）の12構築とは顔ぶれが異なる。カタログは 20:40 時点のDOMを正としている。

**PPの複製**: `BattleEngine` は使用時に `move.pp -= 1` で技オブジェクトを書き換える。カタログの `moves` をそのまま渡すと、同じ構築のミラー対戦で左右が同じ技オブジェクトを共有してPPが二重に減り、試合が終わらなくなる。`toPokemon` は `cloneMove` で複製する（`tests/meta-teams.test.ts` で固定）。

## 未実装の特性・技の棚卸し（gamewith 11構築・2026-10-19）

カタログの全メンバーが使う特性・技を、エンジンの実装状況で分類したもの。探索で「どの構築がどこまで忠実に走るか」の判断材料。

### 特性（37種）

内訳: **実装あり 23種 / 名前だけ登録 14種**。名前だけの特性は `ability-names.ts` に登録済みで、`Pokemon` として生成できるが、バトル中の分岐は無い。

| 特性 | ID | 状態 | 使用構築数 | 枠 |
|---|---|---|---|---|
| げきりゅう | `torrent` | 実装あり | 5 | 5 |
| いかく | `intimidate` | 実装あり | 4 | 4 |
| さめはだ | `rough-skin` | 実装あり | 4 | 4 |
| おうごんのからだ | `good-as-gold` | 実装あり | 3 | 3 |
| すなおこし | `sand-stream` | 実装あり | 3 | 3 |
| せいしんりょく | `inner-focus` | 実装あり（定義のみ） | 3 | 3 |
| てきおうりょく | `adaptability` | 実装あり | 2 | 2 |
| ばけのかわ | `disguise` | 実装あり | 2 | 2 |
| バトルスイッチ | `battle-switch` | 実装あり | 2 | 2 |
| ふゆう | `levitate` | 実装あり | 2 | 2 |
| もうか | `blaze` | 実装あり | 2 | 2 |
| あめふらし | `drizzle` | 実装あり | 1 | 1 |
| かそく | `speed-boost` | 実装あり | 1 | 1 |
| がんじょう | `sturdy` | 実装あり | 1 | 1 |
| くだけるよろい | `weak-armor` | 実装あり | 1 | 1 |
| サイコメイカー | `psychic-surge` | 実装あり | 1 | 1 |
| さいせいりょく | `regenerator` | 実装あり | 1 | 1 |
| じきゅうりょく | `stamina` | 実装あり | 1 | 1 |
| しんりょく | `overgrow` | 実装あり | 1 | 1 |
| てんねん | `unaware` | 実装あり | 1 | 1 |
| ひらいしん | `lightning-rod` | 実装あり | 1 | 1 |
| へんげんじざい | `protean` | 実装あり | 1 | 1 |
| マルチスケイル | `multiscale` | 実装あり | 1 | 1 |
| プレッシャー | `pressure` | 名前だけ | 4 | 4 |
| クリアボディ | `clear-body` | 名前だけ | 2 | 2 |
| そうだいしょう | `supreme-overlord` | 名前だけ | 2 | 2 |
| どくげしょう | `toxic-debris` | 名前だけ | 2 | 2 |
| ねつこうかん | `thermal-exchange` | 名前だけ | 2 | 2 |
| フラワーベール | `flower-veil` | 名前だけ | 2 | 2 |
| あめうけざら | `rain-dish` | 名前だけ | 1 | 1 |
| おみとおし | `frisk` | 名前だけ | 1 | 1 |
| かるわざ | `unburden` | 名前だけ | 1 | 1 |
| ききかいひ | `emergency-exit` | 名前だけ | 1 | 1 |
| こぼれダネ | `seed-sower` | 名前だけ | 1 | 1 |
| じゅうなん | `limber` | 名前だけ | 1 | 1 |
| ちくでん | `volt-absorb` | 名前だけ | 1 | 1 |
| ようりょくそ | `chlorophyll` | 名前だけ | 1 | 1 |

補足: `inner-focus`（せいしんりょく）は `AbilityDefinition` を持つが、中枢の「ひるみ」自体が未実装のため実質は名前だけに近い。`clear-body`・`supreme-overlord`・`toxic-debris`・`thermal-exchange`・`flower-veil` は能力低下防止・退場時上昇・能力上昇・やけど時上昇・状態異常防止などの効果が丸ごと無い。

### 技（127種）

内訳: **効果まで実装 103種 / 一部のみ 4種 / データのみ 20種**。「データのみ」はタイプ・威力・分類・PP・命中だけを持ち、固有效果は処理されない。

一部のみ（処理される効果と欠けている効果が混在）:

| 技 | 処理される効果 | 欠けている効果 |
|---|---|---|
| スケイルショット | 連続2〜5回ヒット | 使用後のS+1/B-1 |
| はねやすめ | HP1/2回復 | そのターンのひこうタイプ消滅 |
| おきみやげ | 相手のA-2/C-2 | 自分のひんし |
| ちからをすいとる | 相手のA-1 | 相手のこうげき分の回復 |

データのみ（固有效果が未処理）:

| 技 | 欠けている効果 |
|---|---|
| サイコショック | 相手のぼうぎょで計算 |
| サイコファング | 壁（リフレクター等）の破壊 |
| トリック | 持ち物の交換 |
| ソーラービーム | 溜め技 |
| げきりん | 連続使用とこんらん |
| きりばらい | 設置技の除去 |
| まとわりつく | 交代不能＋継続ダメージ |
| みちづれ | 相打ち |
| ウェーブタックル | 反動（本編は与ダメージの1/3。PokeAPI に meta が無く未確認のため未設定） |
| さいきのいのり | ひんしの味方の復活 |
| だいちのはどう | フィールドによるタイプ・威力変化 |
| じごくづき | 音技の封じ |
| ちょうはつ | 変化技の封じ |
| こらえる | HP1で耐える |
| うたかたのアリア | 相手のやけどの治癒 |
| アシストパワー | 能力上昇に応じた威力上昇 |
| バトンタッチ | 能力変化の引き継ぎ |
| いたみわけ | HPの平均化 |
| コメットパンチ | 20%のこうげき上昇（確率付き自己能力変化は未対応） |
| ウェザーボール | 天候によるタイプ・威力変化 |

なお、**ひるみ・こんらん自体が未実装**のため、追加効果に flinch / confusion を持つ技（あくのはどう・たきのぼり・つららおとし・アイアンヘッド・エアスラッシュ・ねこだまし・ぼうふう等）は、その部分だけが静かに落ちる。

### 構築ごとの再現度（未実装効果を持つ枠）

| 構築 | 未実装効果を持つ枠 | 件数 |
|---|---|---|
| メガガブリアスZ | 1/6 | 1 |
| メガグソクムシャ | 1/6 | 1 |
| カバマンダ | 2/6 | 3 |
| メガリザードンY | 4/6 | 6 |
| メガジュペッタ | 6/6 | 6 |
| メガカメックス | 4/6 | 5 |
| カイリューガルド | 3/6 | 3 |
| メガライチュウY | 2/6 | 2 |
| クエスピクシー | 5/6 | 6 |
| カバルカ | 2/6 | 2 |
| メガラグラージ | 4/6 | 5 |

上位2構築（メガガブリアスZ・メガグソクムシャ）は未実装効果が各1件だけで、現状でもっとも忠実に近い。メガジュペッタ構築は6枠すべてに未実装効果があり、勝率比較には使えない。

再生成: `node scripts/generate-meta-teams-catalog.mjs --report`（技の分類と構築ごとの件数）、`npx tsx scripts/ability-coverage-report.ts`（特性の表）。


## 特性（追加分）

| 特性 | 効果 | 実装箇所 |
|------|------|---------|
| サイコメイカー | 入場時にサイコフィールドを展開（5ターン。グランドコート持ちなら8ターン） | `rules/abilities/meta-abilities.ts` の `PSYCHIC_SURGE` |
| ばけのかわ | Champions仕様（第8世代以降準拠）。1回だけ技のダメージを無効化して最大HPの1/8を受け、フォルムチェンジする。交代で復活しない（バトル中1回きり）。タイプ無効の技では発動せず、ステロ・変化技・追加効果は防がない | `DISGUISE`（`onDamaged`）+ `Pokemon.disguiseBroken` + `BattleEngine.applyDamage`（実ダメージを返す） |
| おうごんのからだ | 相手からの変化技を無効化（ダメージ技は通る） | `GOOD_AS_GOLD`（`blocksMove`） |
| クリアボディほか13種 | 名前のみ登録（効果は未実装） | `ability-names.ts` |

**gamewith 最強パーティランキング（2026-10-19 取得）の11構築に登場する特性37種をすべて登録済み**（`tests/ability-coverage.test.ts` と `tests/meta-teams.test.ts` で固定）。内訳は「未実装の特性・技の棚卸し」を参照。

2026-10-19 に追加した特性名: `volt-absorb`（ちくでん）・`thermal-exchange`（ねつこうかん）・`flower-veil`（フラワーベール）・`fairy-aura`（フェアリーオーラ）・`tobidasu-nakami`（とびだすなかみ・メガウツボット、英語名未公開のためローマ字キー）。いずれも名前だけの登録。

## 技の効果（現環境の構築で使われるもの）

| 技 | 効果 | 実装 |
|----|------|------|
| みがわり | 最大HPの1/4を払って身代わりを出す。ダメージは身代わりが受ける。残りHPが代償以下なら失敗。交代で消える | `createsSubstitute` / `Pokemon.substituteHP` |
| くろいきり | 場に出ている全員の能力変化をリセットする | `resetsStatStages` |
| ドレイン技（きゅうけつ・ギガドレイン・むねんのつるぎ等） | 与えたダメージの50%を回復する | `drainPercent` |
| まもる | そのターン相手の技を無効化。連続使用は成功率が半減（1.0→0.5→…） | `protects` / `Pokemon.protecting` |
| ねむる | HP全回復＋2ターンのねむり。HP満タン・状態異常ありでは失敗 | `rests` / `Pokemon.applySleep` |
| 反動（ウェーブタックル・てっていこうせん等） | 与えたダメージの割合、または最大HPの割合を自分も受ける | `recoilPercent` / `recoilMaxHpPercent` |
| ふいうち | 相手がそのターン攻撃技を選んでいなければ失敗 | `failsUnlessTargetAttacks` / `intendsToAttackThisTurn` |
| イカサマ | ダメージ計算に相手のこうげきを使う | `usesTargetAttack` |
| くさむすび・けたぐり | 威力が相手の体重で決まる（20〜120） | `weightBasedPower` / `Pokemon.weightKg` |
| はたきおとす | 落とせる持ち物を持つ相手には威力1.5倍、命中後に落とす（メガストーンは不可） | `knockOff` / `isMegaStone` |
| ポルターガイスト | 相手が持ち物を持っていなければ失敗 | `failsIfNoItem` |
| ダメおし | そのターン既に相手がダメージを受けていれば威力2倍 | `doublesIfTargetDamaged` |
| トリックフラワー | 必ず急所（シェルアーマー等が優先） | `alwaysCrit` |
| オーロラベール | 5ターンの間、張られた側が受けるダメージを半減 | `fieldEffect: 'aurora-veil'` |
| ねがいごと | 2ターン後に場に出ているポケモンを最大HPの半分回復 | `wishes` / `BattleField.wish` |
| ミストフィールド | 5ターン展開。接地側は状態異常無効＋ドラゴン技半減 | `fieldEffect: 'misty-terrain'` |
| ほえる・ドラゴンテール | 相手を控えと強制交代させる（無作為） | `forcesSwitch` / `BattleRunner.applyForcedOutSwitch` |

**まきびし・どくびしは `fieldEffect`（'spikes' / 'toxic-spikes'）として実装済み**（前の記録で未実装と書いていたのは誤り）。

**残っている主な未実装の技効果**（pokesol M-4 トップ5が使う技80件から抽出）: サイコショック（特殊技なのに相手のぼうぎょで計算）、サイコファング（壁を壊す）、パワフルエッジ（まもるを貫通）、フリーズドライ（みずに抜群）、ヘビーボンバー（体重比で威力）、うたかたのアリア（相手のやけどを治す）、クリアスモッグ（相手の能力変化をリセット）、じごくづき（音技を封じる）、トリック（持ち物の交換）。

## 未実装

| 道具 | ID | 効果 | 備考 |
|------|-----|------|------|
| ゴツゴツメット | `rocky-helmet` | 接触技を受けたとき相手に最大HPの1/6ダメージ | 接触技フラグが未実装 |
| とつげきチョッキ | `assault-vest` | 特防1.5倍 / 変化技を選べない | 合法手判定への追加が必要 |
| じゃくてんほけん | `weakness-policy` | 効果抜群を受けたとき攻撃・特攻+2 | |
| しめったいわ | `damp-rock` | あめふらしの持続を8ターンに延長 | 天候持続ターンが固定5のため |
| その他の半減実・こだわりトリック等 | | | |

---

#pokemon-champions #バトルエンジン #アイテム
