import * as fs from 'fs';
import * as path from 'path';
import { PokemonAPI, PokemonDataCache } from './api/pokemon-api.js';
import type { MoveCategory, TypeName } from './types.js';

// 技名の検証結果。
// 「有効と確認できた」と「検証そのものができなかった」を区別する点が重要で、
// 1つの valid フラグにまとめると、未検証の技が有効な技として素通りしてしまう。
export type MoveCacheEntry =
  // Poke API で技として確認でき、技情報も取得できた。
  | { status: 'valid'; type: TypeName; power: number; category: MoveCategory }
  // Poke API に存在しない技だと判定された。
  | { status: 'invalid'; reason: string }
  // 検証を実行できなかった（日本語名のため Poke API と照合できない等）。
  | { status: 'unverified'; reason: string };

// 検証済みで有効と確認できた技か。
export function isValidMove(
  entry: MoveCacheEntry
): entry is Extract<MoveCacheEntry, { status: 'valid' }> {
  return entry.status === 'valid';
}

// 有効だと確認できていない技か（無効と判定された技と、検証できなかった技）。
// 呼び出し側が警告を出すかどうかの判断に使う。
export function isUnconfirmedMove(entry: MoveCacheEntry): boolean {
  return entry.status !== 'valid';
}

export interface LearnsetCacheEntry {
  pokemonName: string;
  moves: string[];
}

export type MoveCache = Record<string, MoveCacheEntry>;
export type LearnsetCache = Record<string, LearnsetCacheEntry>;

// キャッシュファイルは外部データ（過去の形式や手書きの内容もありうる）なので、
// 読み込み時に形式を検証する。判別できないエントリは捨てて検証し直す。
function parseMoveCacheEntry(raw: unknown): MoveCacheEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;

  if (entry.status === 'valid') {
    const { type, power, category } = entry;
    if (typeof type !== 'string' || typeof power !== 'number' || typeof category !== 'string') {
      return null;
    }
    return { status: 'valid', type: type as TypeName, power, category: category as MoveCategory };
  }

  if (entry.status === 'invalid' || entry.status === 'unverified') {
    const reason = typeof entry.reason === 'string' ? entry.reason : '';
    return { status: entry.status, reason };
  }

  return null;
}

function parseMoveCache(raw: unknown): MoveCache {
  if (typeof raw !== 'object' || raw === null) return {};

  const cache: MoveCache = {};
  for (const [moveName, rawEntry] of Object.entries(raw)) {
    const entry = parseMoveCacheEntry(rawEntry);
    if (entry !== null) cache[moveName] = entry;
  }
  return cache;
}

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
        this.cache = parseMoveCache(JSON.parse(data));
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

  // 技を検証してキャッシュに保存する。
  // Poke API の技名は英語だが、このエンジンは日本語の技名も受け付けるため、
  // 現時点では照合できず 'unverified' を返す（技名から技情報を引く実装は未対応）。
  // 有効と確認できていないことが status に現れるので、呼び出し側は警告を出せる。
  async validateAndCache(moveName: string): Promise<MoveCacheEntry> {
    const cached = this.cache[moveName];
    if (cached !== undefined) {
      return cached;
    }

    const entry: MoveCacheEntry = {
      status: 'unverified',
      reason: 'Poke API は英語の技名しか引けないため照合していない',
    };
    this.cache[moveName] = entry;
    this.saveCache();
    return entry;
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

  // キャッシュ統計。未検証の技は valid にも invalid にも数えない。
  getStats(): { total: number; valid: number; invalid: number; unverified: number } {
    const entries = Object.values(this.cache);
    return {
      total: entries.length,
      valid: entries.filter((e) => e.status === 'valid').length,
      invalid: entries.filter((e) => e.status === 'invalid').length,
      unverified: entries.filter((e) => e.status === 'unverified').length,
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
