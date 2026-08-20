import type { Pokemon } from '../pokemon.js';
import type { TypeName } from '../types.js';
import type { PokeApiPokemonData } from '../api/pokemon-api.js';
import { StatPointSystem } from './stat-point-system.js';

const statPointSystem = new StatPointSystem();

const MEGA_STAT_KEYS = ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'] as const;
export type MegaStatKey = (typeof MEGA_STAT_KEYS)[number];
export type MegaStatBoosts = Record<MegaStatKey, number>;

const MEGA_STAT_TOTAL = 100;

export interface MegaStoneConfig {
  pokemon: string;
  megaName: string;
  typeChange: TypeName[];
  abilityChange: string;
  // ポケモンごとに配分が異なる種族値上昇分（HPを除く5ステータス、合計は必ず+100）。
  // マイナス値もありうる（例: メガガブリアスは素早さが-10される）。
  statBoosts: MegaStatBoosts;
}

// item（メガストーン）→ 対象ポケモン・メガ形態のPoke API上の名前、というマッピングは
// Poke API側に構造化データが存在しない（item側は説明文のみ）ため、ここで静的に保持する。
export interface MegaStoneSeed {
  pokemon: string;
  megaApiName: string;
  megaName: string;
}

export const MEGA_STONE_SEEDS: Record<string, MegaStoneSeed> = {
  'charizardite-x': { pokemon: 'charizard', megaApiName: 'charizard-mega-x', megaName: 'mega-charizard-x' },
  'charizardite-y': { pokemon: 'charizard', megaApiName: 'charizard-mega-y', megaName: 'mega-charizard-y' },
  'garchompite': { pokemon: 'garchomp', megaApiName: 'garchomp-mega', megaName: 'mega-garchomp' },
  'venusaurite': { pokemon: 'venusaur', megaApiName: 'venusaur-mega', megaName: 'mega-venusaur' },
  'mawilite': { pokemon: 'mawile', megaApiName: 'mawile-mega', megaName: 'mega-mawile' },
  'blastoisinite': { pokemon: 'blastoise', megaApiName: 'blastoise-mega', megaName: 'mega-blastoise' },
  'swampertite': { pokemon: 'swampert', megaApiName: 'swampert-mega', megaName: 'mega-swampert' },
  'blazikenite': { pokemon: 'blaziken', megaApiName: 'blaziken-mega', megaName: 'mega-blaziken' },
  'gengarite': { pokemon: 'gengar', megaApiName: 'gengar-mega', megaName: 'mega-gengar' },
  'kangaskhanite': { pokemon: 'kangaskhan', megaApiName: 'kangaskhan-mega', megaName: 'mega-kangaskhan' },
  'scizorite': { pokemon: 'scizor', megaApiName: 'scizor-mega', megaName: 'mega-scizor' },
  'lopunnite': { pokemon: 'lopunny', megaApiName: 'lopunny-mega', megaName: 'mega-lopunny' },
};

// Poke APIから取得できない場合のデフォルト値（2026-07時点でPoke API実データと突合済み）。
const DEFAULT_MEGA_STONES: Record<string, MegaStoneConfig> = {
  'charizardite-x': {
    pokemon: 'charizard',
    megaName: 'mega-charizard-x',
    typeChange: ['fire', 'dragon'],
    abilityChange: 'tough-claws',
    statBoosts: { ATK: 46, DEF: 33, SPATK: 21, SPDEF: 0, SPEED: 0 },
  },
  'charizardite-y': {
    pokemon: 'charizard',
    megaName: 'mega-charizard-y',
    typeChange: ['fire', 'flying'],
    abilityChange: 'drought',
    statBoosts: { ATK: 20, DEF: 0, SPATK: 50, SPDEF: 30, SPEED: 0 },
  },
  'garchompite': {
    pokemon: 'garchomp',
    megaName: 'mega-garchomp',
    typeChange: ['dragon', 'ground'],
    abilityChange: 'sand-force',
    statBoosts: { ATK: 40, DEF: 20, SPATK: 40, SPDEF: 10, SPEED: -10 },
  },
  // ---- Champions 独自メガ（pokesol masterData 2026-08-19 収集）----
  // メガスコヴィラン: スコヴィラン本体の素早さが本編65→75に変更されている点に注意。
  'scovillainite': {
    pokemon: 'scovillain',
    megaName: 'mega-scovillain',
    typeChange: ['grass', 'fire'],
    abilityChange: 'spicy-spray', // とびだすハバネロ（実装済み・攻撃で受けたら攻撃者をやけどにする）
    statBoosts: { ATK: 30, DEF: 20, SPATK: 30, SPDEF: 20, SPEED: 0 },
  },
  'delphoxite': {
    pokemon: 'delphox',
    megaName: 'mega-delphox',
    typeChange: ['fire', 'psychic'],
    abilityChange: 'levitate',
    statBoosts: { ATK: 0, DEF: 0, SPATK: 45, SPDEF: 25, SPEED: 30 },
  },
  'scolipite': {
    pokemon: 'scolipede',
    megaName: 'mega-scolipede',
    typeChange: ['bug', 'poison'],
    abilityChange: 'shell-armor',
    statBoosts: { ATK: 40, DEF: 60, SPATK: 20, SPDEF: 30, SPEED: -50 },
  },
  'raichunite-x': {
    pokemon: 'raichu',
    megaName: 'mega-raichu-x',
    typeChange: ['electric'],
    abilityChange: 'electric-surge', // エレキメイカー（未実装・効果調査待ち）
    statBoosts: { ATK: 45, DEF: 40, SPATK: 0, SPDEF: 15, SPEED: 0 },
  },
  'raichunite-y': {
    pokemon: 'raichu',
    megaName: 'mega-raichu-y',
    typeChange: ['electric'],
    abilityChange: 'no-guard',
    statBoosts: { ATK: 10, DEF: 0, SPATK: 70, SPDEF: 0, SPEED: 20 },
  },
  // ---- 標準メガ（Poke API実データに基づく）----
  'venusaurite': {
    pokemon: 'venusaur',
    megaName: 'mega-venusaur',
    typeChange: ['grass', 'poison'],
    abilityChange: 'thick-fat',
    statBoosts: { ATK: 18, DEF: 40, SPATK: 22, SPDEF: 20, SPEED: 0 },
  },
  'mawilite': {
    pokemon: 'mawile',
    megaName: 'mega-mawile',
    typeChange: ['steel', 'fairy'],
    abilityChange: 'huge-power',
    statBoosts: { ATK: 20, DEF: 40, SPATK: 0, SPDEF: 40, SPEED: 0 },
  },
  'blastoisinite': {
    pokemon: 'blastoise',
    megaName: 'mega-blastoise',
    typeChange: ['water'],
    abilityChange: 'mega-launcher',
    statBoosts: { ATK: 20, DEF: 20, SPATK: 50, SPDEF: 10, SPEED: 0 },
  },
  // ---- 上位構築メガ（2026-08-19 追加、種族値は Pokémon Showdown データで確認）----
  'swampertite': {
    pokemon: 'swampert',
    megaName: 'mega-swampert',
    typeChange: ['water', 'ground'],
    abilityChange: 'swift-swim', // すいすい: 雨で素早さ2倍
    statBoosts: { ATK: 40, DEF: 20, SPATK: 10, SPDEF: 20, SPEED: 10 },
  },
  'blazikenite': {
    pokemon: 'blaziken',
    megaName: 'mega-blaziken',
    typeChange: ['fire', 'fighting'],
    abilityChange: 'speed-boost', // かそく
    statBoosts: { ATK: 40, DEF: 10, SPATK: 20, SPDEF: 10, SPEED: 20 },
  },
  'gengarite': {
    pokemon: 'gengar',
    megaName: 'mega-gengar',
    typeChange: ['ghost', 'poison'],
    abilityChange: 'shadow-tag', // かげふみ
    statBoosts: { ATK: 0, DEF: 20, SPATK: 40, SPDEF: 20, SPEED: 20 },
  },
  'kangaskhanite': {
    pokemon: 'kangaskhan',
    megaName: 'mega-kangaskhan',
    typeChange: ['normal'],
    abilityChange: 'parental-bond', // おやこあい（未実装）
    statBoosts: { ATK: 30, DEF: 20, SPATK: 20, SPDEF: 20, SPEED: 10 },
  },
  'scizorite': {
    pokemon: 'scizor',
    megaName: 'mega-scizor',
    typeChange: ['bug', 'steel'],
    abilityChange: 'technician', // テクニシャン
    statBoosts: { ATK: 20, DEF: 40, SPATK: 10, SPDEF: 20, SPEED: 10 },
  },
  'lopunnite': {
    pokemon: 'lopunny',
    megaName: 'mega-lopunny',
    typeChange: ['normal', 'fighting'],
    abilityChange: 'scrappy', // きもったま
    // 実データ: ミミロップ A76/D84/S105 → メガ A136/D94/S135（A+60/D+10/S+30 = +100）
    statBoosts: { ATK: 60, DEF: 10, SPATK: 0, SPDEF: 0, SPEED: 30 },
  },
  // ---- Champions/ZA 独自メガ（やっくんチャンピオンズ図鑑 2026-08-19 確認）----
  'dragoniteite': {
    pokemon: 'dragonite',
    megaName: 'mega-dragonite',
    typeChange: ['dragon', 'flying'],
    abilityChange: 'multiscale', // マルチスケイル: 満HP時ダメージ半減
    // カイリュー A134/D95/SA100/SD100/S80 → メガ A124/D115/SA145/SD125/S100（A-10/D+20/SA+45/SD+25/S+20 = +100）
    statBoosts: { ATK: -10, DEF: 20, SPATK: 45, SPDEF: 25, SPEED: 20 },
  },
};

// PokemonAPI本体に依存せず注入できるよう、使う分だけのインターフェースを切り出す。
export interface PokemonDataFetcher {
  fetchPokemonData(pokemonId: string | number): Promise<PokeApiPokemonData>;
}

export class MegaEvolutionSystem {
  megaStones: Record<string, MegaStoneConfig>;

  constructor(megaStones: Record<string, MegaStoneConfig> = DEFAULT_MEGA_STONES) {
    this.megaStones = megaStones;

    for (const [item, stone] of Object.entries(this.megaStones)) {
      this.validateStatBoosts(item, stone.statBoosts);
    }
  }

  private validateStatBoosts(item: string, statBoosts: MegaStatBoosts): void {
    const total = MEGA_STAT_KEYS.reduce((sum, key) => sum + statBoosts[key], 0);
    // メガシンカの種族値配分は HP を除く5ステータスの合計が +100 固定（本編仕様）。
    if (total !== MEGA_STAT_TOTAL) {
      throw new Error(`メガシンカの種族値配分が不正です: ${item} の合計は${total}（期待値${MEGA_STAT_TOTAL}）`);
    }
  }

  // Poke APIからメガ進化前後の種族値を取得し、差分(statBoosts)・タイプ・特性を
  // 実データから算出してMegaEvolutionSystemを構築する。item→ポケモン名の対応表(seeds)
  // 自体はPoke API側に構造化データがないため静的に渡す必要がある。
  static async fromPokeApi(
    fetcher: PokemonDataFetcher,
    seeds: Record<string, MegaStoneSeed> = MEGA_STONE_SEEDS
  ): Promise<MegaEvolutionSystem> {
    const megaStones: Record<string, MegaStoneConfig> = {};

    for (const [item, seed] of Object.entries(seeds)) {
      const [base, mega] = await Promise.all([
        fetcher.fetchPokemonData(seed.pokemon),
        fetcher.fetchPokemonData(seed.megaApiName),
      ]);

      if (base.baseStats.HP !== mega.baseStats.HP) {
        throw new Error(
          `メガシンカでHPが変化するデータを検出しました: ${item} (${base.baseStats.HP} -> ${mega.baseStats.HP})`
        );
      }

      const statBoosts = Object.fromEntries(
        MEGA_STAT_KEYS.map((stat) => [stat, mega.baseStats[stat] - base.baseStats[stat]])
      ) as MegaStatBoosts;

      megaStones[item] = {
        pokemon: seed.pokemon,
        megaName: seed.megaName,
        typeChange: mega.types as TypeName[],
        abilityChange: mega.abilities[0]?.name ?? base.abilities[0]?.name ?? '',
        statBoosts,
      };
    }

    return new MegaEvolutionSystem(megaStones);
  }

  canMegaEvolve(pokemon: Pokemon): boolean {
    if (pokemon.isMega) return false;
    if (!pokemon.item) return false;

    const stone = this.megaStones[pokemon.item];
    if (!stone) return false;
    if (stone.pokemon !== pokemon.baseName) return false;

    return true;
  }

  megaEvolve(pokemon: Pokemon): boolean {
    if (!this.canMegaEvolve(pokemon)) {
      throw new Error(`${pokemon.name}はメガシンカできません`);
    }

    const stone = this.megaStones[pokemon.item!];

    pokemon.baseName = pokemon.name;
    pokemon.name = stone.megaName;
    pokemon.types = [...stone.typeChange];
    pokemon.ability = stone.abilityChange;
    pokemon.isMega = true;

    // メガシンカはHPを変化させない（本編仕様のため対象から除外）。
    for (const stat of MEGA_STAT_KEYS) {
      pokemon.baseStats[stat] += stone.statBoosts[stat];
    }

    if (pokemon.nature === null) {
      // 無補正なら Lv.50固定では計算式の種族値項の係数が(2*50/100=1)になるため、
      // 種族値への加算をそのまま実数値へ加算しても結果が一致する。
      // stats を直接指定して生成されたポケモンでもこの経路なら値が壊れない。
      for (const stat of MEGA_STAT_KEYS) {
        pokemon.stats[stat] += stone.statBoosts[stat];
      }
      return true;
    }

    // 性格補正がある場合は floor(実数値 * 補正) + 上昇分 ≠ floor((実数値 + 上昇分) * 補正) となるため、
    // 上昇後の種族値から計算し直す（HPは変化しないので据え置く）。
    const recalculated = statPointSystem.calculateStats(
      pokemon.baseStats,
      pokemon.statPoints,
      pokemon.nature,
    );
    for (const stat of MEGA_STAT_KEYS) {
      pokemon.stats[stat] = recalculated[stat];
    }

    return true;
  }
}
