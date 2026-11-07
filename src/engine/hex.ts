/**
 * マスの並び：奇数行を半マス右にずらした六角形の格子（odd-r）。
 * 正方形のタイルで描くときも、奇数行を半マスずらして表示する。
 */

export interface Point {
  x: number;
  y: number;
}

const EVEN_ROW: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [-1, -1],
  [0, -1],
  [-1, 1],
  [0, 1],
];

const ODD_ROW: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [1, -1],
  [0, 1],
  [1, 1],
];

export function inBounds(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

/** 隣接する最大6マス（島の外は含めない） */
export function neighbors(size: number, x: number, y: number): Point[] {
  const offsets = y % 2 === 0 ? EVEN_ROW : ODD_ROW;
  const result: Point[] = [];
  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(size, nx, ny)) result.push({ x: nx, y: ny });
  }
  return result;
}
