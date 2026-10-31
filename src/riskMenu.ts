import store from '@windy/store';
import { addRiskIdents, defaultStops, RISK_LABELS, RISK_MENU_IDENTS, RISK_PRODUCTS } from './risk';
import type { RiskProduct } from './risk';
import type { Settings } from './settings';

let settings: Settings | null = null;

const FALLBACK_ID = 'wms-risk-fallback';
const MENU_ID = 'wms-risk-menu';
const PLUGIN_NAME = 'windy-plugin-map-style';

let onPick: ((product: RiskProduct) => void) | null = null;
let onDismiss: (() => void) | null = null;
let observer: MutationObserver | null = null;
let paintTimer = 0;
let refreshTimer = 0;
let seenOverlay: string | null = null;
let installed = false;
let painting = false;
let groupsReady = false;
let paintedSig = '';

function stopsSig(): string {
    if (!settings) return '';
    return RISK_PRODUCTS.map(product => JSON.stringify(settings.risk.products[product].stops)).join('|');
}

function menuSig(): string {
    return `${settings?.risk.active ?? ''}|${stopsSig()}|${groupsReady ? 1 : 0}`;
}

function safeColor(color: string): string {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : '#888888';
}

function drawGlyph(context: CanvasRenderingContext2D, product: RiskProduct) {
    context.save();
    context.translate(85, 58);
    context.strokeStyle = '#fff';
    context.fillStyle = '#fff';
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = 'rgba(0,0,0,0.55)';
    context.shadowBlur = 8;
    if (product === 'convective') {
        context.beginPath();
        context.moveTo(0, -34);
        context.lineTo(32, 26);
        context.lineTo(-32, 26);
        context.closePath();
        context.stroke();
    } else if (product === 'tornado') {
        context.beginPath();
        context.moveTo(-30, -28);
        context.quadraticCurveTo(34, -8, -8, 8);
        context.quadraticCurveTo(-28, 22, 0, 36);
        context.stroke();
    } else if (product === 'largeHail') {
        for (const [x, y] of [
            [-18, -6],
            [16, -14],
            [0, 16],
        ] as const) {
            context.beginPath();
            context.arc(x, y, 11, 0, Math.PI * 2);
            context.fill();
        }
    } else if (product === 'damagingWinds') {
        for (const y of [-20, 2, 24]) {
            context.beginPath();
            context.moveTo(-36, y);
            context.bezierCurveTo(-8, y - 18, 8, y + 18, 38, y);
            context.stroke();
        }
    } else if (product === 'hailSize') {
        context.beginPath();
        context.arc(0, 2, 26, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.arc(0, 2, 7, 0, Math.PI * 2);
        context.fill();
    } else {
        context.beginPath();
        context.moveTo(8, -36);
        context.lineTo(-16, 2);
        context.lineTo(2, 2);
        context.lineTo(-8, 36);
        context.lineTo(18, -6);
        context.lineTo(0, -6);
        context.closePath();
        context.fill();
    }
    context.restore();
}

function thumbnail(product: RiskProduct): string {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 170;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) return '';
        const stops = [...(settings?.risk.products[product].stops ?? defaultStops(product))]
            .filter(stop => Number.isFinite(stop.value))
            .sort((a, b) => a.value - b.value);
        const gradient = context.createLinearGradient(0, 0, 170, 128);
        const usable = stops.length ? stops : defaultStops(product);
        usable.forEach((stop, index) => {
            const offset = usable.length === 1 ? 0 : index / (usable.length - 1);
            gradient.addColorStop(Math.min(1, Math.max(0, offset)), safeColor(stop.color));
        });
        context.fillStyle = gradient;
        context.fillRect(0, 0, 170, 128);
        drawGlyph(context, product);
        if (settings?.risk.active === product) {
            context.strokeStyle = '#ffffff';
            context.lineWidth = 10;
            context.strokeRect(8, 8, 154, 112);
        }
        return canvas.toDataURL('image/png');
    } catch {
        return '';
    }
}

function overlays(): Record<string, unknown> | null {
    const found = (window as any).W?.overlays;
    return found && typeof found === 'object' ? found : null;
}

function registerOverlays() {
    const target = overlays();
    if (!target) return;
    for (const product of RISK_PRODUCTS) {
        const ident = RISK_MENU_IDENTS[product];
        target[ident] = {
            ident,
            icon: '',
            getMenuName: () => RISK_LABELS[product],
            getMenuIdent: () => ident,
            getMenuImagePath: () => thumbnail(product),
            onClick: () => {
                try {
                    onPick?.(product);
                } catch {
                    /* the menu click still has to finish */
                }
            },
        };
    }
}

function overlayListUrl(): string | null {
    const scripts = [...document.scripts].map(script => script.src);
    const fromScripts = scripts.find(src => /\/v\/[^/]+\/index\.js(?:\?|$)/.test(src));
    const fromResources = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(src => /\/v\/[^/]+\/index\.js(?:\?|$)/.test(src));
    const core = fromScripts || fromResources;
    if (!core) return null;
    return core.replace(/index\.js(\?.*)?$/, 'plugins/_shared-overlay-list.js');
}

async function attachGroups() {
    registerOverlays();
    const url = overlayListUrl();
    if (!url) return;
    const mod = await import(/* @vite-ignore */ url);
    if (Array.isArray(mod?.t?.rain)) addRiskIdents(mod.t.rain);
    if (Array.isArray(mod?.n?.rain)) addRiskIdents(mod.n.rain);
        groupsReady = true;
        scheduleRefresh();
        schedulePaint();
    }

function nudge(key: string) {
    const current = store.get(key);
    if (!Array.isArray(current) || typeof (store as { set?: (k: string, v: unknown) => void }).set !== 'function') return;
    (store as { set: (k: string, v: unknown) => void }).set(key, current.slice());
}

function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
        try {
            const sig = menuSig();
            if (sig === paintedSig) return;
            paintedSig = sig;
            nudge('favOverlaysDesktop');
            nudge('favOverlaysMobile');
        } catch {
            /* the tiles still appear the next time the menu is created */
        }
    }, 30);
}

function ensureStyle() {
    const id = 'wms-risk-menu-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = [
        '#wms-risk-fallback .wms-risk-item{height:auto;min-height:95px;color:inherit;cursor:pointer}',
        '#wms-risk-fallback .wms-risk-item .rounded-box{border-radius:8px}',
    ].join('');
    document.head.appendChild(style);
}

function markSelected(grid: HTMLElement) {
    const active = settings?.risk.active;
    for (const item of grid.querySelectorAll<HTMLElement>('.wms-risk-item')) {
        const on = item.dataset.product === active;
        item.classList.toggle('overlay-item--selected', on);
        item.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
}

function fillGrid(grid: HTMLElement) {
    grid.replaceChildren();
    grid.dataset.stops = stopsSig();
    for (const product of RISK_PRODUCTS) {
        const item = document.createElement('a');
        item.className = 'overlay-item wms-risk-item';
        item.dataset.product = product;
        item.href = '#';
        item.setAttribute('role', 'button');
        const box = document.createElement('div');
        box.className = 'rounded-box';
        const image = thumbnail(product);
        if (image) box.style.backgroundImage = `url("${image}")`;
        const label = document.createElement('span');
        label.textContent = RISK_LABELS[product];
        item.append(box, label);
        const choose = () => onPick?.(product);
        item.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            choose();
            markSelected(grid);
        });
        item.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            choose();
            markSelected(grid);
        });
        grid.append(item);
    }
    markSelected(grid);
}

function hasOfficial(root: ParentNode): boolean {
    const hit = root.querySelector(`[data-ident="${RISK_MENU_IDENTS.convective}"]`);
    return Boolean(hit && !hit.closest(`#${FALLBACK_ID}`));
}

/**
 * The layer list is a Svelte each-block. Nodes inserted between its categories get
 * removed, and removing them from here used to abort the plugin while it was opening.
 * This block is appended after that list, and only while the real tiles are absent.
 */
function ensureFallback(root: HTMLElement) {
    if (hasOfficial(root)) {
        document.getElementById(FALLBACK_ID)?.remove();
        return;
    }
    ensureStyle();
    let block = document.getElementById(FALLBACK_ID);
    if (!block) {
        block = document.createElement('div');
        block.id = FALLBACK_ID;
        const title = document.createElement('div');
        title.className = 'category-title disabled inlined mb-10 ml-5 size-xs mt-20';
        title.textContent = 'Risk';
        const grid = document.createElement('div');
        grid.id = MENU_ID;
        grid.className = 'overlay-thumbnails';
        block.append(title, grid);
        fillGrid(grid);
        root.appendChild(block);
        return;
    }
    const grid = block.querySelector<HTMLElement>(`#${MENU_ID}`);
    if (!grid) return;
    if (grid.dataset.stops !== stopsSig()) fillGrid(grid);
    else markSelected(grid);
}

/** Windy only listens on the words "Map style", not the palette icon. */
function widenMapStyleHitTarget() {
    for (const title of document.querySelectorAll<HTMLElement>('.title')) {
        if (title.textContent?.trim() !== 'Map style') continue;
        const row = title.closest('a');
        if (!row || row.dataset.wmsHit === '1') continue;
        row.dataset.wmsHit = '1';
        row.style.cursor = 'pointer';
        row.addEventListener('click', event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest('.title')) return;
            if (target.closest('[data-tooltip]')) return;
            event.preventDefault();
            try {
                (window as any).W?.broadcast?.emit?.('rqstOpen', PLUGIN_NAME);
            } catch {
                /* the title click is unchanged */
            }
        });
    }
}

function paintMenu() {
    if (painting) return;
    painting = true;
    try {
        widenMapStyleHitTarget();
        const root = document.querySelector<HTMLElement>('.menu-items-desktop');
        if (root) ensureFallback(root);
    } catch {
        /* opening the plugin must not depend on the menu */
    } finally {
        painting = false;
    }
}

function schedulePaint() {
    window.clearTimeout(paintTimer);
    paintTimer = window.setTimeout(paintMenu, 30);
}

function menuWasTouched(record: MutationRecord): boolean {
    const target = record.target;
    if (target instanceof Element) {
        if (target.closest(`#${FALLBACK_ID}`)) return false;
        if (target.closest('.menu-items-desktop, .menu-top')) return true;
    }
    for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.id === FALLBACK_ID) continue;
        if (node.matches('.menu-items-desktop, .menu-top') || node.querySelector('.menu-items-desktop, .menu-top')) return true;
    }
    return false;
}

function onOverlay(next: unknown) {
    const value = String(next ?? '');
    if (seenOverlay === null) {
        seenOverlay = value;
        return;
    }
    if (value === seenOverlay) return;
    seenOverlay = value;
    if (settings?.risk.active) onDismiss?.();
}

/** Keep the products in the layer menu for the rest of the visit. Closing this pane does not remove them. */
export function installRiskMenu(source: Settings, pick: (product: RiskProduct) => void, dismiss: () => void) {
    settings = source;
    onPick = pick;
    onDismiss = dismiss;
    try {
        if (!installed) {
            installed = true;
            try {
                seenOverlay = String(store.get('overlay') ?? '');
                store.on('overlay', onOverlay);
            } catch {
                seenOverlay = '';
            }
            observer = new MutationObserver(records => {
                if (records.some(menuWasTouched)) schedulePaint();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
        registerOverlays();
        void attachGroups().catch(() => {
            /* the fallback block still lists the products */
        });
    } catch {
        /* the pane still opens */
    }
    schedulePaint();
}

/** Called after settings change. Safe to call while the layer menu is open. */
export function syncRiskMenu() {
    try {
        registerOverlays();
    } catch {
        /* the pane still updates */
    }
    schedulePaint();
    const sig = menuSig();
    if (sig === paintedSig) return;
    scheduleRefresh();
}
