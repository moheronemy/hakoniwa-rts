/**
 * シード付きの乱数（mulberry32）。
 * 状態は32bit整数ひとつで、GameState に保存して同じ結果を再現できるようにする。
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** 0 以上 1 未満 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 0 以上 n 未満の整数。n <= 0 なら 0 */
  int(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  }

  /** 0..n-1 をシャッフルした配列 */
  permutation(n: number): number[] {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}
