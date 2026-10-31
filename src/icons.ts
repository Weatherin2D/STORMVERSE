/**
 * Windy draws weather symbols from masks. Radar and satellite share one
 * pattern (snow in the red channel, hail in the blue channel) and a
 * canvas-drawn lightning atlas. The Rain, thunder layer repeats two other
 * sheets: precipitation on ptype1, thunder on ptype2.
 */

/** Coverage, 0–255, row major. */
export interface IconMask {
    width: number;
    height: number;
    values: Uint8Array;
}

/** IDAT prefix of the embedded 64×64 radar pattern. A rebuilt PNG does not contain it. */
export const RADAR_PATTERN_TOKEN = 'AAAFgklEQVR42u2a';

export const RAIN_TEXTURE = 'ptype1_v4.png';
export const THUNDER_TEXTURE = 'ptype2_v4.png';

/** Radar and satellite repeat a symbol every 16 pixels inside the 64×64 pattern. */
export const RADAR_CELL = 16;

/** Rain and thunder sheets are a single symbol filling a 32×32 tile. */
export const SHEET_SIZE = 32;

export const ATLAS_WIDTH = 256;
export const ATLAS_HEIGHT = 64;

/** The bolt shader samples four 50×64 windows, centred on the drawn bolts. */
const ATLAS_SLOTS = [0, 50, 100, 150];
const ATLAS_SLOT_WIDTH = 50;

export function maskFromPixels(rgba: ArrayLike<number>, width: number, height: number): IconMask {
    const count = width * height;
    const values = new Uint8Array(count);
    let shaped = false;
    for (let i = 0; i < count; i++) {
        if ((rgba[i * 4 + 3] ?? 255) < 255) {
            shaped = true;
            break;
        }
    }
    for (let i = 0; i < count; i++) {
        const offset = i * 4;
        if (shaped) {
            values[i] = rgba[offset + 3] ?? 0;
        } else {
            const red = rgba[offset] ?? 0;
            const green = rgba[offset + 1] ?? 0;
            const blue = rgba[offset + 2] ?? 0;
            values[i] = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
        }
    }
    return { width, height, values };
}

function paintCell(
    target: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    x0: number,
    y0: number,
    cellWidth: number,
    cellHeight: number,
    mask: IconMask,
    channels: readonly number[],
) {
    const x1 = Math.min(width, x0 + cellWidth);
    const y1 = Math.min(height, y0 + cellHeight);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const index = (y * width + x) * 4;
            for (const channel of channels) target[index + channel] = 0;
        }
    }
    if (mask.width < 1 || mask.height < 1 || cellWidth < 1 || cellHeight < 1) return;
    const scale = Math.min(cellWidth / mask.width, cellHeight / mask.height);
    const drawnWidth = Math.max(1, Math.round(mask.width * scale));
    const drawnHeight = Math.max(1, Math.round(mask.height * scale));
    const originX = x0 + Math.floor((cellWidth - drawnWidth) / 2);
    const originY = y0 + Math.floor((cellHeight - drawnHeight) / 2);
    for (let y = 0; y < drawnHeight; y++) {
        const pixelY = originY + y;
        if (pixelY < 0 || pixelY >= height) continue;
        const sampleY = Math.min(mask.height - 1, Math.floor((y * mask.height) / drawnHeight));
        for (let x = 0; x < drawnWidth; x++) {
            const pixelX = originX + x;
            if (pixelX < 0 || pixelX >= width) continue;
            const sampleX = Math.min(mask.width - 1, Math.floor((x * mask.width) / drawnWidth));
            const value = mask.values[sampleY * mask.width + sampleX] ?? 0;
            const index = (pixelY * width + pixelX) * 4;
            for (const channel of channels) target[index + channel] = value;
        }
    }
}

/** Tile `mask` across `cell`×`cell` squares, writing only `channels` (0 red … 3 alpha). */
export function paintMask(
    target: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    mask: IconMask,
    cell: number,
    channels: readonly number[],
) {
    for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
            paintCell(target, width, height, x, y, cell, cell, mask, channels);
        }
    }
}

/** Copy the radar pattern and replace snow (red) and hail (blue) where a picture was chosen. */
export function applyRadarPattern(
    original: ArrayLike<number>,
    width: number,
    height: number,
    snow: IconMask | null,
    hail: IconMask | null,
): Uint8ClampedArray {
    const out = new Uint8ClampedArray(original.length);
    for (let i = 0; i < original.length; i++) out[i] = original[i] ?? 0;
    if (snow) paintMask(out, width, height, snow, RADAR_CELL, [0]);
    if (hail) paintMask(out, width, height, hail, RADAR_CELL, [2]);
    return out;
}

/** One symbol, copied into every channel, for a rain or thunder sheet. */
export function buildIconSheet(mask: IconMask, size = SHEET_SIZE): Uint8ClampedArray {
    const out = new Uint8ClampedArray(size * size * 4);
    paintMask(out, size, size, mask, size, [0, 1, 2, 3]);
    return out;
}

/**
 * Lightning atlas. The shader reads the bolt from green, its shadow from blue,
 * and the displayed colour from red and green, so the shape is written into all three.
 */
export function buildLightningAtlas(mask: IconMask): Uint8ClampedArray {
    const out = new Uint8ClampedArray(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
    for (const x of ATLAS_SLOTS) {
        paintCell(out, ATLAS_WIDTH, ATLAS_HEIGHT, x, 0, ATLAS_SLOT_WIDTH, ATLAS_HEIGHT, mask, [0, 1, 2]);
    }
    return out;
}
