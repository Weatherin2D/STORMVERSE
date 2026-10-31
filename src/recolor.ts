export type InkTarget = 'all' | 'dark' | 'light';
export type LineKind = 'outlines' | 'borders';

export interface RecolorRule {
    kind: LineKind;
    /** Manual URL prefixes. Empty means every auto-detected basemap line tile. */
    prefixes: string[];
    color: [number, number, number];
    ink: InkTarget;
    thickness: number;
}

export function hexToRgb(hex: string): [number, number, number] {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    const n = match ? parseInt(match[1], 16) : 0xffffff;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function safeHex(color: string): string | null {
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

/** GLSL vec3 in 0..1, used to replace the hardcoded land and sea fill. */
export function glslVec3(hex: string): string {
    const [r, g, b] = hexToRgb(hex);
    const channel = (n: number) => (n / 255).toFixed(5);
    return `vec3(${channel(r)},${channel(g)},${channel(b)})`;
}

/**
 * Basemap line tiles only. Weather tiles share tiles.windy.com/tiles/ and must not match.
 * grayland is the land/sea mask; its colour is applied in the shader, not in the pixels.
 */
export function isAutoBasemapTile(url: string): boolean {
    if (!url || url.includes('/grayland/')) return false;
    return (
        /\/tiles\/v[^/]+\/(?:[a-z]{2}\/)?(?:darkmap|simple)(?:-retina)?\//i.test(url) ||
        /\/v1\/maptiles\/(?:outdoor|winter)\//i.test(url) ||
        /\/tiles\/orto\//i.test(url) ||
        /node\.windy\.com\/maptile\//i.test(url)
    );
}

export function rulesForUrl(url: string, rules: RecolorRule[]): RecolorRule[] {
    return rules.filter(rule =>
        rule.prefixes.length ? rule.prefixes.some(prefix => prefix && url.startsWith(prefix)) : isAutoBasemapTile(url),
    );
}

function inkMatches(luminance: number, ink: InkTarget): boolean {
    return ink === 'all' || (ink === 'dark' && luminance < 128) || (ink === 'light' && luminance >= 128);
}

function lineRadius(thickness: number): number {
    return Math.max(1, Math.round(Number(thickness) || 1)) - 1;
}

function coverageAlpha(radius: number, distance: number, sourceAlpha: number): number {
    const coverage = Math.min(1, Math.max(0, radius + 0.65 - distance));
    const alpha = Math.round(255 * coverage);
    return distance === 0 ? Math.max(sourceAlpha, alpha) : alpha;
}

/**
 * Paint one colour onto a copy of the source tile.
 * Thickness 1 recolours matching pixels and keeps their alpha.
 * A higher thickness stamps a disk (radius = thickness - 1) around each of them.
 * Closer stamps win, so the stroke stays a solid line with a soft rim.
 */
function paintRule(
    src: Uint8ClampedArray,
    data: Uint8ClampedArray,
    width: number,
    height: number,
    rule: RecolorRule,
): void {
    const radius = lineRadius(rule.thickness);
    const [cr, cg, cb] = rule.color;
    const count = width * height;
    if (radius === 0) {
        for (let i = 0; i < count; i++) {
            const o = i * 4;
            const alpha = src[o + 3];
            if (alpha === 0) continue;
            const luminance = 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
            if (!inkMatches(luminance, rule.ink)) continue;
            data[o] = cr;
            data[o + 1] = cg;
            data[o + 2] = cb;
            data[o + 3] = alpha;
        }
        return;
    }

    const reach = radius + 0.65;
    const reach2 = reach * reach;
    const dist = new Float32Array(count);
    dist.fill(Number.POSITIVE_INFINITY);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const alpha = src[o + 3];
            if (alpha === 0) continue;
            const luminance = 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
            if (!inkMatches(luminance, rule.ink)) continue;
            const y0 = Math.max(0, Math.ceil(y - reach));
            const y1 = Math.min(height - 1, Math.floor(y + reach));
            const x0 = Math.max(0, Math.ceil(x - reach));
            const x1 = Math.min(width - 1, Math.floor(x + reach));
            for (let ny = y0; ny <= y1; ny++) {
                const dy = ny - y;
                for (let nx = x0; nx <= x1; nx++) {
                    const dx = nx - x;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > reach2) continue;
                    const pi = ny * width + nx;
                    const d = Math.sqrt(d2);
                    if (d >= dist[pi]) continue;
                    const nextAlpha = coverageAlpha(radius, d, alpha);
                    if (nextAlpha === 0) continue;
                    dist[pi] = d;
                    const oi = pi * 4;
                    data[oi] = cr;
                    data[oi + 1] = cg;
                    data[oi + 2] = cb;
                    data[oi + 3] = nextAlpha;
                }
            }
        }
    }
}

/**
 * Coastlines and borders share one black stroke. Outlines are stamped first
 * and borders on top, so a thicker outline is a casing around the border.
 * One rule paints the whole stroke in that colour and width.
 */
export function recolorImageData(data: Uint8ClampedArray, width: number, height: number, rules: RecolorRule[]): void {
    if (!rules.length || width < 1 || height < 1) return;
    const src = new Uint8ClampedArray(data);
    const ordered = [
        ...rules.filter(rule => rule.kind === 'outlines'),
        ...rules.filter(rule => rule.kind === 'borders'),
    ];
    for (const rule of rules) {
        if (rule.kind !== 'outlines' && rule.kind !== 'borders') ordered.push(rule);
    }
    for (const rule of ordered) paintRule(src, data, width, height, rule);
}

const SEA = /vec3\s+sea\s*=\s*vec3\([^)]*\)/;
const LAND = /vec3\s+land\s*=\s*vec3\([^)]*\)/;

/** Replace Windy's hardcoded land and sea fill. Pass null to restore the original shader. */
export function fragmentForBackground(original: string, color: string | null): string {
    if (!color || !safeHex(color) || !SEA.test(original) || !LAND.test(original)) return original;
    const vec = glslVec3(color);
    return original.replace(SEA, `vec3 sea=${vec}`).replace(LAND, `vec3 land=${vec}`);
}

export function labelCss(visible: boolean, color: string | null): string {
    const hide = visible
        ? ''
        : '#map-container .labels-layer,.leaflet-marker-pane .labels-layer{display:none !important;}';
    const hex = color ? safeHex(color) : null;
    const paint = hex
        ? `#map-container .leaflet-marker-pane .labels-layer [data-id],.labels-layer [data-id]{color:${hex} !important;}`
        : '';
    return hide + paint;
}
