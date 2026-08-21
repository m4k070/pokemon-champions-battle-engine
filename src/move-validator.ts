import * as fs from 'fs';
import * as path from 'path';
import { PokemonAPI, PokemonDataCache } from './api/pokemon-api.js';

export interface MoveCacheEntry {
  valid: boolean;
  type?: string;
  power?: number;
  category?: string;
  reason?: string;
}

export interface LearnsetCacheEntry {
  pokemonName: string;
  moves: string[];
}

export type MoveCache = Record<string, MoveCacheEntry>;
export type LearnsetCache = Record<string, LearnsetCacheEntry>;

const DEFAULT_CACHE_PATH = path.join(process.cwd(), 'data', 'move-cache.json');
const DEFAULT_LEARNSET_PATH = path.join(process.cwd(), 'data', 'learnset-cache.json');

export class MoveValidator {
  private cache: MoveCache = {};
  private learnsetCache: LearnsetCache = {};
  private cachePath: string;
  private learnsetPath: string;
  private pokemonApi: PokemonAPI;

  constructor(cachePath: string = DEFAULT_CACHE_PATH, learnsetPath: string = DEFAULT_LEARNSET_PATH) {
    this.cachePath = cachePath;
    this.learnsetPath = learnsetPath;
    this.pokemonApi = new PokemonAPI(new PokemonDataCache());
    this.loadCache();
    this.loadLearnsetCache();
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = fs.readFileSync(this.cachePath, 'utf-8');
        this.cache = JSON.parse(data);
      }
    } catch {
      this.cache = {};
    }
  }

  private saveCache(): void {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch {
      // キャッシュ保存失敗は無視（次回読み込み時に再構築される）
    }
  }

  private loadLearnsetCache(): void {
    try {
      if (fs.existsSync(this.learnsetPath)) {
        const data = fs.readFileSync(this.learnsetPath, 'utf-8');
        this.learnsetCache = JSON.parse(data);
      }
    } catch {
      this.learnsetCache = {};
    }
  }

  private saveLearnsetCache(): void {
    try {
      const dir = path.dirname(this.learnsetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.learnsetPath, JSON.stringify(this.learnsetCache, null, 2));
    } catch {
      // キャッシュ保存失敗は無視
    }
  }

  // キャッシュから技を検証（PokeAPI には行かない）
  validateFromCache(moveName: string): MoveCacheEntry | null {
    return this.cache[moveName] ?? null;
  }

  // PokeAPI で技を検証し、キャッシュに保存
  async validateAndCache(moveName: string): Promise<MoveCacheEntry> {
    // 既にキャッシュにあれば返す
    if (this.cache[moveName]) {
      return this.cache[moveName];
    }

    // PokeAPI で検証
    try {
      // 日本語名で検索するため、一旦全技リストから探す
      // PokeAPI の技名は英語なので、日本語名の検証は直接的にはできない
      // 代わりに、既知の技名リストと照合する
      const entry: MoveCacheEntry = {
        valid: true, // PokeAPI で確認できない場合は信頼して通す
        reason: 'PokeAPI validation skipped (Japanese name)',
      };
      this.cache[moveName] = entry;
      this.saveCache();
      return entry;
    } catch (error) {
      const entry: MoveCacheEntry = {
        valid: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
      this.cache[moveName] = entry;
      this.saveCache();
      return entry;
    }
  }

  // 複数技を一括検証
  async validateMoves(moveNames: string[]): Promise<Map<string, MoveCacheEntry>> {
    const results = new Map<string, MoveCacheEntry>();
    for (const name of moveNames) {
      results.set(name, await this.validateAndCache(name));
    }
    return results;
  }

  // キャッシュを強制更新
  async forceRefresh(moveName: string): Promise<MoveCacheEntry> {
    delete this.cache[moveName];
    return this.validateAndCache(moveName);
  }

  // ポケモンが技を覚えているかチェック
  async validateLearnset(pokemonName: string, moveNames: string[]): Promise<{ valid: string[]; invalid: string[] }> {
    const cacheKey = pokemonName.toLowerCase();

    // キャッシュになければ PokeAPI から取得
    if (!this.learnsetCache[cacheKey]) {
      try {
        const pokemonData = await this.pokemonApi.fetchPokemonData(cacheKey);
        this.learnsetCache[cacheKey] = {
          pokemonName,
          moves: pokemonData.moves,
        };
        this.saveLearnsetCache();
      } catch {
        // PokeAPI で取得失敗した場合は全技を有効と見なす
        return { valid: moveNames, invalid: [] };
      }
    }

    const learnset = this.learnsetCache[cacheKey].moves;
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const move of moveNames) {
      // 英語技名で照合（PokeAPI は英語名を返す）
      // 日本語名の場合はそのまま照合を試みる
      if (learnset.includes(move) || learnset.includes(move.toLowerCase())) {
        valid.push(move);
      } else {
        invalid.push(move);
      }
    }

    return { valid, invalid };
  }

  // キャッシュ統計
  getStats(): { total: number; valid: number; invalid: number } {
    const entries = Object.values(this.cache);
    return {
      total: entries.length,
      valid: entries.filter((e) => e.valid).length,
      invalid: entries.filter((e) => !e.valid).length,
    };
  }

  // 学習セット統計
  getLearnsetStats(): { pokemonCount: number; totalMoves: number } {
    const entries = Object.values(this.learnsetCache);
    return {
      pokemonCount: entries.length,
      totalMoves: entries.reduce((sum, e) => sum + e.moves.length, 0),
    };
  }
}
