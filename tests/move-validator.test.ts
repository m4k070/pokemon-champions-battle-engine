import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MoveValidator, isUnconfirmedMove, isValidMove } from '../src/move-validator.js';
import type { MoveCacheEntry } from '../src/move-validator.js';

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
    const validator = new MoveValidator(cachePath, learnsetPath);

    // Assert
    expect(validator.getStats()).toEqual({ total: 3, valid: 1, invalid: 1, unverified: 1 });
  });

  test('旧形式（valid フラグ）のエントリは捨てられる', () => {
    // Arrange: status を持たない過去の形式
    writeCache({ tackle: { valid: true, reason: 'PokeAPI validation skipped' } });

    // Act
    const validator = new MoveValidator(cachePath, learnsetPath);

    // Assert: 判別できないので取り込まず、検証し直しの対象になる
    expect(validator.getStats().total).toBe(0);
    expect(validator.validateFromCache('tackle')).toBeNull();
  });

  test('必要な値が欠けた valid エントリは捨てられる', () => {
    writeCache({ surf: { status: 'valid', type: 'water' } });

    const validator = new MoveValidator(cachePath, learnsetPath);

    expect(validator.validateFromCache('surf')).toBeNull();
  });

  test('壊れたJSONでも空のキャッシュとして扱う', () => {
    fs.writeFileSync(cachePath, '{ not json');

    const validator = new MoveValidator(cachePath, learnsetPath);

    expect(validator.getStats().total).toBe(0);
  });
});

describe('validateAndCache', () => {
  test('照合できない技は unverified として記録される（有効とは区別する）', async () => {
    // Arrange
    const validator = new MoveValidator(cachePath, learnsetPath);

    // Act
    const entry = await validator.validateAndCache('なみのり');

    // Assert
    expect(entry.status).toBe('unverified');
    expect(isValidMove(entry)).toBe(false);
    expect(isUnconfirmedMove(entry)).toBe(true);
  });

  test('検証結果はキャッシュファイルに永続化される', async () => {
    const validator = new MoveValidator(cachePath, learnsetPath);

    await validator.validateAndCache('なみのり');

    const reloaded = new MoveValidator(cachePath, learnsetPath);
    expect(reloaded.validateFromCache('なみのり')).toMatchObject({ status: 'unverified' });
  });

  test('キャッシュ済みの技は再検証しない', async () => {
    // Arrange: 有効と分かっている技を先に置いておく
    writeCache({ surf: { status: 'valid', type: 'water', power: 90, category: 'special' } });
    const validator = new MoveValidator(cachePath, learnsetPath);

    // Act
    const entry = await validator.validateAndCache('surf');

    // Assert: unverified で上書きされない
    expect(entry).toEqual({ status: 'valid', type: 'water', power: 90, category: 'special' });
  });

  test('forceRefresh はキャッシュを捨てて検証し直す', async () => {
    writeCache({ surf: { status: 'valid', type: 'water', power: 90, category: 'special' } });
    const validator = new MoveValidator(cachePath, learnsetPath);

    const entry = await validator.forceRefresh('surf');

    expect(entry.status).toBe('unverified');
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
