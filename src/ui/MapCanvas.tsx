import { useEffect, useRef } from 'react';
import type { Island, Tile } from '../engine/types';
import { drawTile, TILE } from './tileArt';

export interface MapMarker {
  x: number;
  y: number;
  label: string;
}

interface Props {
  island: Island;
  selected: { x: number; y: number } | null;
  onSelect: (x: number, y: number) => void;
  /** マスの上に出す小さな印（予約の順番など） */
  markers: MapMarker[];
  /** 表示するマスに変える（他の島では基地を隠す） */
  display?: (tile: Tile) => Tile;
  /** 滅亡した島などを暗く表示する */
  dimmed?: boolean;
}

const HALF = TILE / 2;

/** 奇数行を半マス右にずらして描く */
function rowOffset(y: number): number {
  return y % 2 === 1 ? HALF : 0;
}

export function MapCanvas({ island, selected, onSelect, markers, display, dimmed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = island.size * TILE + HALF;
  const height = island.size * TILE;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1e4f91'; // 半マスずらした行の隙間も海の色で埋める
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < island.size; y++) {
      for (let x = 0; x < island.size; x++) {
        const tile = island.tiles[y * island.size + x]!;
        drawTile(ctx, display ? display(tile) : tile, x * TILE + rowOffset(y), y * TILE);
      }
    }

    for (const marker of markers) {
      const ox = marker.x * TILE + rowOffset(marker.y);
      const oy = marker.y * TILE;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(ox + 1, oy + 1, 15, 11);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(marker.label, ox + 3, oy + 2);
    }

    if (dimmed) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, width, height);
    }

    if (selected) {
      const ox = selected.x * TILE + rowOffset(selected.y);
      const oy = selected.y * TILE;
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
    }
  }, [island, selected, width, height, markers, display, dimmed]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = width / rect.width;
    const px = (event.clientX - rect.left) * scale;
    const py = (event.clientY - rect.top) * (height / rect.height);
    const y = Math.floor(py / TILE);
    const x = Math.floor((px - rowOffset(y)) / TILE);
    if (x >= 0 && y >= 0 && x < island.size && y < island.size) onSelect(x, y);
  };

  return (
    <canvas
      ref={canvasRef}
      className="map"
      width={width}
      height={height}
      onClick={handleClick}
      aria-label={`${island.name}のマップ`}
    />
  );
}
