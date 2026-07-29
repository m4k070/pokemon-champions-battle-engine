const MEGA_STAT_KEYS = ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];
const MEGA_STAT_TOTAL = 100;
export const MEGA_STONE_SEEDS = {
    'charizardite-x': { pokemon: 'charizard', megaApiName: 'charizard-mega-x', megaName: 'mega-charizard-x' },
    'charizardite-y': { pokemon: 'charizard', megaApiName: 'charizard-mega-y', megaName: 'mega-charizard-y' },
    'garchompite': { pokemon: 'garchomp', megaApiName: 'garchomp-mega', megaName: 'mega-garchomp' },
};
// Poke APIから取得できない場合のデフォルト値（2026-07時点でPoke API実データと突合済み）。
const DEFAULT_MEGA_STONES = {
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
};
export class MegaEvolutionSystem {
    megaStones;
    constructor(megaStones = DEFAULT_MEGA_STONES) {
        this.megaStones = megaStones;
        for (const [item, stone] of Object.entries(this.megaStones)) {
            this.validateStatBoosts(item, stone.statBoosts);
        }
    }
    validateStatBoosts(item, statBoosts) {
        const total = MEGA_STAT_KEYS.reduce((sum, key) => sum + statBoosts[key], 0);
        if (total !== MEGA_STAT_TOTAL) {
            throw new Error(`メガシンカの種族値配分が不正です: ${item} の合計は${total}（期待値${MEGA_STAT_TOTAL}）`);
        }
    }
    // Poke APIからメガ進化前後の種族値を取得し、差分(statBoosts)・タイプ・特性を
    // 実データから算出してMegaEvolutionSystemを構築する。item→ポケモン名の対応表(seeds)
    // 自体はPoke API側に構造化データがないため静的に渡す必要がある。
    static async fromPokeApi(fetcher, seeds = MEGA_STONE_SEEDS) {
        const megaStones = {};
        for (const [item, seed] of Object.entries(seeds)) {
            const [base, mega] = await Promise.all([
                fetcher.fetchPokemonData(seed.pokemon),
                fetcher.fetchPokemonData(seed.megaApiName),
            ]);
            if (base.baseStats.HP !== mega.baseStats.HP) {
                throw new Error(`メガシンカでHPが変化するデータを検出しました: ${item} (${base.baseStats.HP} -> ${mega.baseStats.HP})`);
            }
            const statBoosts = Object.fromEntries(MEGA_STAT_KEYS.map((stat) => [stat, mega.baseStats[stat] - base.baseStats[stat]]));
            megaStones[item] = {
                pokemon: seed.pokemon,
                megaName: seed.megaName,
                typeChange: mega.types,
                abilityChange: mega.abilities[0]?.name ?? base.abilities[0]?.name ?? '',
                statBoosts,
            };
        }
        return new MegaEvolutionSystem(megaStones);
    }
    canMegaEvolve(pokemon) {
        if (pokemon.isMega)
            return false;
        if (!pokemon.item)
            return false;
        const stone = this.megaStones[pokemon.item];
        if (!stone)
            return false;
        if (stone.pokemon !== pokemon.baseName)
            return false;
        return true;
    }
    megaEvolve(pokemon) {
        if (!this.canMegaEvolve(pokemon)) {
            throw new Error(`${pokemon.name}はメガシンカできません`);
        }
        const stone = this.megaStones[pokemon.item];
        pokemon.baseName = pokemon.name;
        pokemon.name = stone.megaName;
        pokemon.types = [...stone.typeChange];
        pokemon.ability = stone.abilityChange;
        pokemon.isMega = true;
        // メガシンカはHPを変化させない（本編仕様のため対象から除外）。
        // Lv.50固定では計算式の種族値項の係数が(2*50/100=1)になるため、
        // 種族値への加算をLv.50時点の実数値へそのまま加算しても結果が一致する。
        for (const stat of MEGA_STAT_KEYS) {
            pokemon.baseStats[stat] += stone.statBoosts[stat];
            pokemon.stats[stat] += stone.statBoosts[stat];
        }
        return true;
    }
}
//# sourceMappingURL=mega-evolution.js.map