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

/** odd-r の座標を cube 座標に直す */
function toCube(x: number, y: number): [number, number, number] {
  const q = x - (y - (y & 1)) / 2;
  return [q, y, -q - y];
}

/** 2つのマスの距離（隣なら1） */
export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  const [aq, ar, as] = toCube(ax, ay);
  const [bq, br, bs] = toCube(bx, by);
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/**
 * (x, y) から距離 range 以内のマス。島の外のマスも含める（ミサイルが島の外に落ちることがあるため）。
 * range 0 なら1マス、1 なら7マス、2 なら19マス。
 */
export function cellsWithin(x: number, y: number, range: number): Point[] {
  const result: Point[] = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range - 1; dx <= range + 1; dx++) {
      if (hexDistance(x, y, x + dx, y + dy) <= range) result.push({ x: x + dx, y: y + dy });
    }
  }
  return result;
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
