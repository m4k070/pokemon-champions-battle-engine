import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MoveValidator, isUnconfirmedMove, isValidMove } from '../src/move-validator.js';
import type { MoveCacheEntry, MoveDataFetcher } from '../src/move-validator.js';
import { PokeApiError } from '../src/api/pokemon-api.js';
import type { PokeApiMoveData, PokeApiPokemonData } from '../src/api/pokemon-api.js';

// Poke API の代役。テストが外部へ通信しないようにする。
function createFetcher(
  fetchMoveData: (moveName: string) => Promise<PokeApiMoveData>
): MoveDataFetcher {
  return {
    fetchMoveData,
    fetchPokemonData: async (): Promise<PokeApiPokemonData> => {
      throw new Error('このテストではポケモンデータを取得しない');
    },
  };
}

const SURF_DATA: PokeApiMoveData = {
  name: 'surf', accuracy: 100, power: 90, pp: 15,
  type: 'water', category: 'special', priority: 0, effectChance: null,
};

// 存在しない技として 404 を返す代役。
const notFoundFetcher = () =>
  createFetcher(async (moveName) => {
    throw new PokeApiError(`Failed to fetch move ${moveName}: Not Found`, 404);
  });

// 通信できなかった代役。
const offlineFetcher = () =>
  createFetcher(async () => {
    throw new Error('fetch failed');
  });

// 技情報を返す代役。
const okFetcher = (data: PokeApiMoveData = SURF_DATA) => createFetcher(async () => data);

let tempDir: string;
let cachePath: string;
let learnsetPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'move-validator-'));
  cachePath = path.join(tempDir, 'move-cache.json');
  learnsetPath = path.join(tempDir, 'learnset-cache.json');
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function writeCache(content: unknown): void {
  fs.writeFileSync(cachePath, JSON.stringify(content));
}

describe('キャッシュファイルの読み込み: 外部データを境界で検証する', () => {
  test('新しい形式のエントリは読み込まれる', () => {
    // Arrange
    writeCache({
      surf: { status: 'valid', type: 'water', power: 90, category: 'special' },
      'made-up-move': { status: 'invalid', reason: 'not found' },
      'なみのり': { status: 'unverified', reason: '日本語名のため照合できない' },
    });

    // Act
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    // Assert
    expect(validator.getStats()).toEqual({ total: 3, valid: 1, invalid: 1, unverified: 1 });
  });

  test('旧形式（valid フラグ）のエントリは捨てられる', () => {
    // Arrange: status を持たない過去の形式
    writeCache({ tackle: { valid: true, reason: 'PokeAPI validation skipped' } });

    // Act
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    // Assert: 判別できないので取り込まず、検証し直しの対象になる
    expect(validator.getStats().total).toBe(0);
    expect(validator.validateFromCache('tackle')).toBeNull();
  });

  test('必要な値が欠けた valid エントリは捨てられる', () => {
    writeCache({ surf: { status: 'valid', type: 'water' } });

    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    expect(validator.validateFromCache('surf')).toBeNull();
  });

  test('壊れたJSONでも空のキャッシュとして扱う', () => {
    fs.writeFileSync(cachePath, '{ not json');

    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    expect(validator.getStats().total).toBe(0);
  });
});

describe('validateAndCache', () => {
  test('英語名でない技は照合できず unverified になる（有効とは区別する）', async () => {
    // Arrange
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    // Act
    const entry = await validator.validateAndCache('なみのり');

    // Assert
    expect(entry.status).toBe('unverified');
    expect(isValidMove(entry)).toBe(false);
    expect(isUnconfirmedMove(entry)).toBe(true);
  });

  test('検証結果はキャッシュファイルに永続化される', async () => {
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    await validator.validateAndCache('なみのり');

    const reloaded = new MoveValidator(cachePath, learnsetPath, okFetcher());
    expect(reloaded.validateFromCache('なみのり')).toMatchObject({ status: 'unverified' });
  });

  test('キャッシュ済みの技は再検証しない', async () => {
    // Arrange: 有効と分かっている技を先に置いておく
    writeCache({ surf: { status: 'valid', type: 'water', power: 90, category: 'special' } });
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    // Act
    const entry = await validator.validateAndCache('surf');

    // Assert: unverified で上書きされない
    expect(entry).toEqual({ status: 'valid', type: 'water', power: 90, category: 'special' });
  });

  test('forceRefresh はキャッシュを捨てて検証し直す', async () => {
    writeCache({ surf: { status: 'valid', type: 'water', power: 10, category: 'physical' } });
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    const entry = await validator.forceRefresh('surf');

    // 古い内容ではなく、Poke API から取り直した内容になる
    expect(entry).toEqual({ status: 'valid', type: 'water', power: 90, category: 'special' });
  });
});

describe('型ガード', () => {
  test('isValidMove は valid だけを通し、絞り込みで技情報を読める', () => {
    const entry: MoveCacheEntry = { status: 'valid', type: 'water', power: 90, category: 'special' };

    expect(isValidMove(entry)).toBe(true);
    if (!isValidMove(entry)) throw new Error('unreachable');
    expect(entry.power).toBe(90);
  });

  test('isUnconfirmedMove は invalid と unverified を通す', () => {
    expect(isUnconfirmedMove({ status: 'invalid', reason: 'not found' })).toBe(true);
    expect(isUnconfirmedMove({ status: 'unverified', reason: '照合できない' })).toBe(true);
    expect(isUnconfirmedMove({ status: 'valid', type: 'water', power: 90, category: 'special' })).toBe(false);
  });
});

describe('Poke API による技の検証', () => {
  test('英語名の技は Poke API に問い合わせ、技情報つきで valid になる', async () => {
    // Arrange
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher());

    // Act
    const entry = await validator.validateAndCache('surf');

    // Assert
    expect(entry).toEqual({ status: 'valid', type: 'water', power: 90, category: 'special' });
    expect(isValidMove(entry)).toBe(true);
  });

  test('変化技は power が null で返るため威力0として記録する', async () => {
    // Arrange
    const thunderWave: PokeApiMoveData = {
      name: 'thunder-wave', accuracy: 90, power: null, pp: 20,
      type: 'electric', category: 'status', priority: 0, effectChance: null,
    };
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher(thunderWave));

    // Act
    const entry = await validator.validateAndCache('thunder-wave');

    // Assert
    expect(entry).toEqual({ status: 'valid', type: 'electric', power: 0, category: 'status' });
  });

  test('Poke API が404を返した技は invalid になる', async () => {
    // Arrange
    const validator = new MoveValidator(cachePath, learnsetPath, notFoundFetcher());

    // Act
    const entry = await validator.validateAndCache('made-up-move');

    // Assert
    expect(entry).toMatchObject({ status: 'invalid' });
  });

  test('通信できなかった技は invalid ではなく unverified になる', async () => {
    // Arrange: 実在する技を通信障害で確認できなかった状況
    const validator = new MoveValidator(cachePath, learnsetPath, offlineFetcher());

    // Act
    const entry = await validator.validateAndCache('surf');

    // Assert: 無効と誤判定してはいけない
    expect(entry).toMatchObject({ status: 'unverified' });
    expect(isUnconfirmedMove(entry)).toBe(true);
  });

  test('未知のタイプ・分類が返ったら unverified になる', async () => {
    // Arrange: このエンジンの語彙にないタイプ
    const unknownType: PokeApiMoveData = {
      name: 'shadow-rush', accuracy: 100, power: 55, pp: 10,
      type: 'shadow', category: 'physical', priority: 0, effectChance: null,
    };
    const validator = new MoveValidator(cachePath, learnsetPath, okFetcher(unknownType));

    // Act
    const entry = await validator.validateAndCache('shadow-rush');

    // Assert
    expect(entry).toMatchObject({ status: 'unverified' });
  });

  test('日本語の技名は Poke API を呼ばずに unverified になる', async () => {
    // Arrange: 呼ばれたら失敗する代役を渡す
    let called = false;
    const validator = new MoveValidator(
      cachePath,
      learnsetPath,
      createFetcher(async () => {
        called = true;
        return SURF_DATA;
      })
    );

    // Act
    const entry = await validator.validateAndCache('なみのり');

    // Assert
    expect(called).toBe(false);
    expect(entry).toMatchObject({ status: 'unverified' });
  });
});
