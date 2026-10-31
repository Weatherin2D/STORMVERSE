import { map, toggleLandSeaMaskColored } from '@windy/map';
import {
    fragmentForBackground,
    hexToRgb,
    isAutoBasemapTile,
    labelCss,
    recolorImageData,
    rulesForUrl,
    safeHex,
} from './recolor';
import type { RecolorRule } from './recolor';
import { defaults, loadSettings, saveSettings } from './settings';
import type { IconKind, Kind, Settings } from './settings';

export type { IconKind, Kind, Settings };
export type { RecolorRule };

const win = window as any;

export const KINDS: Kind[] = ['outlines', 'borders', 'labels'];
export const ICONS: IconKind[] = ['lightning', 'snow', 'hail'];

/** Mutable, shared with the UI. Call commit() after changing it. */
export const settings: Settings = loadSettings();

const STYLE_ELEMENT_ID = 'windy-plugin-map-style';
const FETCH_VERSION = 3;
const IMAGE_PATCH_VERSION = 3;

/* ------------------------------------------------------------------ */
/* Map access                                                          */
/* ------------------------------------------------------------------ */

/**
 * Inner MapLibre map. Diagnostics on the current Windy client confirmed `_maplibreMap`.
 */
const ml = (): any => {
    const m: any = map;
    if (!m) return null;
    return m._maplibreMap ?? m.maplibreMap ?? m;
};

export interface LayerInfo {
    id: string;
    type: string;
    source: string;
}

export function listLayers(): LayerInfo[] {
    try {
        const layers = ml()?.getStyle?.()?.layers ?? [];
        return layers
            .filter((layer: any) => layer && layer.id)
            .map((layer: any) => ({
                id: String(layer.id),
                type: String(layer.type),
                source: String(layer.source ?? ''),
            }));
    } catch {
        return [];
    }
}

const WEATHER = /weather|particle|radar|satellite|overlay|isoline|hurricane|airspace|main|mask|poi/i;
const PATTERNS: [Kind, RegExp][] = [
    ['labels', /label|place|name|city|text/i],
    ['borders', /border|bound|countr|state|admin|province/i],
    ['outlines', /coast|outline|shore|water|sea|ocean|lake|land/i],
];

function classify(id: string): Kind | null {
    if (WEATHER.test(id)) return null;
    for (const [kind, re] of PATTERNS) {
        if (re.test(id)) return kind;
    }
    return null;
}

export function resolveLayers(kind: Kind): LayerInfo[] {
    const all = listLayers();
    const manual = settings.kinds[kind].layerIds;
    return manual.length ? all.filter(layer => manual.includes(layer.id)) : all.filter(layer => classify(layer.id) === kind);
}

function sourceTiles(sourceId: string): string[] {
    try {
        const source = ml()?.getSource?.(sourceId);
        const serialized = source?.serialize?.() ?? source;
        return (serialized?.tiles ?? source?.tiles ?? []) as string[];
    } catch {
        return [];
    }
}

const abs = (url: string): string => {
    try {
        return new URL(url, location.href).href;
    } catch {
        return url;
    }
};

const prefixOf = (template: string): string => {
    const i = template.indexOf('{');
    return i > 0 ? abs(template.slice(0, i)) : '';
};

export function effectivePrefix(kind: Kind): string {
    const chosen = settings.kinds[kind].tilePrefix;
    if (chosen) return abs(chosen);
    for (const layer of resolveLayers(kind)) {
        if (layer.type !== 'raster') continue;
        const tile = sourceTiles(layer.source)[0];
        const prefix = tile ? prefixOf(tile) : '';
        if (prefix) return prefix;
    }
    return '';
}

/* ------------------------------------------------------------------ */
/* Image helpers                                                       */
/* ------------------------------------------------------------------ */

function dataUrlToBlob(dataUrl: string): Blob {
    const [head, body] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export async function fileToIcon(file: File, max = 256): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/png');
}

interface IconRule {
    url: string;
    dataUrl: string;
}

async function recolorBlob(blob: Blob, rules: RecolorRule[]): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const image = context.getImageData(0, 0, width, height);
    recolorImageData(image.data, width, height, rules);
    context.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
}

const iconCache = new Map<string, Promise<Blob>>();

function buildIconBlob(origFetch: typeof fetch, url: string, dataUrl: string): Promise<Blob> {
    const key = `${url}|${dataUrl.length}|${dataUrl.slice(-48)}`;
    let pending = iconCache.get(key);
    if (!pending) {
        pending = (async () => {
            const user = await createImageBitmap(dataUrlToBlob(dataUrl));
            let width = user.width;
            let height = user.height;
            try {
                const res = await origFetch(url);
                if (res.ok) {
                    const original = await createImageBitmap(await res.blob());
                    width = original.width;
                    height = original.height;
                    original.close?.();
                }
            } catch {
                /* keep the user's image size */
            }
            const canvas = new OffscreenCanvas(width, height);
            canvas.getContext('2d')!.drawImage(user, 0, 0, width, height);
            user.close?.();
            return canvas.convertToBlob({ type: 'image/png' });
        })();
        iconCache.set(key, pending);
    }
    return pending;
}

/* ------------------------------------------------------------------ */
/* Network interception                                                */
/* ------------------------------------------------------------------ */

function activeRules(): RecolorRule[] {
    return win.__wmsRules?.recolorRules ?? [];
}

function iconRules(): IconRule[] {
    return win.__wmsRules?.iconRules ?? [];
}

function requestUrl(input: any): string {
    if (typeof input === 'string') return input;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return input?.url ?? '';
}

async function recolorResponse(res: Response, rules: RecolorRule[]): Promise<Response> {
    if (!res.ok || !rules.length) return res;
    try {
        const painted = await recolorBlob(await res.clone().blob(), rules);
        const headers = new Headers(res.headers);
        headers.set('Content-Type', 'image/png');
        headers.delete('Content-Length');
        return new Response(painted, { status: 200, statusText: 'OK', headers });
    } catch {
        return res;
    }
}

function installInterceptors() {
    if (!win.__wmsOrigFetch) win.__wmsOrigFetch = win.fetch.bind(win);
    if (win.__wmsFetchVersion !== FETCH_VERSION) {
        win.__wmsFetchVersion = FETCH_VERSION;
        const origFetch: typeof fetch = win.__wmsOrigFetch;
        win.fetch = async function (input: any, init?: any) {
            try {
                const raw = requestUrl(input);
                if (raw && !raw.startsWith('data:') && !raw.startsWith('blob:')) {
                    const url = abs(raw);
                    const bare = url.split('?')[0];
                    const icon = iconRules().find(rule => rule.url === bare);
                    if (icon) {
                        const blob = await buildIconBlob(origFetch, url, icon.dataUrl);
                        return new Response(blob, { status: 200, headers: { 'Content-Type': 'image/png' } });
                    }
                    const rules = rulesForUrl(url, activeRules());
                    if (rules.length) {
                        const res = await origFetch(input, init);
                        return recolorResponse(res, rules);
                    }
                }
            } catch {
                /* fall through to the original fetch */
            }
            return origFetch(input, init);
        };
    }

    const proto = HTMLImageElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (desc?.set && win.__wmsImgPatched !== IMAGE_PATCH_VERSION) {
        win.__wmsImgPatched = IMAGE_PATCH_VERSION;
        const origFetch: typeof fetch = win.__wmsOrigFetch;
        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: desc.enumerable,
            get: desc.get,
            set(this: HTMLImageElement, value: string) {
                try {
                    if (typeof value === 'string' && value && !value.startsWith('data:') && !value.startsWith('blob:')) {
                        const url = abs(value);
                        const bare = url.split('?')[0];
                        const icon = iconRules().find(rule => rule.url === bare);
                        if (icon) {
                            buildIconBlob(origFetch, url, icon.dataUrl)
                                .then(blobToDataUrl)
                                .then(dataUrl => desc.set!.call(this, dataUrl))
                                .catch(() => desc.set!.call(this, value));
                            return;
                        }
                        const rules = rulesForUrl(url, activeRules());
                        if (rules.length) {
                            origFetch(url)
                                .then(res => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
                                .then(blob => recolorBlob(blob, rules))
                                .then(blobToDataUrl)
                                .then(dataUrl => desc.set!.call(this, dataUrl))
                                .catch(() => desc.set!.call(this, value));
                            return;
                        }
                    }
                } catch {
                    /* use the original setter */
                }
                desc.set!.call(this, value);
            },
        });
    }
}

/**
 * Windy decodes basemap tiles into a ReferenceCountedCache and keeps them for
 * 10 seconds after they leave the screen. Changing a colour has to drop those
 * textures, otherwise the map keeps drawing the tiles it already decoded.
 */
function installCachePatch() {
    const Cache = win.L?.ReferenceCountedCache;
    if (!Cache?.prototype?.free || win.__wmsCachePatched) return;
    win.__wmsCachePatched = true;
    const origFree = Cache.prototype.free;
    Cache.prototype.free = function (token: any) {
        const url = String(token?._stringKey ?? '');
        if (win.__wmsRefreshing && shouldDropTile(url)) {
            const previous = this._deleteTimeoutSeconds;
            this._deleteTimeoutSeconds = 0;
            try {
                return origFree.call(this, token);
            } finally {
                this._deleteTimeoutSeconds = previous;
            }
        }
        return origFree.call(this, token);
    };
}

function shouldDropTile(url: string): boolean {
    if (!url || url.includes('/grayland/')) return false;
    if (isAutoBasemapTile(url)) return true;
    const manuals: string[] = win.__wmsManualPrefixes ?? [];
    return manuals.some(prefix => prefix && url.startsWith(prefix));
}

function basemapImplementation(): any {
    const maplibre = ml();
    const direct = maplibre?.getLayer?.('raster-basemap') ?? maplibre?.style?._layers?.['raster-basemap'];
    const directImpl = direct?.implementation ?? direct;
    if (directImpl?._tileCache || directImpl?.constructor?._shader) return directImpl;
    const layers = maplibre?.style?._layers;
    if (!layers) return null;
    for (const layer of Object.values(layers) as any[]) {
        const impl = layer?.implementation ?? layer;
        if (impl?.id === 'raster-basemap') return impl;
    }
    return null;
}

let lastManualPrefixes: string[] = [];
let tilesNeedReload = false;

function reloadBasemapTiles() {
    installCachePatch();
    const manuals = new Set<string>(lastManualPrefixes);
    for (const rule of recolorRules) {
        for (const prefix of rule.prefixes) if (prefix) manuals.add(prefix);
    }
    win.__wmsManualPrefixes = [...manuals];
    win.__wmsRefreshing = true;
    try {
        const impl = basemapImplementation();
        const cache = impl?._tileCache;
        if (cache?.forEachTile && cache?.forceDeleteTile) {
            tilesNeedReload = false;
            const coords: { x: number; y: number; z: number }[] = [];
            cache.forEachTile((coord: any) => {
                if (coord && Number.isFinite(coord.x) && Number.isFinite(coord.y) && Number.isFinite(coord.z)) {
                    coords.push({ x: coord.x, y: coord.y, z: coord.z });
                }
            });
            for (const coord of coords) {
                try {
                    cache.forceDeleteTile(coord);
                } catch {
                    /* this tile can stay until the next view change */
                }
            }
            const zoom = cache._lastZoom;
            const bounds = cache._lastBounds;
            cache._lastZoom = null;
            try {
                if (bounds && zoom != null) cache.update(bounds, zoom, true);
                else impl?._onMapMove?.();
            } catch {
                try {
                    impl?._onMapMove?.();
                } catch {
                    /* the next pan reloads the tiles */
                }
            }
        } else {
            tilesNeedReload = true;
        }
        try {
            impl?._map?.triggerRepaint?.() ?? ml()?.triggerRepaint?.();
        } catch {
            /* ignore */
        }
    } finally {
        win.__wmsRefreshing = false;
        if (!tilesNeedReload) lastManualPrefixes = recolorRules.flatMap(rule => rule.prefixes);
    }
}

/* ------------------------------------------------------------------ */
/* Applying settings                                                   */
/* ------------------------------------------------------------------ */

let recolorRules: RecolorRule[] = [];
let lastRuleSig = '';
let originalBackground: string | null = null;
let originalCanvasBackground: string | null = null;
let fillHidden = false;
const originalPaint = new Map<string, unknown>();

function rebuildRules() {
    recolorRules = [];
    for (const kind of ['outlines', 'borders'] as const) {
        const chosen = settings.kinds[kind];
        if (!chosen.touched || !chosen.recolor) continue;
        const manual = chosen.tilePrefix ? abs(chosen.tilePrefix) : '';
        recolorRules.push({
            kind,
            prefixes: manual ? [manual] : [],
            color: hexToRgb(safeHex(chosen.color) ?? '#ffffff'),
            ink: chosen.ink,
            thickness: Number(chosen.thickness) || 1,
        });
    }
    const icons: IconRule[] = ICONS.filter(icon => settings.icons[icon].dataUrl && settings.icons[icon].textureUrl).map(
        icon => ({
            url: abs(settings.icons[icon].textureUrl).split('?')[0],
            dataUrl: settings.icons[icon].dataUrl as string,
        }),
    );
    win.__wmsRules = { recolorRules, iconRules: icons };
}

function backgroundShader(): any {
    const shader = basemapImplementation()?.constructor?._shader;
    const source = shader?._wmsOriginalFragment ?? shader?._sourceFragment;
    if (shader && typeof source === 'string' && source.includes('vec3 sea')) return shader;
    return null;
}

function applyBackgroundShader() {
    const shader = backgroundShader();
    if (!shader) return;
    if (typeof shader._wmsOriginalFragment !== 'string') shader._wmsOriginalFragment = shader._sourceFragment;
    const original = shader._wmsOriginalFragment as string;
    const wanted = settings.background.enabled ? safeHex(settings.background.color) : null;
    const next = fragmentForBackground(original, wanted);
    if (shader._sourceFragment === next) return;
    shader._sourceFragment = next;
    const gl = ml()?.painter?.context?.gl;
    try {
        for (const program of shader._variants?.values?.() ?? []) {
            if (program?.program) gl?.deleteProgram?.(program.program);
        }
        shader._variants?.clear?.();
    } catch {
        /* the next frame recompiles whatever is left */
    }
    try {
        ml()?.triggerRepaint?.();
    } catch {
        /* ignore */
    }
}

function applyBackground() {
    const background = settings.background;
    const container: HTMLElement | null = (map as any)?.getContainer?.() ?? null;
    if (container) {
        if (originalBackground === null) originalBackground = container.style.backgroundColor;
        container.style.backgroundColor = background.enabled ? background.color : (originalBackground ?? '');
    }
    const canvas: HTMLElement | null = ml()?.getCanvas?.() ?? null;
    if (canvas) {
        if (originalCanvasBackground === null) originalCanvasBackground = canvas.style.backgroundColor;
        canvas.style.backgroundColor = background.enabled ? background.color : (originalCanvasBackground ?? '');
    }
    applyBackgroundShader();
    const hide = background.enabled && background.hideWindyFill;
    if (hide !== fillHidden) {
        try {
            toggleLandSeaMaskColored(!hide);
            fillHidden = hide;
        } catch {
            /* the shader colour still applies while the fill stays visible */
        }
    }
}

function applyLabels() {
    const labels = settings.kinds.labels;
    const existing = document.getElementById(STYLE_ELEMENT_ID);
    if (!labels.touched) {
        existing?.remove();
        return;
    }
    const css = labelCss(labels.visible, labels.recolor ? labels.color : null);
    if (!css) {
        existing?.remove();
        return;
    }
    const style = existing ?? document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = css;
    if (!existing) document.head.appendChild(style);
}

const PAINT_PROPS: Record<string, string[]> = {
    line: ['line-color'],
    symbol: ['text-color', 'icon-color'],
    fill: ['fill-color', 'fill-outline-color'],
    circle: ['circle-color'],
};

function applyKind(kind: Kind) {
    const chosen = settings.kinds[kind];
    if (!chosen.touched) return;
    const maplibre = ml();
    if (!maplibre?.setPaintProperty) return;
    for (const layer of resolveLayers(kind)) {
        try {
            maplibre.setLayoutProperty(layer.id, 'visibility', chosen.visible ? 'visible' : 'none');
        } catch {
            /* this layer has no visibility property */
        }
        for (const prop of PAINT_PROPS[layer.type] ?? []) {
            const key = `${layer.id}|${prop}`;
            try {
                if (!originalPaint.has(key)) originalPaint.set(key, maplibre.getPaintProperty(layer.id, prop));
                maplibre.setPaintProperty(layer.id, prop, chosen.recolor ? chosen.color : originalPaint.get(key));
            } catch {
                /* raster basemap layers have no paint properties */
            }
        }
    }
}

function applyLineVisibility() {
    const outlines = settings.kinds.outlines;
    const borders = settings.kinds.borders;
    if (!outlines.touched && !borders.touched) return;
    try {
        ml()?.setLayoutProperty?.('raster-basemap', 'visibility', outlines.visible || borders.visible ? 'visible' : 'none');
    } catch {
        /* custom layers ignore visibility on some builds */
    }
}

function layerSignature(): string {
    return listLayers()
        .map(layer => layer.id)
        .join('|');
}

export function apply() {
    const previousSig = JSON.stringify(recolorRules);
    rebuildRules();
    installInterceptors();
    applyBackground();
    applyLabels();
    applyLineVisibility();
    KINDS.forEach(applyKind);
    const nextSig = JSON.stringify(recolorRules);
    if (nextSig === lastRuleSig && nextSig === previousSig) return;
    const hadRules = lastRuleSig !== '' && lastRuleSig !== '[]';
    lastRuleSig = nextSig;
    if (hadRules || nextSig !== '[]') reloadBasemapTiles();
}

export function commit(): boolean {
    const ok = saveSettings(settings);
    apply();
    return ok;
}

export function resetAll() {
    const fresh = defaults();
    settings.background = fresh.background;
    settings.kinds = fresh.kinds;
    settings.icons = fresh.icons;
    saveSettings(settings);
    apply();
}

let started = false;
let lastLayerSig = '';
let shaderTimer = 0;

export function start() {
    try {
        performance.setResourceTimingBufferSize?.(2000);
    } catch {
        /* ignore */
    }
    apply();
    lastLayerSig = layerSignature();
    if (started) return;
    started = true;
    const onMapChange = () => {
        const sig = layerSignature();
        if (sig !== lastLayerSig) {
            lastLayerSig = sig;
            apply();
        } else {
            applyBackgroundShader();
        }
    };
    try {
        (map as any)?.on?.('load', onMapChange);
    } catch {
        /* ignore */
    }
    try {
        ml()?.on?.('styledata', onMapChange);
    } catch {
        /* ignore */
    }
    // The basemap layer can appear a moment after the plugin opens.
    let tries = 0;
    shaderTimer = window.setInterval(() => {
        applyBackgroundShader();
        if (tilesNeedReload) reloadBasemapTiles();
        tries += 1;
        if ((backgroundShader() && !tilesNeedReload) || tries > 20) window.clearInterval(shaderTimer);
    }, 500);
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

export interface ScanResult {
    layers: LayerInfo[];
    tilePrefixes: { prefix: string; count: number }[];
    images: { url: string; hint: IconKind | null }[];
}

const IMG_EXT = /\.(png|webp|svg|jpe?g|gif)$/i;
const TILE_TAIL = /\/\d+\/\d+\/\d+(\.[a-z0-9]+)?$/i;
const HINTS: [IconKind, RegExp][] = [
    ['lightning', /lightning|blitz|bolt|thunder|storm/i],
    ['hail', /hail|ice/i],
    ['snow', /snow|flake/i],
];

export function scan(): ScanResult {
    const layers = listLayers();
    const prefixes = new Map<string, number>();
    const images = new Map<string, IconKind | null>();
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    for (const entry of entries) {
        const bare = entry.name.split('?')[0];
        if (bare.startsWith('data:') || bare.startsWith('blob:')) continue;
        if (TILE_TAIL.test(bare)) {
            const prefix = bare.replace(TILE_TAIL, '/');
            prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
        } else if (IMG_EXT.test(bare)) {
            images.set(bare, HINTS.find(([, re]) => re.test(bare))?.[0] ?? null);
        }
    }
    return {
        layers,
        tilePrefixes: [...prefixes].map(([prefix, count]) => ({ prefix, count })).sort((a, b) => b.count - a.count),
        images: [...images].map(([url, hint]) => ({ url, hint })).sort((a, b) => Number(!!b.hint) - Number(!!a.hint)),
    };
}

export function diagnostics(): string {
    const maplibre = ml();
    let sources: unknown = null;
    try {
        const listed = maplibre?.getStyle?.()?.sources ?? {};
        sources = Object.keys(listed).map(id => ({ id, type: listed[id].type, tiles: listed[id].tiles }));
    } catch {
        /* ignore */
    }
    const result = scan();
    const slim = JSON.parse(
        JSON.stringify(settings, (key, value) => (key === 'dataUrl' && value ? '[image]' : value)),
    );
    const impl = basemapImplementation();
    return JSON.stringify(
        {
            maplibreFound: !!maplibre,
            basemapLayerFound: !!impl,
            shaderFound: !!backgroundShader(),
            cachedBasemapTiles: impl?._tileCache?.cachedTilesCount ?? null,
            mapObjectKeys: Object.keys((map as any) ?? {}),
            layers: result.layers,
            sources,
            tilePrefixes: result.tilePrefixes.slice(0, 15),
            imageHints: result.images.filter(image => image.hint),
            otherImages: result.images.filter(image => !image.hint).slice(0, 25),
            settings: slim,
        },
        null,
        2,
    );
}
