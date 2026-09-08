// Per-pixel destructible terrain. A solid-mask Uint8Array is the source of truth
// for collision; an offscreen canvas mirrors it for rendering. Explosions carve
// real craters into both.

import { Rng } from './rng';
import { TerrainParams } from './session';

export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly jaggedness: number;
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  private mask: Uint8Array; // 1 = solid
  /**
   * topmost solid y per column (== height for an empty column). surfaceAt() is
   * called every frame for the avatar and for every grounded enemy, so the
   * answer is precomputed here instead of rescanning the column each time.
   * carve() only ever REMOVES mass, so an entry can only move downward.
   */
  private surfaceY: Uint16Array;

  constructor(params: TerrainParams) {
    this.width = params.width;
    this.height = params.height;
    this.jaggedness = params.jaggedness;
    this.mask = new Uint8Array(this.width * this.height);
    this.surfaceY = new Uint16Array(this.width);
    this.canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(this.width, this.height)
      : (() => { const c = document.createElement('canvas'); c.width = this.width; c.height = this.height; return c; })();
    this.ctx = this.canvas.getContext('2d') as any;
    this.generate(new Rng(params.seed));
  }

  private generate(rng: Rng): void {
    // midpoint-displacement heightline; jaggedness controls displacement decay
    const n = 257;
    const heights = new Float32Array(n);
    heights[0] = this.height * rng.range(0.45, 0.7);
    heights[n - 1] = this.height * rng.range(0.45, 0.7);
    let step = n - 1;
    let disp = this.height * (0.18 + this.jaggedness * 0.30);
    while (step > 1) {
      for (let i = 0; i < n - 1; i += step) {
        const mid = i + step / 2;
        heights[mid] = (heights[i] + heights[i + step]) / 2 + rng.range(-disp, disp);
      }
      step /= 2;
      disp *= 0.5 + this.jaggedness * 0.12; // jaggeder sessions decay slower
    }
    // clamp so tanks always have somewhere to stand
    const minY = this.height * 0.28;
    const maxY = this.height * 0.88;
    for (let i = 0; i < n; i++) heights[i] = Math.max(minY, Math.min(maxY, heights[i]));

    // fill the mask below the surface line
    for (let x = 0; x < this.width; x++) {
      const t = (x / (this.width - 1)) * (n - 1);
      const i = Math.floor(t);
      const frac = t - i;
      const surf = Math.round(heights[i] * (1 - frac) + heights[Math.min(i + 1, n - 1)] * frac);
      for (let y = surf; y < this.height; y++) this.mask[y * this.width + x] = 1;
    }

    // paint: dark memory-block ground with a phosphor edge and corrupted speckles
    const img = this.ctx.createImageData(this.width, this.height);
    const d = img.data;
    for (let x = 0; x < this.width; x++) {
      let surfaceY = -1;
      for (let y = 0; y < this.height; y++) {
        if (this.mask[y * this.width + x]) { surfaceY = y; break; }
      }
      this.surfaceY[x] = surfaceY < 0 ? this.height : surfaceY;
      if (surfaceY < 0) continue;
      for (let y = surfaceY; y < this.height; y++) {
        const p = (y * this.width + x) * 4;
        const depth = (y - surfaceY);
        if (depth < 3) {
          d[p] = 126; d[p + 1] = 231; d[p + 2] = 135; d[p + 3] = 255; // phosphor top edge
        } else {
          const band = Math.floor(y / 14) % 2 === 0 ? 5 : 0; // faint memory-row banding
          d[p] = 24 + band; d[p + 1] = 42 + band; d[p + 2] = 30 + band; d[p + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(img, 0, 0);

    // corrupted glyph speckles buried in the ground
    const speckleRng = new Rng(rng.int(0, 0xffffff));
    this.ctx.font = '10px monospace';
    const glyphs = ['0', '1', '▓', '░', '╳', 'e', 'f', '?'];
    for (let i = 0; i < this.width / 10; i++) {
      const x = speckleRng.int(0, this.width - 1);
      const y = speckleRng.int(0, this.height - 1);
      if (this.solidAt(x, y) && this.solidAt(x, y - 8)) {
        this.ctx.fillStyle = speckleRng.chance(0.7) ? 'rgba(90,150,100,0.35)' : 'rgba(255,148,64,0.25)';
        this.ctx.fillText(speckleRng.pick(glyphs), x, y);
      }
    }
  }

  solidAt(x: number, y: number): boolean {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= this.width) return false;
    if (yi >= this.height) return true; // bottom of the world is solid
    if (yi < 0) return false;
    return this.mask[yi * this.width + xi] === 1;
  }

  /** topmost solid y at column x (or height if column is empty) */
  surfaceAt(x: number): number {
    const xi = Math.max(0, Math.min(this.width - 1, Math.round(x)));
    return this.surfaceY[xi];
  }

  /** carve a crater: update mask + rendered canvas, leave a scorched rim */
  carve(cx: number, cy: number, r: number): void {
    // DATA CORRUPTION, not artillery craters: terrain is deleted in blocky
    // 6px cells with jittered ragged edges (a chunk of the buffer got freed),
    // and surviving edge cells keep faint corrupted-glyph residue.
    const CELL = 6;
    const r2 = r * r;
    const ctx = this.ctx as CanvasRenderingContext2D;
    const seed = new Rng(((Math.round(cx) * 7919 + Math.round(cy)) >>> 0) || 1);
    const edgeCells: Array<{ x: number; y: number }> = [];

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const c0x = Math.floor((cx - r) / CELL), c1x = Math.ceil((cx + r) / CELL);
    const c0y = Math.floor((cy - r) / CELL), c1y = Math.ceil((cy + r) / CELL);
    for (let gy = c0y; gy <= c1y; gy++) {
      for (let gx = c0x; gx <= c1x; gx++) {
        const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
        const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
        if (d2 > r2) continue;
        const edge = d2 > r2 * 0.55;
        // ~40% of rim cells survive, making the hole blocky and ragged
        if (edge && seed.chance(0.4)) { edgeCells.push({ x: px, y: py }); continue; }
        for (let y = Math.max(0, gy * CELL); y < Math.min(this.height, (gy + 1) * CELL); y++) {
          for (let x = Math.max(0, gx * CELL); x < Math.min(this.width, (gx + 1) * CELL); x++) {
            this.mask[y * this.width + x] = 0;
          }
        }
        ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }
    ctx.restore();

    // resettle the surface table over the columns this crater touched. carving
    // only removes mass, so each column's surface can only fall — resume the
    // scan where it used to sit instead of starting over at the top.
    const x0 = Math.max(0, c0x * CELL);
    const x1 = Math.min(this.width - 1, (c1x + 1) * CELL - 1);
    for (let x = x0; x <= x1; x++) {
      let y = this.surfaceY[x];
      while (y < this.height && this.mask[y * this.width + x] === 0) y++;
      this.surfaceY[x] = y;
    }

    // corrupted residue on surviving edge cells — freed memory, not scorch
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.font = '7px monospace';
    const glyphs = ['▒', '░', '0', '1', 'x', '?'];
    for (const cell of edgeCells) {
      if (!this.solidAt(cell.x, cell.y)) continue;
      ctx.fillStyle = seed.chance(0.6) ? 'rgba(244,112,103,0.5)' : 'rgba(126,231,135,0.35)';
      ctx.fillText(seed.pick(glyphs), cell.x - 3, cell.y + 3);
    }
    ctx.restore();
  }
}
