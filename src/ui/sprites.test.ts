import { describe, expect, it } from 'vitest';
import type { TerrainKind } from '../engine/types';
import { PALETTE, SIZE, spriteKey, SPRITES } from './sprites';

describe('ドット絵', () => {
  it('どの絵も16×16で、色表にある文字だけでできている', () => {
    for (const [key, sprite] of Object.entries(SPRITES)) {
      expect(sprite, key).toHaveLength(SIZE);
      for (const row of sprite) {
        expect(row.length, `${key}: ${row}`).toBe(SIZE);
        for (const ch of row) expect(PALETTE[ch], `${key} の文字 ${ch}`).toBeDefined();
      }
    }
  });

  it('すべての地形に絵がある', () => {
    const kinds: TerrainKind[] = [
      'deepSea', 'shallow', 'waste', 'plains', 'forest', 'mountain', 'town', 'farm', 'factory', 'oilField',
      'windPower', 'hydroPower', 'thermalPower', 'nuclearPower', 'lab', 'missileBase', 'seaBase', 'interceptor',
      'monster', 'wall', 'monsterLab',
    ];
    for (const kind of kinds) {
      for (const value of [1, 50, 150]) {
        const { key } = spriteKey({ kind, value });
        expect(SPRITES[key], `${kind}(${value}) → ${key}`).toBeDefined();
      }
    }
  });
});
