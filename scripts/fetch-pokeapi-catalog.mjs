// PokeAPI から構築カタログ用のデータを取得する。
//  - ポケモン: 日本語名 → /pokemon/{english}（種族値・タイプ・特性）
//  - 技: 全技一覧 → 各技の詳細 → 日本語名（ja-Hrkt / ja）で引ける形にまとめる
//
// 使い方: node scripts/fetch-pokeapi-catalog.mjs
// 出力: data/pokeapi-catalog.json（生成物。手で編集しない）
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const OUT = 'data/pokeapi-catalog.json';
const API = 'https://pokeapi.co/api/v2';

// 構築ページの日本語表記 → PokeAPI の英語名。
// フォルム違いは PokeAPI のフォルム名で明示する（推測で補完しない）。
const POKEMON = {
  ガブリアス: 'garchomp',
  メタグロス: 'metagross',
  アシレーヌ: 'primarina',
  ミミッキュ: 'mimikyu-disguised',
  サーフゴー: 'gholdengo',
  カバルドン: 'hippowdon',
  グソクムシャ: 'golisopod',
  ボーマンダ: 'salamence',
  セグレイブ: 'baxcalibur',
  キラフロル: 'glimmora',
  ルカリオ: 'lucario',
  リザードン: 'charizard',
  'フラエッテ(えいえんのはな)': 'floette-eternal',
  アーマーガア: 'corviknight',
  ドヒドイデ: 'toxapex',
  ジュペッタ: 'banette',
  ウツボット: 'victreebel',
  'イダイトウ(オス)': 'basculegion-male',
  ドドゲザン: 'kingambit',
  パーモット: 'pawmot',
  カメックス: 'blastoise',
  'イエッサン(オス)': 'indeedee-male',
  オオニューラ: 'sneasler',
  グレンアルマ: 'armarouge',
  ブリジュラス: 'archaludon',
  カイリュー: 'dragonite',
  ギルガルド: 'aegislash-shield',
  サザンドラ: 'hydreigon',
  マスカーニャ: 'meowscarada',
  ライチュウ: 'raichu',
  ブラッキー: 'umbreon',
  ピクシー: 'clefable',
  オリーヴァ: 'arboliva',
  クエスパトラ: 'espathra',
  ミミロップ: 'lopunny',
  ヒートロトム: 'rotom-heat',
  ゲッコウガ: 'greninja',
  ギャラドス: 'gyarados',
  ラグラージ: 'swampert',
  ペリッパー: 'pelipper',
  マフォクシー: 'delphox',
};

const STAT_KEY = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SPATK',
  'special-defense': 'SPDEF',
  speed: 'SPEED',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': 'pokemon-champions-battle-engine/2.0' } });
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt >= 4) throw new Error(`${res.status} ${url}`);
    await sleep(500 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
  return res.json();
}

async function pooled(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const pokemon = {};
for (const [ja, en] of Object.entries(POKEMON)) {
  const d = await getJson(`${API}/pokemon/${en}`);
  if (!d) throw new Error(`PokeAPI に存在しません: ${ja} -> ${en}`);
  const baseStats = { HP: 0, ATK: 0, DEF: 0, SPATK: 0, SPDEF: 0, SPEED: 0 };
  for (const s of d.stats) baseStats[STAT_KEY[s.stat.name]] = s.base_stat;
  pokemon[ja] = {
    apiName: en,
    baseStats,
    types: [...d.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    abilities: d.abilities.map((a) => a.ability.name),
    weight: d.weight,
  };
}

// --- 技 ---
let moveIndex = null;
if (existsSync('data/pokeapi-move-index.json')) {
  moveIndex = JSON.parse(readFileSync('data/pokeapi-move-index.json', 'utf8'));
}
if (!moveIndex) {
  const list = await getJson(`${API}/move?limit=2000`);
  const entries = list.results;
  console.error(`技 ${entries.length} 件を取得します`);
  const details = await pooled(entries, 4, async (e, i) => {
    const d = await getJson(`${API}/move/${e.name}`);
    if (i % 50 === 0) console.error(`  ${i}/${entries.length}`);
    return d;
  });
  moveIndex = {};
  for (const d of details) {
    if (!d) continue;
    const jaName =
      d.names.find((n) => n.language.name === 'ja-Hrkt')?.name ??
      d.names.find((n) => n.language.name === 'ja')?.name ??
      null;
    if (!jaName) continue;
    moveIndex[jaName] = {
      apiName: d.name,
      type: d.type.name,
      category: d.damage_class.name,
      power: d.power,
      accuracy: d.accuracy,
      pp: d.pp,
      priority: d.priority,
      meta: d.meta,
      statChanges: d.stat_changes.map((s) => ({ stat: s.stat.name, change: s.change })),
      effect: d.effect_entries.find((e) => e.language.name === 'en')?.short_effect ?? null,
    };
  }
  writeFileSync('data/pokeapi-move-index.json', JSON.stringify(moveIndex, null, 1));
  console.error(`技インデックスを保存: ${Object.keys(moveIndex).length} 件`);
}

writeFileSync(OUT, JSON.stringify({ pokemon, moves: moveIndex }, null, 1));
console.log(`保存: ${OUT}（ポケモン ${Object.keys(pokemon).length} / 技 ${Object.keys(moveIndex).length}）`);
