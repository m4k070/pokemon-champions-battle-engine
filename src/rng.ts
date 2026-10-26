// 乱数の供給源。
// 命中・追加効果・多段ヒット数・同速の並びといった結果はすべてここを経由させる。
// Math.random を直接呼ぶと seed を固定できず、同じ局面から分岐を比べられないため。
export interface RandomSource {
  /** 0以上1未満の一様乱数。 */
  next(): number;
  /**
   * 内部状態。snapshot/undo/fork をまたいで乱数列を継続させるために保存する。
   * 再現できない供給源（システム乱数）は null を返す。
   */
  getState(): number | null;
  /** getState で取り出した状態に戻す。null は何もしない。 */
  setState(state: number | null): void;
}

// seed から決定的に数列を生成する（mulberry32）。
// 状態が32bit整数ひとつなので、スナップショットへの保存と復元が軽い。
// 暗号用途ではない（探索・テスト用途を想定）。
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number | null): void {
    if (state === null) return;
    this.state = state >>> 0;
  }
}

// 既定の供給源。再現できないため状態は持たない（実戦の審判用途はこちらで足りる）。
export class SystemRandom implements RandomSource {
  next(): number {
    return Math.random();
  }

  getState(): number | null {
    return null;
  }

  setState(): void {
    // 再現不能な供給源なので復元する状態が無い。
  }
}

export const SYSTEM_RANDOM: RandomSource = new SystemRandom();

// seed を固定した供給源を作る。探索・テストの入口。
export function seededRandom(seed: number): RandomSource {
  return new SeededRandom(seed);
}
