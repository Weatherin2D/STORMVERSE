export type InkTarget = 'all' | 'dark' | 'light';

/**
 * Line strengths baked into one Windy basemap image.
 * major is the strongest (coasts and country borders), then regional borders
 * and large rivers, then ordinary rivers and lakes, then the faint streams.
 */
export type LineTier = 'major' | 'regional' | 'rivers' | 'streams';

export interface RecolorRule {
    kind: LineTier;
    /** Manual URL prefixes. Empty means every auto-detected line tile. */
    prefixes: string[];
    color: [number, number, number];
    ink: InkTarget;
    thickness: number;
    /** Clear this line type instead of recolouring it. */
    hidden?: boolean;
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

/** darkmap and simple tiles: black or white strokes with strength stored in alpha. */
export function isLineArtTile(url: string): boolean {
    if (!url || url.includes('/grayland/')) return false;
    return /\/tiles\/v[^/]+\/(?:[a-z]{2}\/)?(?:darkmap|simple)(?:-retina)?\//i.test(url);
}

export function rulesForUrl(url: string, rules: RecolorRule[]): RecolorRule[] {
    return rules.filter(rule =>
        rule.prefixes.length ? rule.prefixes.some(prefix => prefix && url.startsWith(prefix)) : isLineArtTile(url),
    );
}

function inkMatches(luminance: number, ink: InkTarget): boolean {
    return ink === 'all' || (ink === 'dark' && luminance < 128) || (ink === 'light' && luminance >= 128);
}

const TIER_ORDER: LineTier[] = ['streams', 'rivers', 'regional', 'major'];

/** Thickness 1 keeps the original stroke. Each tenth above that adds a tenth of a pixel. */
function lineRadius(thickness: number): number {
    const value = Number(thickness);
    const clamped = Math.min(5, Math.max(1, Number.isFinite(value) ? value : 1));
    const stepped = Math.round(clamped * 10) / 10;
    const radius = stepped - 1;
    return radius > 1e-6 ? radius : 0;
}

function looksLikeLineArt(data: Uint8ClampedArray): boolean {
    let opaque = 0;
    let gray = 0;
    const step = Math.max(4, Math.floor(data.length / 16000) * 4);
    for (let i = 0; i < data.length; i += step) {
        if (data[i + 3] < 8) continue;
        opaque += 1;
        if (Math.abs(data[i] - data[i + 1]) < 14 && Math.abs(data[i + 1] - data[i + 2]) < 14) gray += 1;
    }
    return opaque > 0 && gray / opaque >= 0.9;
}

/** 0 empty, 1 streams, 2 rivers, 3 regional, 4 major. */
function classifyLines(src: Uint8ClampedArray, width: number, height: number): Uint8Array {
    const count = width * height;
    const alpha = new Uint16Array(count);
    let maxAlpha = 0;
    for (let i = 0; i < count; i++) {
        const a = src[i * 4 + 3];
        alpha[i] = a;
        if (a > maxAlpha) maxAlpha = a;
    }
    const peak = new Uint16Array(alpha);
    if (maxAlpha === 0) return new Uint8Array(count);
    const order: number[] = [];
    for (let i = 0; i < count; i++) if (alpha[i]) order.push(i);
    order.sort((a, b) => alpha[b] - alpha[a]);
    const neighbors = (index: number, visit: (other: number) => void) => {
        const y = Math.floor(index / width);
        const x = index - y * width;
        for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            const row = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                if (nx < 0 || nx >= width) continue;
                visit(row + nx);
            }
        }
    };
    for (const index of order) {
        const value = alpha[index];
        let best = peak[index];
        neighbors(index, other => {
            if (alpha[other] > value && peak[other] > best) best = peak[other];
        });
        peak[index] = best;
    }
    // Pull the faint antialiased rim onto the strong line it belongs to.
    const halo = 5;
    const absorbed = new Uint16Array(peak);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (!alpha[index]) continue;
            let best = peak[index];
            const y0 = Math.max(0, y - halo);
            const y1 = Math.min(height - 1, y + halo);
            const x0 = Math.max(0, x - halo);
            const x1 = Math.min(width - 1, x + halo);
            for (let ny = y0; ny <= y1; ny++) {
                const row = ny * width;
                for (let nx = x0; nx <= x1; nx++) {
                    const next = peak[row + nx];
                    if (next > best) best = next;
                }
            }
            if (best > peak[index] * 2.2) absorbed[index] = best;
        }
    }
    let strongest = 0;
    for (let i = 0; i < count; i++) if (absorbed[i] > strongest) strongest = absorbed[i];
    const out = new Uint8Array(count);
    if (!strongest) return out;
    for (let i = 0; i < count; i++) {
        if (!alpha[i]) continue;
        const norm = absorbed[i] / strongest;
        out[i] = norm >= 0.7 ? 4 : norm >= 0.45 ? 3 : norm >= 0.22 ? 2 : 1;
    }
    return out;
}

function coverageAlpha(radius: number, distance: number, sourceAlpha: number): number {
    const coverage = Math.min(1, Math.max(0, radius + 0.65 - distance));
    const alpha = Math.round(255 * coverage);
    return distance === 0 ? Math.max(sourceAlpha, alpha) : alpha;
}

const TIER_RANK: Record<LineTier, number> = { streams: 1, rivers: 2, regional: 3, major: 4 };

function isSeed(src: Uint8ClampedArray, classes: Uint8Array, index: number, rank: number, ink: InkTarget): boolean {
    if (classes[index] !== rank) return false;
    const offset = index * 4;
    const alpha = src[offset + 3];
    if (alpha === 0) return false;
    const luminance = 0.299 * src[offset] + 0.587 * src[offset + 1] + 0.114 * src[offset + 2];
    return inkMatches(luminance, ink);
}

/** Another line type keeps its pixels. Empty space and hidden lines can be painted over. */
function canCover(classes: Uint8Array, data: Uint8ClampedArray, index: number, rank: number): boolean {
    const other = classes[index];
    return other === 0 || other === rank || data[index * 4 + 3] === 0;
}

/**
 * Paint one line type. Thickness 1 recolours its pixels and keeps their alpha.
 * A higher thickness stamps a disk around those pixels without covering the other types.
 */
function paintRule(
    src: Uint8ClampedArray,
    data: Uint8ClampedArray,
    classes: Uint8Array,
    width: number,
    height: number,
    rule: RecolorRule,
): void {
    const rank = TIER_RANK[rule.kind];
    const radius = lineRadius(rule.thickness);
    const [cr, cg, cb] = rule.color;
    const count = width * height;
    if (radius === 0) {
        for (let i = 0; i < count; i++) {
            if (!isSeed(src, classes, i, rank, rule.ink)) continue;
            const offset = i * 4;
            data[offset] = cr;
            data[offset + 1] = cg;
            data[offset + 2] = cb;
            data[offset + 3] = src[offset + 3];
        }
        return;
    }

    const reach = radius + 0.65;
    const reach2 = reach * reach;
    const dist = new Float32Array(count);
    dist.fill(Number.POSITIVE_INFINITY);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (!isSeed(src, classes, index, rank, rule.ink)) continue;
            const alpha = src[index * 4 + 3];
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
                    if (!canCover(classes, data, pi, rank)) continue;
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

function hideRule(src: Uint8ClampedArray, data: Uint8ClampedArray, classes: Uint8Array, rule: RecolorRule): void {
    const rank = TIER_RANK[rule.kind];
    const count = classes.length;
    for (let i = 0; i < count; i++) {
        if (!isSeed(src, classes, i, rank, rule.ink)) continue;
        const offset = i * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
    }
}

/**
 * Recolour each line type on its own. Faint lines are painted first and stronger
 * lines on top, so a thicker stream does not take over a coastline.
 */
export function recolorImageData(data: Uint8ClampedArray, width: number, height: number, rules: RecolorRule[]): void {
    if (!rules.length || width < 1 || height < 1 || !looksLikeLineArt(data)) return;
    const src = new Uint8ClampedArray(data);
    const classes = classifyLines(src, width, height);
    for (const rule of rules) if (rule.hidden) hideRule(src, data, classes, rule);
    for (const kind of TIER_ORDER) {
        const rule = rules.find(item => item.kind === kind && !item.hidden);
        if (rule) paintRule(src, data, classes, width, height, rule);
    }
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
