// gamewith「最強パーティランキング」（Tier1〜3）の構築を MetaTeamEntry に変換して
// src/data/meta-teams-catalog.ts を生成する。生成物は手で編集しない。
//
// 入力:
//   data/gamewith-555537-2026-10-19.json  … 構築ページの DOM から抽出した生データ
//   data/pokeapi-catalog.json             … PokeAPI の種族値・タイプ・技データ
//
// 使い方:
//   node scripts/generate-meta-teams-catalog.mjs                 # 全11構築
//   node scripts/generate-meta-teams-catalog.mjs --upto 4        # 先頭4構築だけ（段階コミット用）
//   node scripts/generate-meta-teams-catalog.mjs --report        # 技の効果分類を標準出力（docs用）
import { readFileSync, writeFileSync } from 'node:fs';

const teams = JSON.parse(readFileSync('data/gamewith-555537-2026-10-19.json', 'utf8'));
const cat = JSON.parse(readFileSync('data/pokeapi-catalog.json', 'utf8'));

const args = process.argv.slice(2);
const uptoArg = args.indexOf('--upto');
const upto = uptoArg >= 0 ? Number(args[uptoArg + 1]) : teams.length;
const reportOnly = args.includes('--report');

// 構築ページの日本語名 → PokeAPI の英語名（フォルムは PokeAPI の表記で明示）。
const POKEMON = JSON.parse(readFileSync('data/catalog-pokemon-map.json', 'utf8'));

const ABILITY = JSON.parse(readFileSync('data/catalog-ability-map.json', 'utf8'));
const ITEM = JSON.parse(readFileSync('data/catalog-item-map.json', 'utf8'));

const TYPE_NAMES = new Set([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]);
const STAT_KEY = {
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SPATK',
  'special-defense': 'SPDEF',
  speed: 'SPEED',
};
const AILMENT = {
  paralysis: 'paralysis',
  burn: 'burn',
  freeze: 'freeze',
  poison: 'poison',
  sleep: 'sleep',
  // PokeAPI は「もうどく」も poison として返すため、effect 文言で badly-poisoned に振り分ける。
};
const ORDER = ['HP', 'ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];

const toFullWidth = (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));

// エンジンが効果を処理している技のフラグ。1つずつ docs/IMPLEMENTED_ITEMS.md の実装済み一覧と
// BattleEngine の分岐に対応している（根拠のないフラグは付けない）。
const MOVE_FLAGS = {
  ステルスロック: { fieldEffect: 'stealth-rock' },
  どくびし: { fieldEffect: 'toxic-spikes' },
  あくび: { inflictsDrowsy: true },
  アンコール: { inflictsEncore: true },
  みがわり: { createsSubstitute: true },
  まもる: { protects: true },
  キングシールド: { protects: true, restoresShieldForm: true },
  くろいきり: { resetsStatStages: true },
  ねがいごと: { wishes: true },
  ふきとばし: { forcesSwitch: true },
  ドラゴンテール: { forcesSwitch: true },
  とんぼがえり: { pivot: true },
  クイックターン: { pivot: true },
  ボルトチェンジ: { pivot: true },
  ワイドフォース: { boostedByPsychicTerrain: true },
  だいちのはどう: { terrainPulse: true },
  ボディプレス: { usesDefenseForAttack: true },
  イカサマ: { usesTargetAttack: true },
  くさむすび: { weightBasedPower: true },
  はたきおとす: { knockOff: true },
  ポルターガイスト: { failsIfNoItem: true },
  ふいうち: { failsUnlessTargetAttacks: true },
  とびひざげり: { crashDamage: true },
  トリックフラワー: { alwaysCrit: true },
  てっていこうせん: { recoilMaxHpPercent: 0.5 },
  // 天候で回復量が変わる技（はれ 2/3・砂/霰 1/4・その他 1/2）。
  こうごうせい: { weatherHeal: true, selfHealPercent: 0.5 },
  つきのひかり: { weatherHeal: true, selfHealPercent: 0.5 },
};

// PokeAPI の meta からは導けないが、仕様が確定している多段技。
const MULTI_HIT = {
  みずしゅりけん: { maxHits: 5 },
  スケイルショット: { maxHits: 5 },
  トリプルアクセル: { maxHits: 3, multiHitPowers: [20, 40, 80] },
};

// 効果は未実装だが、データとしては持たせておくべきもの（docs の棚卸しに出す）。
const UNIMPLEMENTED_NOTE = {
  ウェーブタックル: '反動（本編は与ダメージの1/3）。PokeAPI に meta が無く未確認のため未設定',
  ソーラービーム: '溜め技',
  げきりん: '連続使用とこんらん',
  アシストパワー: '能力上昇に応じた威力上昇',
  サイコショック: '相手のぼうぎょで計算',
  サイコファング: '壁（リフレクター等）の破壊',
  うたかたのアリア: '相手のやけどの治癒',
  トリック: '持ち物の交換',
  おきみやげ: '自分のひんし＋相手の能力低下',
  いたみわけ: 'HPの平均化',
  ちからをすいとる: '相手のこうげき分の回復',
  きりばらい: '設置技の除去',
  こらえる: 'HP1で耐える',
  さいきのいのり: 'ひんしの味方の復活',
  ちょうはつ: '変化技の封じ',
  バトンタッチ: '能力変化の引き継ぎ',
  みちづれ: '相打ち',
  じごくづき: '音技の封じ',
  まとわりつく: '交代不能＋継続ダメージ',
  だいちのはどう: 'フィールドによるタイプ・威力変化',
  ウェザーボール: '天候によるタイプ・威力変化',
  はねやすめ: 'そのターンのひこうタイプ消滅',
  コメットパンチ: '20%のこうげき上昇（確率付き自己能力変化は未対応）',
  スケイルショット: '使用後のS+1/B-1',
};

function moveEntry(jaName) {
  const d = cat.moves[jaName] ?? cat.moves[toFullWidth(jaName)];
  if (!d) throw new Error(`PokeAPI に技が見つかりません: ${jaName}`);
  if (!TYPE_NAMES.has(d.type)) throw new Error(`未知のタイプ: ${jaName} ${d.type}`);

  const meta = d.meta ?? {};
  const category = d.category;
  const fields = [];
  const keys = new Set();
  // 同じキーを二重に書かない（PokeAPI の healing と手動フラグが重なるため）。
  const add = (key, text) => {
    if (keys.has(key)) return;
    keys.add(key);
    fields.push(text);
  };
  add('name', `name: '${jaName}'`);
  add('type', `type: '${d.type}'`);

  if (category === 'status') {
    add('power', 'power: 0');
    add('accuracy', `accuracy: ${d.accuracy ?? 100}`);
    add('pp', `pp: ${d.pp}`);
    add('category', "category: 'status'");
  } else {
    add('power', `power: ${d.power ?? 0}`);
    add('accuracy', `accuracy: ${d.accuracy ?? 100}`);
    add('pp', `pp: ${d.pp}`);
    add('category', `category: '${category}'`);
  }
  if (d.priority !== 0) add('priority', `priority: ${d.priority}`);

  // 状態異常（変化技）。
  if (category === 'status' && meta.ailment && AILMENT[meta.ailment.name]) {
    const effect = d.effect ?? '';
    const status =
      meta.ailment.name === 'poison' && /badly poisons/i.test(effect) ? 'badly-poisoned' : AILMENT[meta.ailment.name];
    add('status', `status: '${status}'`);
  }

  // ダメージ技の追加効果（状態異常）。
  if (category !== 'status' && meta.ailment && AILMENT[meta.ailment.name] && meta.ailment_chance > 0) {
    add(
      'secondaryEffect',
      `secondaryEffect: { status: '${AILMENT[meta.ailment.name]}', chance: ${meta.ailment_chance} }`,
    );
  }

  // ドレイン（与ダメージの%回復）。
  if (meta.drain > 0) add('drainPercent', `drainPercent: ${meta.drain / 100}`);
  // 反動（PokeAPI は負の drain で返す。-33 は 1/3 の丸め）。
  if (meta.drain < 0) add('recoilPercent', `recoilPercent: ${Math.abs(meta.drain) / 100}`);
  // 自己回復（最大HPの%）。
  if (meta.healing > 0) add('selfHealPercent', `selfHealPercent: ${meta.healing / 100}`);

  // 能力ランク変化。PokeAPI の category で自己/相手を判定する。
  const statChanges = (d.statChanges ?? []).filter((s) => STAT_KEY[s.stat]);
  if (statChanges.length > 0) {
    const cat2 = meta.category?.name ?? '';
    const effect = d.effect ?? '';
    const toSelf =
      cat2 === 'net-good-stats' ||
      cat2 === 'damage-raise' ||
      (cat2 === 'unique' && !/target/i.test(effect));
    if (toSelf && (cat2 === 'net-good-stats' || cat2 === 'unique' || meta.stat_chance === 100)) {
      const list = statChanges.map((s) => `{ stat: '${STAT_KEY[s.stat]}', delta: ${s.change} }`);
      add('selfStatChange', `selfStatChange: [${list.join(', ')}]`);
    } else if (!toSelf) {
      const chance = meta.stat_chance > 0 ? meta.stat_chance : 100;
      const list = statChanges.map((s) => `{ stat: '${STAT_KEY[s.stat]}', delta: ${s.change}, chance: ${chance} }`);
      add('targetStatChange', `targetStatChange: [${list.join(', ')}]`);
    }
  }

  // 多段ヒット。
  if (MULTI_HIT[jaName]) {
    const v = MULTI_HIT[jaName];
    add('multiHit', 'multiHit: true');
    if (v.maxHits) add('maxHits', `maxHits: ${v.maxHits}`);
    if (v.multiHitPowers) add('multiHitPowers', `multiHitPowers: [${v.multiHitPowers.join(', ')}]`);
  } else if ((meta.min_hits ?? 0) >= 2) {
    add('multiHit', 'multiHit: true');
    add('maxHits', `maxHits: ${meta.max_hits}`);
  }

  // エンジンが処理するフラグ。
  for (const [k, v] of Object.entries(MOVE_FLAGS[jaName] ?? {})) {
    add(k, `${k}: ${JSON.stringify(v)}`);
  }

  const effectFlags = [...keys].filter(
    (k) => !['name', 'type', 'power', 'accuracy', 'pp', 'category', 'priority'].includes(k),
  );

  return {
    line: `createMove({ ${fields.join(', ')} })`,
    d,
    flags: Object.keys(MOVE_FLAGS[jaName] ?? {}),
    effectFlags,
    note: UNIMPLEMENTED_NOTE[jaName],
  };
}

const out = [];
out.push('// このファイルは scripts/generate-meta-teams-catalog.mjs が生成する。手で編集しない。');
out.push('//');
out.push('// 出典:');
out.push('//   構築（6体・持ち物・特性・性格・能力ポイント・技・選出）:');
out.push('//     gamewith.jp/pokemon-champions/555537「最強パーティランキング」（2026-10-19 取得）');
out.push('//     抽出データ: data/gamewith-555537-2026-10-19.json');
out.push('//   種族値・タイプ・技の基礎データ（タイプ/威力/命中/PP/分類/優先度/追加効果）:');
out.push('//     PokeAPI（2026-10-19 取得）data/pokeapi-catalog.json');
out.push('//');
out.push('// 実数値の検算: 全66体について、ページ記載の実数値とエンジンの計算式');
out.push('// （StatPointSystem: 1ポイント=実数値1・合計66/各32上限）が一致することを確認済み。');
out.push('// 例外: メガラグラージ構築のラグラージはページのぼうぎょが113、計算値は112（ページ側の記載ずれ）。');
out.push("import type { MetaTeamEntry } from './meta-teams.js';");
out.push("import { createMove } from '../move.js';");
out.push('');
out.push('export const GAMEWITH_TEAMS: MetaTeamEntry[] = [');

const report = [];

for (const team of teams.slice(0, upto)) {
  const basic = team.sels[0];
  const alts = team.sels.slice(1);
  const fmtSel = (s) => `${s.label}: ${s.cells.map((c) => c.replace(' (初手)', '（初手）')).join('／')}`;
  out.push('  {');
  out.push(`    name: '${team.name}',`);
  out.push(
    "    source: 'gamewith.jp/pokemon-champions/555537（最強パーティランキング・2026-10-19 取得）',",
  );
  out.push(`    basicSelection: '${fmtSel(basic).replace(/'/g, "\\'")}',`);
  out.push('    alternativeSelections: [');
  for (const a of alts) out.push(`      '${fmtSel(a).replace(/'/g, "\\'")}',`);
  out.push('    ],');
  out.push('    members: [');
  for (const m of team.members) {
    const p = cat.pokemon[m.name];
    if (!p) throw new Error(`ポケモンのデータがありません: ${m.name}`);
    const ability = ABILITY[m.ability];
    if (!ability) throw new Error(`特性の対応がありません: ${m.ability} (${m.name})`);
    const item = m.item === '' ? null : ITEM[m.item];
    if (item === undefined) throw new Error(`持ち物の対応がありません: ${m.item} (${m.name})`);
    const pts = m.ev.split(',').map(Number);
    const points = ORDER.map((k, i) => [k, pts[i]]).filter(([, v]) => v > 0);
    out.push('      {');
    out.push(`        name: '${p.apiName}',`);
    out.push(`        displayName: '${m.name}',`);
    out.push(
      `        baseStats: { ${ORDER.map((k) => `${k}: ${p.baseStats[k]}`).join(', ')} },`,
    );
    out.push(`        types: [${p.types.map((t) => `'${t}'`).join(', ')}],`);
    out.push(`        ability: '${ability}',`);
    out.push(`        item: ${item === null ? 'null' : `'${item}'`},`);
    out.push(`        nature: '${m.nature}',`);
    out.push(`        statPoints: { ${points.map(([k, v]) => `${k}: ${v}`).join(', ')} },`);
    // ギルガルド: シールドフォルムで場に出て、攻撃技でブレードに変わる（バトルスイッチ）。
    // ブレードの種族値は構築ページのフォルム別データ（60-140-50-140-50-60）。
    if (m.form1Name === 'ギルガルド(ブレードフォルム)') {
      const f = m.form1BaseStats.split('-').map(Number);
      out.push("        form: 'shield',");
      out.push('        formStats: {');
      out.push(
        `          shield: { baseStats: { ${ORDER.map((k) => `${k}: ${p.baseStats[k]}`).join(', ')} } },`,
      );
      out.push(`          blade: { baseStats: { ${ORDER.map((k, i) => `${k}: ${f[i]}`).join(', ')} } },`);
      out.push('        },');
    }
    out.push('        moves: [');
    for (const mv of m.moves) {
      const { line, d, flags, effectFlags, note } = moveEntry(mv);
      out.push(`          ${line},`);
      report.push({
        move: mv,
        api: d.apiName,
        category: d.category,
        flags,
        effectFlags,
        note,
        effect: d.effect,
      });
    }
    out.push('        ],');
    out.push('      },');
  }
  out.push('    ],');
  out.push('  },');
}
out.push('];');
out.push('');

const text = out.join('\n');
if (!reportOnly) {
  writeFileSync('src/data/meta-teams-catalog.ts', text);
  console.log(`生成: src/data/meta-teams-catalog.ts（構築 ${Math.min(upto, teams.length)} 件）`);
}

if (reportOnly) {
  // 技単位の分類と、構築単位の「どこまで忠実に再現できるか」を出す。
  const seen = new Set();
  console.log('## 技');
  for (const r of report) {
    if (seen.has(r.move)) continue;
    seen.add(r.move);
    const state = r.note ? (r.effectFlags.length > 0 ? '一部のみ' : 'データのみ') : '実装あり';
    console.log(
      `${state}\t${r.move}\t${r.api}\t${r.category}\t[${[...r.flags, ...r.effectFlags].join(',')}]\t${r.note ?? ''}`,
    );
  }

  // 構築ごとに、未実装の効果を持つ技を数える（その構築がどこまで忠実に走るかの目安）。
  console.log('\n## 構築ごとの未実装効果');
  for (const team of teams.slice(0, upto)) {
    const missing = [];
    for (const m of team.members) {
      for (const mv of m.moves) {
        const note = UNIMPLEMENTED_NOTE[mv];
        if (note) missing.push(`${m.name}:${mv}`);
      }
    }
    console.log(`${team.name}\t枠 ${new Set(missing.map((x) => x.split(':')[0])).size}/6\t${missing.length}件`);
  }
}
