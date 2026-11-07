import { baseLevel } from '../engine/island';
import { monsterOf } from '../engine/monsters';
import type { Tile } from '../engine/types';
import { PALETTE, SIZE, spriteKey, SPRITES } from './sprites';

/** 1マスの大きさ（画面上のピクセル）。ドット絵は 16×16 を2倍にして描く */
export const TILE = 32;

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, HTMLCanvasElement>();

/** ドット絵を 16×16 のキャンバスに一度だけ描いて取っておく */
function spriteImage(key: string, colors?: Record<string, string>): HTMLCanvasElement {
  const cacheKey = colors ? `${key}:${colors.X ?? ''}` : key;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const sprite = SPRITES[key] ?? SPRITES.waste!;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  sprite.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = colors?.[ch] ?? PALETTE[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  cache.set(cacheKey, canvas);
  return canvas;
}

/** 発電所・研究所・基地の段階を、右下に小さな点で示す */
function drawLevel(ctx: Ctx, ox: number, oy: number, level: number): void {
  for (let i = 0; i < level; i++) {
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(ox + 26 - i * 5, oy + 26, 5, 5);
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(ox + 27 - i * 5, oy + 27, 3, 3);
  }
}

/** 怪獣の体力を、下に小さな赤い点で示す */
function drawHp(ctx: Ctx, ox: number, oy: number, hp: number): void {
  for (let i = 0; i < Math.min(hp, 10); i++) {
    ctx.fillStyle = '#e53935';
    ctx.fillRect(ox + 1 + i * 3, oy + 30, 2, 2);
  }
}

export function drawTile(ctx: Ctx, tile: Tile, ox: number, oy: number): void {
  const monster = tile.kind === 'monster' ? monsterOf(tile) : null;
  const { key, colors } = spriteKey(tile, monster ? { id: monster.def.id, stage: monster.def.stage } : undefined);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spriteImage(key, colors), ox, oy, TILE, TILE);

  switch (tile.kind) {
    case 'windPower':
    case 'hydroPower':
    case 'thermalPower':
    case 'nuclearPower':
    case 'lab':
      drawLevel(ctx, ox, oy, tile.value);
      break;
    case 'missileBase':
    case 'seaBase':
      drawLevel(ctx, ox, oy, baseLevel(tile));
      break;
    case 'monster':
      drawHp(ctx, ox, oy, monster!.hp);
      break;
    default:
      break;
  }
}
