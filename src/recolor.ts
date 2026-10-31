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

/**
 * Coastlines and borders are baked into one tile as black strokes.
 * A single rule recolours every matching pixel. Two rules split the stroke:
 * the soft edge takes the outline colour and the solid core takes the border colour.
 */
export function colorForPixel(
    r: number,
    g: number,
    b: number,
    a: number,
    rules: RecolorRule[],
): [number, number, number] | null {
    if (a === 0 || rules.length === 0) return null;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const matching = rules.filter(rule => inkMatches(luminance, rule.ink));
    if (!matching.length) return null;
    if (matching.length === 1) return matching[0].color;
    const borders = matching.find(rule => rule.kind === 'borders');
    const outlines = matching.find(rule => rule.kind === 'outlines');
    if (borders && outlines) return a >= 100 ? borders.color : outlines.color;
    return matching[matching.length - 1].color;
}

export function dilateAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
    const dilate = Math.max(0, Math.round(radius));
    if (!dilate) return;
    const src = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (src[idx + 3] > 0) continue;
            let painted = false;
            for (let dy = -dilate; dy <= dilate && !painted; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                for (let dx = -dilate; dx <= dilate; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= width) continue;
                    const nidx = (ny * width + nx) * 4;
                    if (src[nidx + 3] === 0) continue;
                    data[idx] = src[nidx];
                    data[idx + 1] = src[nidx + 1];
                    data[idx + 2] = src[nidx + 2];
                    data[idx + 3] = src[nidx + 3];
                    painted = true;
                    break;
                }
            }
        }
    }
}

export function recolorImageData(data: Uint8ClampedArray, width: number, height: number, rules: RecolorRule[]): void {
    const thickness = Math.max(1, ...rules.map(rule => rule.thickness || 1));
    dilateAlpha(data, width, height, thickness - 1);
    for (let i = 0; i < data.length; i += 4) {
        const next = colorForPixel(data[i], data[i + 1], data[i + 2], data[i + 3], rules);
        if (!next) continue;
        data[i] = next[0];
        data[i + 1] = next[1];
        data[i + 2] = next[2];
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
