import store from '@windy/store';
import { RISK_LABELS, RISK_PRODUCTS } from './risk';
import type { RiskProduct } from './risk';
import type { Settings } from './settings';

let settings: Settings | null = null;

const MENU_ID = 'wms-risk-menu';
const TITLE_CLASS = 'wms-risk-menu-title';

let onPick: ((product: RiskProduct) => void) | null = null;
let onDismiss: (() => void) | null = null;
let observer: MutationObserver | null = null;
let timer = 0;
let seenOverlay: string | null = null;
let installed = false;

function stopsSig(): string {
    if (!settings) return '';
    return RISK_PRODUCTS.map(product => JSON.stringify(settings.risk.products[product].stops)).join('|');
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
    const canvas = document.createElement('canvas');
    canvas.width = 170;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return '';
    const stops = [...(settings?.risk.products[product].stops ?? [])].sort((a, b) => a.value - b.value);
    const gradient = context.createLinearGradient(0, 0, 170, 128);
    stops.forEach((stop, index) => {
        const offset = stops.length === 1 ? 0 : index / (stops.length - 1);
        gradient.addColorStop(Math.min(1, Math.max(0, offset)), stop.color);
    });
    context.fillStyle = gradient;
    context.fillRect(0, 0, 170, 128);
    drawGlyph(context, product);
    return canvas.toDataURL('image/png');
}

function categoryGrids(root: ParentNode): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('.overlay-thumbnails')].filter(grid => {
        if (grid.id === MENU_ID) return false;
        return grid.previousElementSibling?.classList.contains('category-title') ?? false;
    });
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
        const item = document.createElement('div');
        item.className = 'overlay-item wms-risk-item';
        item.dataset.product = product;
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
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
        });
        item.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            choose();
        });
        grid.append(item);
    }
    markSelected(grid);
}

function ensureStyle() {
    const id = 'wms-risk-menu-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = [
        '.wms-risk-menu-title{margin:18px 0 8px 5px;font-size:13px;letter-spacing:.02em;opacity:.8}',
        '.overlay-thumbnails .wms-risk-item{height:auto;min-height:95px;color:inherit}',
        '.overlay-thumbnails .wms-risk-item .rounded-box{border-radius:8px}',
    ].join('');
    document.head.appendChild(style);
}

/** Put the Risk category under Rain, snow in Windy's layer menu. */
export function syncRiskMenu() {
    if (!installed) return;
    const root = document.querySelector('.menu-items-desktop');
    if (!root) return;
    const grids = categoryGrids(root);
    const rain = grids.find(grid => grid.querySelector('[data-ident="rain"]')) ?? grids.at(-1);
    if (!rain?.parentElement) return;
    ensureStyle();
    let title = root.querySelector<HTMLElement>(`.${TITLE_CLASS}`);
    let grid = root.querySelector<HTMLElement>(`#${MENU_ID}`);
    const placed = title && grid && rain.nextElementSibling === title && title.nextElementSibling === grid;
    if (!placed) {
        title?.remove();
        grid?.remove();
        title = document.createElement('div');
        title.className = `category-title disabled inlined mb-10 ml-5 size-xs mt-20 ${TITLE_CLASS}`;
        title.textContent = 'Risk';
        grid = document.createElement('div');
        grid.id = MENU_ID;
        grid.className = 'overlay-thumbnails';
        rain.insertAdjacentElement('afterend', grid);
        grid.insertAdjacentElement('beforebegin', title);
        fillGrid(grid);
        return;
    }
    if (grid.dataset.stops !== stopsSig()) fillGrid(grid);
    else markSelected(grid);
}

function menuWasTouched(records: MutationRecord[]): boolean {
    for (const record of records) {
        const target = record.target;
        if (target instanceof Element && target.closest('.menu-items-desktop')) return true;
        for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.classList.contains('menu-items-desktop') || node.querySelector('.menu-items-desktop')) return true;
        }
    }
    return false;
}

function scheduleSync(records: MutationRecord[]) {
    if (!menuWasTouched(records)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(syncRiskMenu, 60);
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

/** Keep the category in place for the rest of the visit. Closing the plugin pane does not remove it. */
export function installRiskMenu(source: Settings, pick: (product: RiskProduct) => void, dismiss: () => void) {
    settings = source;
    onPick = pick;
    onDismiss = dismiss;
    if (installed) {
        syncRiskMenu();
        return;
    }
    installed = true;
    try {
        seenOverlay = String(store.get('overlay') ?? '');
        store.on('overlay', onOverlay);
    } catch {
        seenOverlay = '';
    }
    observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    syncRiskMenu();
}
