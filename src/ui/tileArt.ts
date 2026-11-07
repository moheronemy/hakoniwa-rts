import { baseLevel } from '../engine/island';
import { monsterOf } from '../engine/monsters';
import { RULES } from '../engine/rules';
import type { Tile } from '../engine/types';

/**
 * 仮のドット絵。1マス32px。後で画像に差し替える前提で、塗りつぶしと小さな四角だけで描く。
 */
export const TILE = 32;

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function base(ctx: Ctx, ox: number, oy: number, color: string): void {
  px(ctx, color, ox, oy, TILE, TILE);
}

function grass(ctx: Ctx, ox: number, oy: number): void {
  base(ctx, ox, oy, '#8bc34a');
  px(ctx, '#7cb342', ox + 5, oy + 7, 2, 2);
  px(ctx, '#7cb342', ox + 22, oy + 12, 2, 2);
  px(ctx, '#7cb342', ox + 12, oy + 25, 2, 2);
}

function house(ctx: Ctx, x: number, y: number, wall: string, roof: string): void {
  px(ctx, roof, x, y, 8, 3);
  px(ctx, wall, x + 1, y + 3, 6, 5);
  px(ctx, '#5d4037', x + 3, y + 5, 2, 3);
}

/** 怪獣の体の色（種類ごと） */
const MONSTER_COLORS: Record<string, string> = {
  m1: '#8d6e63',
  m2: '#78909c',
  m3: '#ef6c00',
  m4: '#5c6bc0',
  m5: '#66bb6a',
  m6: '#455a64',
  m7: '#c62828',
  m8: '#6a1b9a',
};

/** 仮の怪獣：荒地の上に、種類ごとの色のずんぐりした体と目。強い段階ほど角が増える */
function drawMonster(ctx: Ctx, tile: Tile, ox: number, oy: number): void {
  const { def, hp } = monsterOf(tile);
  base(ctx, ox, oy, '#b39a6b');
  const body = MONSTER_COLORS[def.id] ?? '#795548';
  px(ctx, body, ox + 7, oy + 10, 18, 16);
  px(ctx, body, ox + 9, oy + 6, 14, 4);
  px(ctx, body, ox + 8, oy + 26, 5, 4);
  px(ctx, body, ox + 19, oy + 26, 5, 4);
  px(ctx, '#ffffff', ox + 11, oy + 12, 4, 4);
  px(ctx, '#ffffff', ox + 18, oy + 12, 4, 4);
  px(ctx, '#000000', ox + 13, oy + 13, 2, 2);
  px(ctx, '#000000', ox + 20, oy + 13, 2, 2);
  for (let i = 0; i < def.stage; i++) px(ctx, '#fff59d', ox + 9 + i * 4, oy + 3, 2, 3);
  // 体力を下に小さく
  for (let i = 0; i < Math.min(hp, 10); i++) px(ctx, '#e53935', ox + 2 + i * 3, oy + 30, 2, 2);
}

/** 発電所や研究所の段階を、右下に小さな点で示す */
function drawLevel(ctx: Ctx, ox: number, oy: number, level: number): void {
  for (let i = 0; i < level; i++) px(ctx, '#ffeb3b', ox + 27 - i * 4, oy + 27, 3, 3);
}

function tree(ctx: Ctx, x: number, y: number): void {
  px(ctx, '#2e7d32', x + 2, y, 4, 2);
  px(ctx, '#2e7d32', x + 1, y + 2, 6, 3);
  px(ctx, '#1b5e20', x, y + 5, 8, 3);
  px(ctx, '#6d4c41', x + 3, y + 8, 2, 3);
}

export function drawTile(ctx: Ctx, tile: Tile, ox: number, oy: number): void {
  switch (tile.kind) {
    case 'deepSea':
      base(ctx, ox, oy, '#1e4f91');
      px(ctx, '#2a63ab', ox + 6, oy + 10, 6, 2);
      px(ctx, '#2a63ab', ox + 18, oy + 22, 6, 2);
      break;
    case 'shallow':
      base(ctx, ox, oy, '#4a90d0');
      px(ctx, '#6aa9e0', ox + 8, oy + 14, 6, 2);
      px(ctx, '#6aa9e0', ox + 20, oy + 6, 5, 2);
      break;
    case 'waste':
      base(ctx, ox, oy, '#b39a6b');
      px(ctx, '#957d52', ox + 6, oy + 8, 3, 2);
      px(ctx, '#957d52', ox + 20, oy + 18, 4, 2);
      px(ctx, '#957d52', ox + 12, oy + 26, 3, 2);
      break;
    case 'plains':
      grass(ctx, ox, oy);
      break;
    case 'forest': {
      grass(ctx, ox, oy);
      const trees = tile.value >= 50 ? 4 : tile.value >= 10 ? 3 : tile.value >= 3 ? 2 : 1;
      const spots = [
        [4, 4],
        [19, 6],
        [10, 17],
        [22, 19],
      ] as const;
      for (let i = 0; i < trees; i++) {
        const [x, y] = spots[i]!;
        tree(ctx, ox + x, oy + y);
      }
      break;
    }
    case 'mountain':
      base(ctx, ox, oy, '#8d8d8d');
      for (let row = 0; row < 12; row++) {
        px(ctx, '#6d6d6d', ox + 15 - row, oy + 8 + row * 2, 2 + row * 2, 2);
      }
      px(ctx, '#f5f5f5', ox + 13, oy + 8, 6, 4);
      break;
    case 'town': {
      grass(ctx, ox, oy);
      if (tile.value >= RULES.cityThreshold) {
        px(ctx, '#9e9e9e', ox + 4, oy + 8, 8, 20);
        px(ctx, '#bdbdbd', ox + 14, oy + 4, 7, 24);
        px(ctx, '#9e9e9e', ox + 23, oy + 12, 6, 16);
        for (let wy = 0; wy < 5; wy++) {
          px(ctx, '#fff59d', ox + 16, oy + 7 + wy * 4, 2, 2);
          px(ctx, '#fff59d', ox + 6, oy + 11 + wy * 3, 2, 1);
        }
      } else if (tile.value >= RULES.villageMax) {
        house(ctx, ox + 3, oy + 4, '#eeeeee', '#e53935');
        house(ctx, ox + 18, oy + 8, '#eeeeee', '#1e88e5');
        house(ctx, ox + 9, oy + 19, '#eeeeee', '#e53935');
      } else {
        house(ctx, ox + 12, oy + 12, '#f5e6c8', '#a1887f');
      }
      break;
    }
    case 'farm':
      base(ctx, ox, oy, '#c8a24a');
      for (let row = 0; row < 4; row++) {
        px(ctx, '#7cb342', ox + 2, oy + 3 + row * 8, 28, 3);
      }
      break;
    case 'factory':
      base(ctx, ox, oy, '#9e9e9e');
      px(ctx, '#616161', ox + 3, oy + 14, 26, 15);
      px(ctx, '#424242', ox + 20, oy + 4, 4, 10);
      px(ctx, '#bdbdbd', ox + 19, oy + 1, 6, 3);
      for (let i = 0; i < 4; i++) px(ctx, '#ffcc80', ox + 6 + i * 6, oy + 19, 3, 3);
      break;
    case 'oilField':
      base(ctx, ox, oy, '#1e4f91');
      px(ctx, '#37474f', ox + 6, oy + 20, 20, 6);
      px(ctx, '#90a4ae', ox + 14, oy + 4, 3, 16);
      px(ctx, '#90a4ae', ox + 10, oy + 10, 11, 2);
      px(ctx, '#ff7043', ox + 22, oy + 8, 4, 4);
      break;
    case 'windPower':
      grass(ctx, ox, oy);
      px(ctx, '#eceff1', ox + 15, oy + 10, 2, 20);
      px(ctx, '#eceff1', ox + 6, oy + 9, 10, 2);
      px(ctx, '#eceff1', ox + 16, oy + 2, 2, 9);
      px(ctx, '#eceff1', ox + 17, oy + 10, 9, 2);
      px(ctx, '#78909c', ox + 15, oy + 9, 3, 3);
      drawLevel(ctx, ox, oy, tile.value);
      break;
    case 'hydroPower':
      base(ctx, ox, oy, '#4a90d0');
      px(ctx, '#9e9e9e', ox + 2, oy + 10, 28, 12);
      px(ctx, '#bdbdbd', ox + 2, oy + 10, 28, 3);
      px(ctx, '#e3f2fd', ox + 8, oy + 22, 4, 8);
      px(ctx, '#e3f2fd', ox + 20, oy + 22, 4, 8);
      drawLevel(ctx, ox, oy, tile.value);
      break;
    case 'thermalPower':
      base(ctx, ox, oy, '#a1887f');
      px(ctx, '#6d4c41', ox + 3, oy + 16, 26, 13);
      px(ctx, '#bcaaa4', ox + 7, oy + 4, 5, 12);
      px(ctx, '#bcaaa4', ox + 18, oy + 6, 5, 10);
      px(ctx, '#e0e0e0', ox + 6, oy + 1, 7, 3);
      drawLevel(ctx, ox, oy, tile.value);
      break;
    case 'nuclearPower':
      grass(ctx, ox, oy);
      px(ctx, '#cfd8dc', ox + 6, oy + 12, 20, 16);
      px(ctx, '#cfd8dc', ox + 9, oy + 8, 14, 4);
      px(ctx, '#cfd8dc', ox + 12, oy + 5, 8, 3);
      px(ctx, '#fdd835', ox + 14, oy + 16, 4, 4);
      drawLevel(ctx, ox, oy, tile.value);
      break;
    case 'lab':
      grass(ctx, ox, oy);
      px(ctx, '#e8eaf6', ox + 4, oy + 12, 24, 16);
      px(ctx, '#5c6bc0', ox + 4, oy + 10, 24, 3);
      px(ctx, '#5c6bc0', ox + 13, oy + 4, 6, 6);
      for (let i = 0; i < 3; i++) px(ctx, '#7986cb', ox + 7 + i * 7, oy + 16, 4, 4);
      drawLevel(ctx, ox, oy, tile.value);
      break;
    case 'missileBase':
      grass(ctx, ox, oy);
      px(ctx, '#6d6d6d', ox + 4, oy + 22, 24, 7);
      px(ctx, '#eeeeee', ox + 14, oy + 6, 4, 16);
      px(ctx, '#e53935', ox + 14, oy + 3, 4, 3);
      px(ctx, '#9e9e9e', ox + 12, oy + 18, 8, 4);
      drawLevel(ctx, ox, oy, baseLevel(tile));
      break;
    case 'seaBase':
      base(ctx, ox, oy, '#1e4f91');
      px(ctx, '#0d2c55', ox + 5, oy + 14, 22, 10);
      px(ctx, '#eeeeee', ox + 14, oy + 6, 4, 8);
      px(ctx, '#e53935', ox + 14, oy + 4, 4, 2);
      drawLevel(ctx, ox, oy, baseLevel(tile));
      break;
    case 'interceptor':
      grass(ctx, ox, oy);
      px(ctx, '#546e7a', ox + 6, oy + 18, 20, 10);
      px(ctx, '#90a4ae', ox + 9, oy + 10, 14, 8);
      px(ctx, '#b0bec5', ox + 20, oy + 4, 3, 8);
      px(ctx, '#b0bec5', ox + 9, oy + 4, 3, 8);
      break;
    case 'monster':
      drawMonster(ctx, tile, ox, oy);
      break;
    case 'wall':
      base(ctx, ox, oy, '#9e9e9e');
      for (let row = 0; row < 4; row++) {
        const shift = row % 2 === 0 ? 0 : 4;
        for (let col = 0; col < 4; col++) px(ctx, '#757575', ox + shift + col * 8, oy + row * 8 + 7, 7, 1);
        px(ctx, '#757575', ox, oy + row * 8, 32, 1);
      }
      break;
    case 'monsterLab':
      grass(ctx, ox, oy);
      px(ctx, '#6a1b9a', ox + 4, oy + 12, 24, 16);
      px(ctx, '#8e24aa', ox + 8, oy + 6, 16, 6);
      px(ctx, '#e1bee7', ox + 10, oy + 16, 4, 4);
      px(ctx, '#e1bee7', ox + 18, oy + 16, 4, 4);
      px(ctx, '#ce93d8', ox + 14, oy + 2, 4, 4);
      break;
    default: {
      const unreachable: never = tile.kind;
      throw new Error(`描けない地形: ${String(unreachable)}`);
    }
  }
}
