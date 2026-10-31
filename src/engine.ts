import { isGlobeActive, map, toggleLandSeaMaskColored } from '@windy/map';
import {
    fragmentForBackground,
    hexToRgb,
    isLineArtTile,
    labelCss,
    recolorImageData,
    rulesForUrl,
    safeHex,
} from './recolor';
import type { RecolorRule } from './recolor';
import {
    applyRadarPattern,
    buildIconSheet,
    buildLightningAtlas,
    maskFromPixels,
    RADAR_PATTERN_TOKEN,
    RAIN_TEXTURE,
    SHEET_SIZE,
    THUNDER_TEXTURE,
} from './icons';
import type { IconMask } from './icons';
import { colorizePixels, encodingMax, formatRiskValue, riskTileUrl } from './risk';
import type { RiskProduct } from './risk';
import { installRiskMenu, syncRiskMenu } from './riskMenu';
import { defaults, loadSettings, saveSettings } from './settings';
import type { IconKind, Kind, Settings } from './settings';

export type { IconKind, Kind, Settings };
export type { RecolorRule };

const win = window as any;

export const LINE_KINDS: Kind[] = ['major', 'regional', 'rivers', 'streams'];
export const KINDS: Kind[] = [...LINE_KINDS, 'labels'];
export const RADAR_ICONS: IconKind[] = ['lightning', 'snow', 'hail'];
export const PATTERN_ICONS: IconKind[] = ['rain', 'thunder'];
export const ICONS: IconKind[] = [...RADAR_ICONS, ...PATTERN_ICONS];

/** Mutable, shared with the UI. Call commit() after changing it. */
export const settings: Settings = loadSettings();

const STYLE_ELEMENT_ID = 'windy-plugin-map-style';
const FETCH_VERSION = 7;
const IMAGE_PATCH_VERSION = 7;
const CANVAS_PATCH_VERSION = 7;

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
    ['major', /coast|country|outline|shore/i],
    ['regional', /border|bound|admin|province|state/i],
    ['rivers', /river|lake|water/i],
    ['streams', /stream|creek/i],
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

async function recolorBlob(blob: Blob, rules: RecolorRule[]): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const image = context.getImageData(0, 0, width, height);
    recolorImageData(image.data, width, height, rules);
    context.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
}

interface PreparedIcons {
    lightning: Uint8ClampedArray | null;
    snow: IconMask | null;
    hail: IconMask | null;
    rainDataUrl: string | null;
    thunderDataUrl: string | null;
    rainBlob: Blob | null;
    thunderBlob: Blob | null;
}

let prepareToken = 0;
let iconSignature = '';
let prepareCurrent: Promise<void> = Promise.resolve();
const imageJobs = new WeakMap<object, number>();

function iconKey(): string {
    return ICONS.map(icon => {
        const dataUrl = settings.icons[icon].dataUrl;
        return dataUrl ? `${dataUrl.length}:${dataUrl.slice(-48)}` : '';
    }).join('|');
}

async function decodeMask(dataUrl: string): Promise<IconMask> {
    const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const image = context.getImageData(0, 0, width, height);
    return maskFromPixels(image.data, width, height);
}

async function pixelsToPng(pixels: Uint8ClampedArray, width: number, height: number): Promise<{ blob: Blob; dataUrl: string }> {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return { blob, dataUrl: await blobToDataUrl(blob) };
}

async function buildPrepared(token: number) {
    const prepared: PreparedIcons = {
        lightning: null,
        snow: null,
        hail: null,
        rainDataUrl: null,
        thunderDataUrl: null,
        rainBlob: null,
        thunderBlob: null,
    };
    try {
        const masks = new Map<IconKind, IconMask>();
        for (const icon of ICONS) {
            const dataUrl = settings.icons[icon].dataUrl;
            if (!dataUrl) continue;
            try {
                masks.set(icon, await decodeMask(dataUrl));
            } catch {
                /* this picture could not be read; the others still apply */
            }
        }
        if (token !== prepareToken) return;
        const lightning = masks.get('lightning');
        if (lightning) prepared.lightning = buildLightningAtlas(lightning);
        prepared.snow = masks.get('snow') ?? null;
        prepared.hail = masks.get('hail') ?? null;
        const rain = masks.get('rain');
        if (rain) {
            const png = await pixelsToPng(buildIconSheet(rain), SHEET_SIZE, SHEET_SIZE);
            if (token !== prepareToken) return;
            prepared.rainBlob = png.blob;
            prepared.rainDataUrl = png.dataUrl;
        }
        const thunder = masks.get('thunder');
        if (thunder) {
            const png = await pixelsToPng(buildIconSheet(thunder), SHEET_SIZE, SHEET_SIZE);
            if (token !== prepareToken) return;
            prepared.thunderBlob = png.blob;
            prepared.thunderDataUrl = png.dataUrl;
        }
        if (token !== prepareToken) return;
        win.__wmsIcons = prepared;
    } catch {
        if (token === prepareToken) iconSignature = '';
    }
}

/** Decode chosen pictures once. The interceptors below read the result synchronously. */
function schedulePrepare() {
    const next = iconKey();
    if (next === iconSignature) return;
    iconSignature = next;
    const token = ++prepareToken;
    const run = () => buildPrepared(token);
    prepareCurrent = prepareCurrent.then(run, run);
    win.__wmsPrepare = prepareCurrent;
}

function prepareReady(): Promise<void> {
    return win.__wmsPrepare ?? Promise.resolve();
}

function nextImageJob(element: object): number {
    const job = (imageJobs.get(element) ?? 0) + 1;
    imageJobs.set(element, job);
    return job;
}

function sheetKind(url: string): 'rain' | 'thunder' | null {
    if (url.includes(RAIN_TEXTURE)) return 'rain';
    if (url.includes(THUNDER_TEXTURE)) return 'thunder';
    return null;
}

async function rebuildRadarPattern(dataUrl: string): Promise<string> {
    const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const image = context.getImageData(0, 0, width, height);
    const icons: PreparedIcons | undefined = win.__wmsIcons;
    const next = applyRadarPattern(image.data, width, height, icons?.snow ?? null, icons?.hail ?? null);
    context.putImageData(new ImageData(next, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataUrl(blob);
}

/* ------------------------------------------------------------------ */
/* Network interception                                                */
/* ------------------------------------------------------------------ */

function activeRules(): RecolorRule[] {
    return win.__wmsRules?.recolorRules ?? [];
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

function installCanvasPatch() {
    const proto = win.CanvasRenderingContext2D?.prototype;
    if (!proto?.getImageData || win.__wmsCanvasPatched === CANVAS_PATCH_VERSION) return;
    if (!win.__wmsOrigGetImageData) win.__wmsOrigGetImageData = proto.getImageData;
    win.__wmsCanvasPatched = CANVAS_PATCH_VERSION;
    const orig = win.__wmsOrigGetImageData;
    proto.getImageData = function (this: CanvasRenderingContext2D, ...args: any[]) {
        const image = orig.apply(this, args);
        try {
            const atlas: Uint8ClampedArray | null | undefined = win.__wmsIcons?.lightning;
            const [sx, sy, sw, sh] = args;
            const canvas = this.canvas;
            const pixel = image?.data;
            // wa() fills the atlas canvas red before it draws the bolts, then reads 256×64 pixels.
            if (
                atlas &&
                canvas?.width === 256 &&
                canvas?.height === 64 &&
                sx === 0 &&
                sy === 0 &&
                sw === 256 &&
                sh === 64 &&
                pixel &&
                pixel[0] > 200 &&
                pixel[1] < 40 &&
                pixel[2] < 40
            ) {
                return new ImageData(new Uint8ClampedArray(atlas), 256, 64);
            }
        } catch {
            /* keep the canvas pixels */
        }
        return image;
    };
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
                    const sheet = sheetKind(url);
                    if (sheet) {
                        await prepareReady();
                        const blob: Blob | null | undefined =
                            sheet === 'rain' ? win.__wmsIcons?.rainBlob : win.__wmsIcons?.thunderBlob;
                        if (blob) {
                            return new Response(blob.slice(0, blob.size, 'image/png'), {
                                status: 200,
                                headers: { 'Content-Type': 'image/png' },
                            });
                        }
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
        const assign = (element: HTMLImageElement, value: string) => desc.set!.call(element, value);
        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: desc.enumerable,
            get: desc.get,
            set(this: HTMLImageElement, value: string) {
                try {
                    if (typeof value === 'string' && value.includes(RADAR_PATTERN_TOKEN)) {
                        const element = this;
                        const job = nextImageJob(element);
                        prepareReady()
                            .then(async () => {
                                if (imageJobs.get(element) !== job) return;
                                const icons: PreparedIcons | undefined = win.__wmsIcons;
                                if (!icons?.snow && !icons?.hail) {
                                    assign(element, value);
                                    return;
                                }
                                const dataUrl = await rebuildRadarPattern(value);
                                if (imageJobs.get(element) !== job) return;
                                assign(element, dataUrl.includes(RADAR_PATTERN_TOKEN) ? value : dataUrl);
                            })
                            .catch(() => assign(element, value));
                        return;
                    }
                    if (typeof value === 'string' && value && !value.startsWith('data:') && !value.startsWith('blob:')) {
                        const url = abs(value);
                        const sheet = sheetKind(url);
                        if (sheet) {
                            const element = this;
                            const job = nextImageJob(element);
                            prepareReady()
                                .then(() => {
                                    if (imageJobs.get(element) !== job) return;
                                    const dataUrl =
                                        sheet === 'rain' ? win.__wmsIcons?.rainDataUrl : win.__wmsIcons?.thunderDataUrl;
                                    assign(element, dataUrl || value);
                                })
                                .catch(() => assign(element, value));
                            return;
                        }
                        const rules = rulesForUrl(url, activeRules());
                        if (rules.length) {
                            const element = this;
                            origFetch(url)
                                .then(res => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
                                .then(blob => recolorBlob(blob, rules))
                                .then(blobToDataUrl)
                                .then(dataUrl => assign(element, dataUrl))
                                .catch(() => assign(element, value));
                            return;
                        }
                    }
                } catch {
                    /* use the original setter */
                }
                assign(this, value);
            },
        });
    }
    installCanvasPatch();
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
    if (isLineArtTile(url)) return true;
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
    for (const kind of LINE_KINDS) {
        const chosen = settings.kinds[kind];
        if (!chosen.touched || (chosen.visible && !chosen.recolor)) continue;
        const manual = chosen.tilePrefix ? abs(chosen.tilePrefix) : '';
        recolorRules.push({
            kind: kind as RecolorRule['kind'],
            hidden: !chosen.visible,
            prefixes: manual ? [manual] : [],
            color: hexToRgb(safeHex(chosen.color) ?? '#ffffff'),
            ink: chosen.ink,
            thickness: Number(chosen.thickness) || 1,
        });
    }
    win.__wmsRules = { recolorRules };
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
    const lines = LINE_KINDS.map(kind => settings.kinds[kind]);
    if (!lines.some(line => line.touched)) return;
    try {
        ml()?.setLayoutProperty?.('raster-basemap', 'visibility', lines.some(line => line.visible) ? 'visible' : 'none');
    } catch {
        /* custom layers ignore visibility on some builds */
    }
}

function layerSignature(): string {
    return listLayers()
        .map(layer => layer.id)
        .join('|');
}

const RISK_PANE = 'wmsRisk';
const RISK_TILE = 256;

let riskLayer: any = null;
let riskRoot: HTMLDivElement | null = null;
let riskSig = '';
let riskWanted = false;
let riskPointer: ((text: string) => void) | null = null;
let riskNotice: ((text: string) => void) | null = null;
let riskUi: (() => void) | null = null;
let riskMoveBound = false;
let riskViewBound = false;
let riskTileWarned = false;
let riskGeneration = 0;

export function watchRiskPointer(cb: (text: string) => void): () => void {
    riskPointer = cb;
    return () => {
        if (riskPointer === cb) riskPointer = null;
    };
}

export function watchRiskNotice(cb: (text: string) => void): () => void {
    riskNotice = cb;
    return () => {
        if (riskNotice === cb) riskNotice = null;
    };
}

export function watchRiskUi(cb: () => void): () => void {
    riskUi = cb;
    return () => {
        if (riskUi === cb) riskUi = null;
    };
}

function pickRiskFromMenu(product: RiskProduct) {
    settings.risk.active = settings.risk.active === product ? null : product;
    riskUi?.();
    commit();
}

function dismissRiskFromMenu() {
    if (!settings.risk.active) return;
    settings.risk.active = null;
    riskUi?.();
    commit();
}

function riskSignature(): string {
    const active = settings.risk.active;
    if (!active) return '';
    const style = settings.risk.products[active];
    if (!style || !riskTileUrl(style.tileUrl, active, 0, 0, 0)) return '';
    return JSON.stringify({
        active,
        opacity: settings.risk.opacity,
        url: style.tileUrl,
        stops: style.stops,
    });
}

function paintRiskTile(tile: HTMLCanvasElement, bitmap: ImageBitmap, product: RiskProduct) {
    const context = tile.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, 256, 256);
    context.drawImage(bitmap, 0, 0, 256, 256);
    bitmap.close?.();
    const image = context.getImageData(0, 0, 256, 256);
    const style = settings.risk.products[product];
    const painted = colorizePixels(image.data, encodingMax(product, style.stops), style.stops, Number(settings.risk.opacity) || 0);
    context.putImageData(new ImageData(painted.pixels, 256, 256), 0, 0);
    (tile as any)._riskValues = painted.values;
}

function onRiskMove(event: any) {
    const product = settings.risk.active;
    const latlng = event?.latlng;
    if (!product || !riskLayer || !latlng || !(map as any)?.project) {
        riskPointer?.('');
        return;
    }
    const zoom = riskLayer._tileZoom;
    if (zoom == null) {
        riskPointer?.('');
        return;
    }
    const projected = (map as any).project(latlng, zoom);
    const x = Math.floor(projected.x / 256);
    const y = Math.floor(projected.y / 256);
    const px = Math.floor(projected.x - x * 256);
    const py = Math.floor(projected.y - y * 256);
    const values: Float32Array | undefined = riskLayer._tiles?.[`${x}:${y}:${zoom}`]?.el?._riskValues;
    const value = values && px >= 0 && py >= 0 && px < 256 && py < 256 ? values[py * 256 + px] : Number.NaN;
    riskPointer?.(Number.isFinite(value) ? formatRiskValue(product, value, settings.risk.hailUnit) : '');
}

function bindRiskPointer() {
    if (riskMoveBound) return;
    riskMoveBound = true;
    try {
        (map as any)?.on?.('mousemove', onRiskMove);
    } catch {
        riskMoveBound = false;
    }
}

function globeOn(): boolean {
    try {
        if (typeof isGlobeActive === 'function' && isGlobeActive()) return true;
    } catch {
        /* fall through to the class Windy puts on the page */
    }
    return Boolean(document.body?.classList?.contains('onglobe'));
}

export function removeRiskLayer() {
    riskGeneration += 1;
    try {
        riskLayer?.remove?.();
    } catch {
        /* the map can already be gone */
    }
    riskRoot?.remove();
    riskLayer = null;
    riskRoot = null;
    riskSig = '';
    riskPointer?.('');
    if (riskViewBound) {
        riskViewBound = false;
        const m = map as any;
        m?.off?.('move', layoutRiskTiles);
        m?.off?.('zoom', layoutRiskTiles);
        m?.off?.('zoomend', layoutRiskTiles);
        m?.off?.('moveend', layoutRiskTiles);
        m?.off?.('resize', layoutRiskTiles);
        m?.off?.('viewreset', layoutRiskTiles);
    }
}

/** A pane between the basemap and the place-name markers. The default tile pane sits under the basemap. */
function ensureRiskPane(): string {
    const id = 'wms-risk-style';
    if (!document.getElementById(id)) {
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '.leaflet-wmsRisk-pane,.wms-risk-layer{z-index:450 !important;pointer-events:none !important}';
        document.head.appendChild(style);
    }
    const m = map as any;
    try {
        if (!m?.getPane?.(RISK_PANE) && typeof m?.createPane === 'function') {
            const pane = m.createPane(RISK_PANE);
            pane.style.zIndex = '450';
            pane.style.pointerEvents = 'none';
        }
        if (m?.getPane?.(RISK_PANE)) return RISK_PANE;
    } catch {
        /* overlay pane is the next pane above the basemap */
    }
    return 'overlayPane';
}

function gridLayerClass(): any {
    const L = win.L;
    if (typeof L?.GridLayer?.extend === 'function') return L.GridLayer;
    if (!L || typeof L !== 'object') return null;
    for (const key of Object.keys(L)) {
        const value = L[key];
        if (
            /grid/i.test(key) &&
            typeof value?.extend === 'function' &&
            typeof value?.prototype?.createTile === 'function'
        ) {
            return value;
        }
    }
    return null;
}

function loadRiskCanvas(tile: HTMLCanvasElement, product: RiskProduct, url: string, generation: number, done?: () => void) {
    const orig: typeof fetch = win.__wmsOrigFetch || win.fetch.bind(win);
    orig(url)
        .then(res => {
            if (!res.ok) throw new Error(String(res.status));
            return res.blob();
        })
        .then(blob => createImageBitmap(blob))
        .then(bitmap => {
            if (generation !== riskGeneration) {
                bitmap.close?.();
                done?.();
                return;
            }
            paintRiskTile(tile, bitmap, product);
            if (riskTileWarned) {
                riskTileWarned = false;
                riskNotice?.('');
            }
            done?.();
        })
        .catch(() => {
            if (generation !== riskGeneration) {
                done?.();
                return;
            }
            if (!riskTileWarned) {
                riskTileWarned = true;
                riskNotice?.('Those tiles could not be read. The tile server has to allow this page to read the images.');
            }
            done?.();
        });
}

function ensureGridRiskLayer(): boolean {
    if (riskLayer && !riskRoot) return true;
    const Grid = gridLayerClass();
    const m = map as any;
    if (!Grid?.extend || typeof m?.addLayer !== 'function') return false;
    const Layer = Grid.extend({
        createTile(coords: { x: number; y: number; z: number }, done: (error: Error | null, tile: HTMLCanvasElement) => void) {
            const tile = document.createElement('canvas');
            tile.width = RISK_TILE;
            tile.height = RISK_TILE;
            tile.className = 'wms-risk-tile';
            const product = settings.risk.active;
            const style = product ? settings.risk.products[product] : null;
            const url = product && style ? riskTileUrl(style.tileUrl, product, coords.z, coords.x, coords.y) : null;
            if (!product || !url) {
                done(null, tile);
                return tile;
            }
            loadRiskCanvas(tile, product, url, riskGeneration, () => done(null, tile));
            return tile;
        },
    });
    riskLayer = new Layer({
        tileSize: RISK_TILE,
        zIndex: 450,
        opacity: 1,
        updateWhenIdle: false,
        pane: ensureRiskPane(),
        className: 'wms-risk-layer',
    });
    try {
        riskLayer.addTo(map);
    } catch {
        riskLayer = null;
        return false;
    }
    return true;
}

function bindRiskView() {
    if (riskViewBound) return;
    riskViewBound = true;
    const m = map as any;
    m?.on?.('move', layoutRiskTiles);
    m?.on?.('zoom', layoutRiskTiles);
    m?.on?.('zoomend', layoutRiskTiles);
    m?.on?.('moveend', layoutRiskTiles);
    m?.on?.('resize', layoutRiskTiles);
    m?.on?.('viewreset', layoutRiskTiles);
}

function layoutRiskTiles() {
    const root = riskRoot;
    const layer = riskLayer;
    if (!root || !layer) return;
    const m = map as any;
    const product = settings.risk.active;
    const style = product ? settings.risk.products[product] : null;
    if (!product || !style || typeof m?.project !== 'function' || typeof m?.getCenter !== 'function' || typeof m?.getSize !== 'function') {
        return;
    }
    const zoom = Number(m.getZoom());
    const z = Math.round(zoom);
    if (!Number.isFinite(z)) return;
    const scale = 2 ** (zoom - z);
    const center = m.project(m.getCenter(), z);
    const size = m.getSize();
    const halfX = size.x / (2 * (scale || 1));
    const halfY = size.y / (2 * (scale || 1));
    const minX = Math.floor((center.x - halfX) / RISK_TILE) - 1;
    const maxX = Math.floor((center.x + halfX) / RISK_TILE) + 1;
    const limit = 2 ** z;
    const minY = Math.max(0, Math.floor((center.y - halfY) / RISK_TILE) - 1);
    const maxY = Math.min(limit - 1, Math.floor((center.y + halfY) / RISK_TILE) + 1);
    const wanted = new Set<string>();
    layer._tileZoom = z;
    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            const key = `${x}:${y}:${z}`;
            wanted.add(key);
            let entry = layer._tiles[key];
            if (!entry) {
                const tile = document.createElement('canvas');
                tile.width = RISK_TILE;
                tile.height = RISK_TILE;
                tile.className = 'wms-risk-tile';
                tile.style.position = 'absolute';
                tile.style.left = '0';
                tile.style.top = '0';
                tile.style.transformOrigin = '0 0';
                root.appendChild(tile);
                entry = { el: tile, coords: { x, y, z } };
                layer._tiles[key] = entry;
                const url = riskTileUrl(style.tileUrl, product, z, x, y);
                if (url) loadRiskCanvas(tile, product, url, riskGeneration);
            }
            const pixel = typeof win.L?.point === 'function' ? win.L.point(x * RISK_TILE, y * RISK_TILE) : { x: x * RISK_TILE, y: y * RISK_TILE };
            const nw = typeof m.unproject === 'function' ? m.unproject(pixel, z) : null;
            const point = nw && typeof m.latLngToLayerPoint === 'function' ? m.latLngToLayerPoint(nw) : null;
            if (point) {
                entry.el.style.transform = `translate(${point.x}px, ${point.y}px) scale(${scale})`;
            }
        }
    }
    for (const key of Object.keys(layer._tiles)) {
        if (wanted.has(key)) continue;
        layer._tiles[key].el.remove();
        delete layer._tiles[key];
    }
}

function ensureManualRiskLayer(): boolean {
    if (riskRoot && riskLayer) return true;
    const m = map as any;
    const pane = m?.getPane?.(ensureRiskPane()) ?? m?.getPanes?.()?.overlayPane;
    if (!pane) return false;
    const root = document.createElement('div');
    root.className = 'leaflet-layer wms-risk-layer';
    root.style.position = 'absolute';
    root.style.left = '0';
    root.style.top = '0';
    root.style.zIndex = '450';
    root.style.pointerEvents = 'none';
    pane.appendChild(root);
    riskRoot = root;
    riskLayer = { _tiles: {}, _tileZoom: null, redraw: layoutRiskTiles, remove: () => root.remove() };
    bindRiskView();
    layoutRiskTiles();
    return true;
}

function ensureRiskLayer(): boolean {
    if (riskLayer) return true;
    if (ensureGridRiskLayer()) return true;
    return ensureManualRiskLayer();
}

function applyRiskLayer() {
    if (!riskWanted) {
        if (riskLayer || riskRoot) removeRiskLayer();
        return;
    }
    if (globeOn()) {
        if (riskLayer || riskRoot) removeRiskLayer();
        riskNotice?.('Switch off the globe to see a risk product.');
        return;
    }
    const sig = riskSignature();
    if (!sig) {
        if (riskLayer || riskRoot) removeRiskLayer();
        riskNotice?.('');
        return;
    }
    const existing = Boolean(riskLayer);
    if (!ensureRiskLayer()) {
        riskNotice?.('This map cannot draw an extra tile layer.');
        return;
    }
    bindRiskPointer();
    if (!existing) {
        riskSig = sig;
        riskNotice?.('');
        return;
    }
    if (sig === riskSig) return;
    riskSig = sig;
    riskTileWarned = false;
    riskNotice?.('');
    riskGeneration += 1;
    try {
        if (riskRoot) {
            for (const entry of Object.values(riskLayer._tiles ?? {}) as { el: HTMLCanvasElement }[]) entry.el.remove();
            riskLayer._tiles = {};
            layoutRiskTiles();
        } else {
            riskLayer.redraw();
        }
    } catch {
        /* the next view change loads the tiles */
    }
}

export function apply() {
    const previousSig = JSON.stringify(recolorRules);
    rebuildRules();
    installInterceptors();
    schedulePrepare();
    applyBackground();
    applyLabels();
    applyLineVisibility();
    KINDS.forEach(applyKind);
    applyRiskLayer();
    syncRiskMenu();
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
    settings.risk = fresh.risk;
    saveSettings(settings);
    apply();
}

let started = false;
let lastLayerSig = '';
let shaderTimer = 0;

export function start() {
    riskWanted = true;
    installRiskMenu(settings, pickRiskFromMenu, dismissRiskFromMenu);
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

export function stop() {
    try {
        (map as any)?.off?.('mousemove', onRiskMove);
    } catch {
        /* ignore */
    }
    riskMoveBound = false;
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
