import { defaultStops, RISK_PRODUCTS } from './risk';
import type { ColorStop, HailUnit, RiskProduct } from './risk';

export type { ColorStop, HailUnit, RiskProduct };
export type Kind = 'major' | 'regional' | 'rivers' | 'streams' | 'labels';
export type IconKind = 'lightning' | 'snow' | 'hail' | 'rain' | 'thunder';
export type InkTarget = 'all' | 'dark' | 'light';

export interface KindStyle {
    /** False until the user changes something, so an untouched plugin never fights Windy's own styling. */
    touched: boolean;
    visible: boolean;
    recolor: boolean;
    color: string;
    /** Which pixels of a baked (raster) tile get the new colour. */
    ink: InkTarget;
    /** Line thickness from 1 to 5, in steps of 0.1. 1 keeps the original width. */
    thickness: number;
    /** Manual list of map layer ids. Empty means "auto-detect by name". */
    layerIds: string[];
    /** Manual tile URL prefix (everything before /z/x/y). Empty means "read it from the layer's source". */
    tilePrefix: string;
}

export interface IconStyle {
    /** The user's replacement image, downscaled, as a data URL. */
    dataUrl: string | null;
}

export interface RiskProductStyle {
    /** URL with `{z}`, `{x}`, and `{y}`. `{product}` is filled with the product id. */
    tileUrl: string;
    stops: ColorStop[];
}

export interface RiskSettings {
    /** Null leaves the risk overlay off. */
    active: RiskProduct | null;
    /** 0–1, baked into the tile colours. */
    opacity: number;
    /** Display unit for predicted hail size. The scale itself stays in millimetres. */
    hailUnit: HailUnit;
    products: Record<RiskProduct, RiskProductStyle>;
}

export interface Settings {
    version: 1;
    background: { enabled: boolean; color: string; hideWindyFill: boolean };
    kinds: Record<Kind, KindStyle>;
    icons: Record<IconKind, IconStyle>;
    risk: RiskSettings;
}

export const STORAGE_KEY = 'windy-plugin-map-style:v1';

const riskProduct = (product: RiskProduct): RiskProductStyle => ({
    tileUrl: '',
    stops: defaultStops(product),
});

const kind = (color: string, ink: InkTarget): KindStyle => ({
    touched: false,
    visible: true,
    recolor: false,
    color,
    ink,
    thickness: 1,
    layerIds: [],
    tilePrefix: '',
});

export const defaults = (): Settings => ({
    version: 1,
    background: { enabled: false, color: '#1b2430', hideWindyFill: false },
    kinds: {
        major: kind('#ffffff', 'all'),
        regional: kind('#ffd166', 'all'),
        rivers: kind('#3d9ee8', 'all'),
        streams: kind('#8aa0b4', 'all'),
        labels: kind('#ffffff', 'dark'),
    },
    icons: {
        lightning: { dataUrl: null },
        snow: { dataUrl: null },
        hail: { dataUrl: null },
        rain: { dataUrl: null },
        thunder: { dataUrl: null },
    },
    risk: {
        active: null,
        opacity: 0.85,
        hailUnit: 'mm',
        products: {
            convective: riskProduct('convective'),
            tornado: riskProduct('tornado'),
            largeHail: riskProduct('largeHail'),
            damagingWinds: riskProduct('damagingWinds'),
            hailSize: riskProduct('hailSize'),
            thunder: riskProduct('thunder'),
        },
    },
});

function merge<T>(base: T, over: any): T {
    if (!over || typeof over !== 'object') {
        return base;
    }
    const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
    for (const key of Object.keys(over)) {
        const b = (base as any)[key];
        const o = over[key];
        if (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object') {
            out[key] = merge(b, o);
        } else if (b === undefined || b === null || typeof b === typeof o) {
            out[key] = o;
        }
    }
    return out;
}

function migrateKinds(parsed: any) {
    const kinds = parsed?.kinds;
    if (!kinds || typeof kinds !== 'object') return;
    if (kinds.outlines && !kinds.major) kinds.major = kinds.outlines;
    if (kinds.borders && !kinds.regional) kinds.regional = kinds.borders;
    delete kinds.outlines;
    delete kinds.borders;
}

function sanitizeRisk(settings: Settings) {
    const risk = settings.risk;
    if (risk.hailUnit !== 'mm' && risk.hailUnit !== 'cm' && risk.hailUnit !== 'in') risk.hailUnit = 'mm';
    if (risk.active !== null && !RISK_PRODUCTS.includes(risk.active)) risk.active = null;
    const opacity = Number(risk.opacity);
    risk.opacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.85;
    for (const product of RISK_PRODUCTS) {
        const style = risk.products[product];
        if (!style || typeof style.tileUrl !== 'string' || !Array.isArray(style.stops) || !style.stops.length) {
            risk.products[product] = riskProduct(product);
        }
    }
}

export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults();
        const parsed = JSON.parse(raw);
        migrateKinds(parsed);
        const settings = merge(defaults(), parsed);
        sanitizeRisk(settings);
        return settings;
    } catch {
        return defaults();
    }
}

/** Returns false if the browser refused the write (storage full or blocked). */
export function saveSettings(s: Settings): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        return true;
    } catch {
        return false;
    }
}
