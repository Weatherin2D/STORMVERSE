/** Risk overlays drawn by the plugin. Values come from the tile address on each product. */

export const RISK_PRODUCTS = ['convective', 'tornado', 'largeHail', 'damagingWinds', 'hailSize', 'thunder'] as const;

export type RiskProduct = (typeof RISK_PRODUCTS)[number];
export type HailUnit = 'mm' | 'cm' | 'in';

export interface ColorStop {
    value: number;
    color: string;
}

export interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

export const RISK_LABELS: Record<RiskProduct, string> = {
    convective: 'Risk',
    tornado: 'Tornado risk',
    largeHail: 'Large hail',
    damagingWinds: 'Damaging winds',
    hailSize: 'Predicted hail size',
    thunder: 'Thunderstorm chance',
};

export const RISK_NOTES: Record<RiskProduct, string> = {
    convective: 'General convective risk',
    tornado: 'Chance of tornadoes, cyclonic and anticyclonic',
    largeHail: 'Hail risk',
    damagingWinds: 'Damaging winds risk',
    hailSize: 'Predicted hail size',
    thunder: 'Thunderstorm chance',
};

const PERCENT_MAX = 100;

export function defaultStops(product: RiskProduct): ColorStop[] {
    if (product === 'hailSize') {
        return [
            { value: 0, color: '#e3f2fd' },
            { value: 25, color: '#42a5f5' },
            { value: 50, color: '#7e57c2' },
            { value: 100, color: '#6a1b9a' },
            { value: 150, color: '#4a148c' },
        ];
    }
    return [
        { value: 0, color: '#e8f5e9' },
        { value: 12.4, color: '#f9a825' },
        { value: 50, color: '#e65100' },
        { value: 100, color: '#b71c1c' },
    ];
}

/** Top of the encoded range. Percent products use 100. Hail uses the highest scale stop, in millimetres. */
export function encodingMax(product: RiskProduct, stops: ColorStop[]): number {
    if (product !== 'hailSize') return PERCENT_MAX;
    let top = 0;
    for (const stop of stops) {
        if (Number.isFinite(stop.value) && stop.value > top) top = stop.value;
    }
    return top > 0 ? top : 150;
}

/** Alpha 0 is empty. Otherwise red and green hold a 16-bit fraction of `max`. */
export function decodePixel(red: number, green: number, alpha: number, max: number): number | null {
    if (alpha <= 0) return null;
    const raw = red * 256 + green;
    return (raw / 65535) * max;
}

export function parseHexColor(input: string): Rgba | null {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(input.trim());
    if (!match) return null;
    let hex = match[1];
    if (hex.length === 3) hex = hex.split('').map(channel => channel + channel).join('');
    return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
    };
}

function canonicalHex(color: string): string | null {
    const rgba = parseHexColor(color);
    if (!rgba) return null;
    const part = (n: number) => n.toString(16).padStart(2, '0');
    const body = `${part(rgba.r)}${part(rgba.g)}${part(rgba.b)}`;
    return rgba.a === 255 ? `#${body}` : `#${body}${part(rgba.a)}`;
}

export function sampleScale(stops: ColorStop[], value: number): Rgba {
    const ordered = stops.filter(stop => Number.isFinite(stop.value) && parseHexColor(stop.color)).sort((a, b) => a.value - b.value);
    if (!ordered.length) return { r: 0, g: 0, b: 0, a: 0 };
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (value <= first.value) return parseHexColor(first.color) as Rgba;
    if (value >= last.value) return parseHexColor(last.color) as Rgba;
    for (let i = 1; i < ordered.length; i++) {
        const right = ordered[i];
        if (value > right.value) continue;
        const left = ordered[i - 1];
        const span = right.value - left.value;
        const t = span === 0 ? 0 : (value - left.value) / span;
        const a = parseHexColor(left.color) as Rgba;
        const b = parseHexColor(right.color) as Rgba;
        return {
            r: Math.round(a.r + (b.r - a.r) * t),
            g: Math.round(a.g + (b.g - a.g) * t),
            b: Math.round(a.b + (b.b - a.b) * t),
            a: Math.round(a.a + (b.a - a.a) * t),
        };
    }
    return parseHexColor(last.color) as Rgba;
}

export interface PaintedTile {
    pixels: Uint8ClampedArray;
    values: Float32Array;
}

/** Colour a decoded RGBA tile. `values` is NaN where the pixel has no data. */
export function colorizePixels(rgba: ArrayLike<number>, max: number, stops: ColorStop[], opacity: number): PaintedTile {
    const count = Math.floor(rgba.length / 4);
    const pixels = new Uint8ClampedArray(count * 4);
    const values = new Float32Array(count);
    values.fill(Number.NaN);
    const cover = Math.min(1, Math.max(0, opacity));
    for (let i = 0; i < count; i++) {
        const offset = i * 4;
        const value = decodePixel(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 3] ?? 0, max);
        if (value === null) continue;
        values[i] = value;
        const color = sampleScale(stops, value);
        pixels[offset] = color.r;
        pixels[offset + 1] = color.g;
        pixels[offset + 2] = color.b;
        pixels[offset + 3] = Math.round(color.a * cover);
    }
    return { pixels, values };
}

export function parseScale(json: string): { ok: true; stops: ColorStop[] } | { ok: false; error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, error: 'That file is not JSON.' };
    }
    const stops = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { stops?: unknown }).stops : undefined;
    if (!Array.isArray(stops) || !stops.length) return { ok: false, error: 'The file needs a list of colour stops.' };
    const cleaned: ColorStop[] = [];
    for (const stop of stops) {
        if (!stop || typeof stop !== 'object') return { ok: false, error: 'A colour stop is missing its value or colour.' };
        const value = Number((stop as { value?: unknown }).value);
        const color = canonicalHex(String((stop as { color?: unknown }).color ?? ''));
        if (!Number.isFinite(value) || !color) return { ok: false, error: 'A colour stop needs a number and a hex colour.' };
        cleaned.push({ value, color });
    }
    cleaned.sort((a, b) => a.value - b.value);
    return { ok: true, stops: cleaned };
}

export function formatScale(stops: ColorStop[]): string {
    return JSON.stringify(
        { stops: stops.map(stop => ({ value: stop.value, color: stop.color })) },
        null,
        2,
    );
}

export function hailFromMillimetres(mm: number, unit: HailUnit): number {
    if (unit === 'cm') return mm / 10;
    if (unit === 'in') return mm / 25.4;
    return mm;
}

export function formatRiskValue(product: RiskProduct, value: number, hailUnit: HailUnit): string {
    if (product === 'hailSize') {
        const shown = hailFromMillimetres(value, hailUnit);
        return `${shown.toFixed(1)} ${hailUnit}`;
    }
    return `${value.toFixed(1)}%`;
}

/** Fill `{z}`, `{x}`, `{y}`, and `{product}`. X wraps around the world. Returns null when the address is incomplete. */
export function riskTileUrl(template: string, product: RiskProduct, z: number, x: number, y: number): string | null {
    if (!template.includes('{z}') || !template.includes('{x}') || !template.includes('{y}')) return null;
    const span = 2 ** z;
    const wrapped = ((x % span) + span) % span;
    return template
        .replaceAll('{product}', product)
        .replaceAll('{z}', String(z))
        .replaceAll('{x}', String(wrapped))
        .replaceAll('{y}', String(y));
}

export function legendGradient(stops: ColorStop[]): string {
    const ordered = [...stops].filter(stop => Number.isFinite(stop.value) && parseHexColor(stop.color)).sort((a, b) => a.value - b.value);
    if (!ordered.length) return 'transparent';
    const min = ordered[0].value;
    const span = ordered[ordered.length - 1].value - min || 1;
    const parts = ordered.map(stop => `${stop.color} ${((stop.value - min) / span) * 100}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
}
