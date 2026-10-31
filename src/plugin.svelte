<section class="plugin__content">
    <p class="status" aria-live="polite">{status}</p>

    <h3>Risk</h3>
    <div class="block">
        <label class="row">
            <input type="radio" name="risk-product" checked={activeRisk === null} on:change={() => chooseRisk(null)} />
            <span class="grow">Off</span>
        </label>
    </div>
    {#each RISK_PRODUCTS as product}
        <div class="block">
            <label class="row">
                <input
                    type="radio"
                    name="risk-product"
                    checked={activeRisk === product}
                    on:change={() => chooseRisk(product)}
                />
                <span class="grow">{RISK_LABELS[product]}</span>
                <span class="swatch" style={`background:${legendGradient(s.risk.products[product].stops)}`}></span>
            </label>
            {#if activeRisk === product}
                <small class="note">{RISK_NOTES[product]}</small>
                <label class="sub" for="risk-url">Tile address</label>
                <input
                    id="risk-url"
                    class="addr"
                    type="url"
                    placeholder="https://tiles.example/{product}/{z}/{x}/{y}.png"
                    bind:value={s.risk.products[product].tileUrl}
                    on:change={() => changed()}
                />
                {#if !s.risk.products[product].tileUrl}
                    <small class="note">Paste a tile address to draw this product. It needs {'{z}'}, {'{x}'}, and {'{y}'}.</small>
                {:else if !riskAddressOk}
                    <small class="note">This address needs {'{z}'}, {'{x}'}, and {'{y}'}.</small>
                {/if}
                <div class="row tight">
                    <label class="grow" for="risk-opacity">Opacity: {opacityText}</label>
                    <input
                        id="risk-opacity"
                        class="slider"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        bind:value={s.risk.opacity}
                        on:change={() => {
                            const n = Number(s.risk.opacity);
                            s.risk.opacity = Math.round((Number.isFinite(n) ? n : 0.85) * 20) / 20;
                            changed();
                        }}
                    />
                </div>
                {#if product === 'hailSize'}
                    <div class="row tight">
                        <label class="grow" for="hail-unit">Show hail size in</label>
                        <select id="hail-unit" class="unit" bind:value={s.risk.hailUnit} on:change={() => changed()}>
                            <option value="mm">Millimetres</option>
                            <option value="cm">Centimetres</option>
                            <option value="in">Inches</option>
                        </select>
                    </div>
                {/if}
                <div class="legend" style={`background:${legendGradient(s.risk.products[product].stops)}`}></div>
                <div class="row tight">
                    <small>{scaleEndLabel(0)}</small>
                    <span class="grow"></span>
                    <small>{scaleEndLabel(-1)}</small>
                </div>
                <p class="status">{pointerText || (riskAddressOk ? 'Move over the map to read a value.' : '')}</p>
                {#if riskNote}
                    <small class="note">{riskNote}</small>
                {/if}
                <h4>Colour scale</h4>
                <small class="note">
                    {product === 'hailSize' ? 'Stops are in millimetres. The labels above follow the unit you picked.' : 'Stops are in percent.'}
                </small>
                {#each s.risk.products[product].stops as stop, index}
                    <div class="row tight">
                        <input
                            class="stop-value"
                            type="number"
                            step="0.1"
                            value={stop.value}
                            aria-label="Stop value"
                            on:change={e => setStopValue(index, e)}
                        />
                        <input
                            type="color"
                            value={stopColor(stop.color)}
                            aria-label="Stop colour"
                            on:change={e => setStopColor(index, e)}
                        />
                        <button class="btn" on:click={() => removeStop(index)} disabled={s.risk.products[product].stops.length < 2}>
                            Remove
                        </button>
                    </div>
                {/each}
                <div class="row wrap">
                    <button class="btn" on:click={addStop}>Add stop</button>
                    <label class="btn">
                        Import scale
                        <input type="file" accept="application/json,.json" hidden on:change={importScale} />
                    </label>
                    <button class="btn" on:click={saveScale}>Save scale</button>
                </div>
            {/if}
        </div>
    {/each}

    <h3>Background</h3>
    <div class="row">
        <label class="grow">
            <input type="checkbox" bind:checked={s.background.enabled} on:change={() => changed()} />
            Use my background colour
        </label>
        <input
            type="color"
            bind:value={s.background.color}
            on:change={() => {
                s.background.enabled = true;
                changed();
            }}
            aria-label="Background colour"
        />
    </div>
    <label class="sub">
        <input
            type="checkbox"
            bind:checked={s.background.hideWindyFill}
            disabled={!s.background.enabled}
            on:change={() => changed()}
        />
        Also hide Windy's own land and sea fill
    </label>

    <h3>Map details</h3>
    {#each KINDS as kind}
        <div class="block">
            <div class="row">
                <label class="grow">
                    <input type="checkbox" bind:checked={s.kinds[kind].visible} on:change={() => changed(kind)} />
                    {kindLabels[kind]}
                </label>
                <small>{layerInfo[kind]}</small>
            </div>
            <div class="row tight">
                <label class="grow">
                    <input type="checkbox" bind:checked={s.kinds[kind].recolor} on:change={() => changed(kind)} />
                    Change colour
                </label>
                <input
                    type="color"
                    bind:value={s.kinds[kind].color}
                    on:change={() => {
                        s.kinds[kind].recolor = true;
                        changed(kind);
                    }}
                    aria-label="{kindLabels[kind]} colour"
                />
                <select class="narrow" bind:value={s.kinds[kind].ink} on:change={() => changed(kind)} aria-label="Pixels to recolour">
                    <option value="all">All pixels</option>
                    <option value="dark">Dark parts</option>
                    <option value="light">Light parts</option>
                </select>
            </div>
            {#if kind !== 'labels'}
                <div class="row tight">
                    <label class="grow" for="thickness-{kind}">Line thickness: {thicknessText(s.kinds[kind].thickness)}×</label>
                    <input
                        id="thickness-{kind}"
                        type="range"
                        min="1"
                        max="5"
                        step="0.1"
                        bind:value={s.kinds[kind].thickness}
                        on:change={() => {
                            const n = Number(s.kinds[kind].thickness);
                            s.kinds[kind].thickness = Math.round((Number.isFinite(n) ? n : 1) * 10) / 10;
                            if (s.kinds[kind].thickness > 1) s.kinds[kind].recolor = true;
                            changed(kind);
                        }}
                        aria-label="{kindLabels[kind]} thickness"
                        class="slider"
                    />
                </div>
            {/if}
        </div>
    {/each}
    <small class="note">
        Windy draws coastlines, borders, rivers and streams in one image. Each row below is one of those line strengths,
        with its own colour and thickness. Coasts and country borders are the strongest lines. A river can join a stronger
        group when you zoom in. Label colour changes the place names. The background colour replaces Windy's land and sea fill.
    </small>

    {#each iconGroups as group}
        <h3>{group.title}</h3>
        {#each group.icons as icon}
            <div class="block">
                <div class="row wrap">
                    <span class="grow">{iconLabels[icon]}</span>
                    {#if s.icons[icon].dataUrl}
                        <img class="thumb" src={s.icons[icon].dataUrl} alt="" />
                        <button class="btn" on:click={() => clearIcon(icon)}>Remove</button>
                    {/if}
                    <label class="btn">
                        {s.icons[icon].dataUrl ? 'Replace' : 'Choose image'}
                        <input type="file" accept="image/*" hidden on:change={e => pickIcon(e, icon)} />
                    </label>
                </div>
            </div>
        {/each}
        <small class="note">{group.note}</small>
    {/each}

    <h3>Inspector</h3>
    <div class="row wrap">
        <button class="btn" on:click={doScan}>Scan map and textures</button>
        <button class="btn" on:click={copyDiag}>Copy report</button>
        <button class="btn danger" on:click={doReset}>Reset all</button>
    </div>

    {#if diagText}
        <textarea readonly rows="8" value={diagText}></textarea>
    {/if}

    {#if scanResult}
        <h4>Map layers ({scanResult.layers.length})</h4>
        {#if !scanResult.layers.length}
            <small class="note">No layers were readable. Copy the report and send it back so the engine can be adjusted.</small>
        {/if}
        {#each scanResult.layers as layer}
            <div class="row tight wrap">
                <span class="grow mono">{layer.id} <small>{layer.type}</small></span>
                {#each KINDS as kind}
                    <button
                        class="chip"
                        class:on={isAssigned(kind, layer.id)}
                        on:click={() => toggleLayer(kind, layer.id)}
                        title={kindLabels[kind]}
                    >
                        {kindShort[kind]}
                    </button>
                {/each}
            </div>
        {/each}

        <h4>Map image sources ({scanResult.tilePrefixes.length})</h4>
        {#each scanResult.tilePrefixes as t}
            <div class="row tight wrap">
                <span class="grow mono path">{shortUrl(t.prefix)} <small>{t.count} tiles</small></span>
                {#each KINDS as kind}
                    <button
                        class="chip"
                        class:on={s.kinds[kind].tilePrefix === t.prefix}
                        on:click={() => setPrefix(kind, t.prefix)}
                        title={kindLabels[kind]}
                    >
                        {kindShort[kind]}
                    </button>
                {/each}
            </div>
        {/each}

        <small class="note">Letters: C coasts, G regional, R rivers, S streams, L labels.</small>
    {/if}
</section>

<script lang="ts">
    import { onMount } from 'svelte';
    import {
        KINDS,
        PATTERN_ICONS,
        RADAR_ICONS,
        commit,
        effectivePrefix,
        fileToIcon,
        diagnostics,
        resetAll,
        resolveLayers,
        scan,
        settings,
        start,
        stop,
        watchRiskNotice,
        watchRiskPointer,
    } from './engine';
    import type { IconKind, Kind, ScanResult } from './engine';
    import { formatRiskValue, formatScale, legendGradient, parseScale, RISK_LABELS, RISK_NOTES, RISK_PRODUCTS, riskTileUrl } from './risk';
    import type { RiskProduct } from './risk';

    let s = settings;
    let status = '';
    let diagText = '';
    let scanResult: ScanResult | null = null;
    let pointerText = '';
    let riskNote = '';
    let layerInfo: Record<Kind, string> = { major: '', regional: '', rivers: '', streams: '', labels: '' };

    const kindLabels: Record<Kind, string> = {
        major: 'Coastlines and country borders',
        regional: 'Regional borders and major rivers',
        rivers: 'Rivers and lakes',
        streams: 'Streams and creeks',
        labels: 'Labels',
    };
    const kindShort: Record<Kind, string> = { major: 'C', regional: 'G', rivers: 'R', streams: 'S', labels: 'L' };
    const iconLabels: Record<IconKind, string> = {
        lightning: 'Lightning',
        snow: 'Snow',
        hail: 'Hail',
        rain: 'Rain',
        thunder: 'Thunder',
    };
    const iconGroups: { title: string; icons: IconKind[]; note: string }[] = [
        {
            title: 'Radar and satellite',
            icons: RADAR_ICONS,
            note: 'Radar and satellite share these symbols. Lightning is the bolt, snow is the flake, and hail is the round mark. The picture is the shape, and Windy still colours it. A picture with a transparent background works best. Switch that layer off and on after choosing an image.',
        },
        {
            title: 'Rain, thunder',
            icons: PATTERN_ICONS,
            note: 'These are the repeating marks on the Rain, thunder layer. Rain changes the precipitation symbols and thunder changes the lightning symbols. Windy still tints them. Switch that layer off and on after choosing an image.',
        },
    ];

    $: activeRisk = (s.risk.active || null) as RiskProduct | null;
    $: riskAddressOk = activeRisk ? riskTileUrl(s.risk.products[activeRisk].tileUrl, activeRisk, 0, 0, 0) !== null : false;
    $: opacityText = (Number(s.risk.opacity) || 0).toFixed(2);

    const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const stopColor = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color : '#888888');
    const thicknessText = (value: number | string | null | undefined) => {
        const n = Number(value);
        return (Number.isFinite(n) ? n : 1).toFixed(1);
    };

    function refreshInfo() {
        for (const k of KINDS) {
            const n = resolveLayers(k).length;
            const p = effectivePrefix(k);
            layerInfo[k] = n ? `${n} layer${n > 1 ? 's' : ''}` : p ? 'image source found' : 'not found yet';
        }
        layerInfo = layerInfo;
    }

    function changed(kind?: Kind, note?: string) {
        if (kind) {
            s.kinds[kind].touched = true;
            // ensure thickness has a value (handles old saved settings without thickness)
            if (s.kinds[kind].thickness == null) s.kinds[kind].thickness = 1;
        }
        s = s;
        status = commit() ? (note ?? 'Saved') : 'Could not save: browser storage is full or blocked';
        refreshInfo();
    }

    const iconSaved = 'Saved. Switch that layer off and on to show the new symbol.';

    async function pickIcon(e: Event, icon: IconKind) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            s.icons[icon].dataUrl = await fileToIcon(file);
            changed(undefined, iconSaved);
        } catch {
            status = 'That file could not be read as an image';
        }
        input.value = '';
    }

    function clearIcon(icon: IconKind) {
        s.icons[icon].dataUrl = null;
        changed(undefined, iconSaved);
    }

    function setPrefix(kind: Kind, prefix: string) {
        s.kinds[kind].tilePrefix = s.kinds[kind].tilePrefix === prefix ? '' : prefix;
        changed(kind);
    }

    function isAssigned(kind: Kind, id: string): boolean {
        return resolveLayers(kind).some(l => l.id === id);
    }

    function toggleLayer(kind: Kind, id: string) {
        const current = resolveLayers(kind).map(l => l.id);
        s.kinds[kind].layerIds = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        changed(kind);
    }

    function doScan() {
        scanResult = scan();
        refreshInfo();
        status = `Found ${scanResult.layers.length} layers and ${scanResult.tilePrefixes.length} image sources`;
    }

    async function copyDiag() {
        const text = diagnostics();
        try {
            await navigator.clipboard.writeText(text);
            status = 'Report copied';
            diagText = '';
        } catch {
            diagText = text;
            status = 'Copy is blocked here. Select the text below and copy it by hand.';
        }
    }

    function chooseRisk(product: RiskProduct | null) {
        s.risk.active = product;
        pointerText = '';
        riskNote = '';
        changed();
    }

    function scaleEndLabel(index: number): string {
        if (!activeRisk) return '';
        const stops = [...s.risk.products[activeRisk].stops].sort((a, b) => a.value - b.value);
        const stop = index < 0 ? stops[stops.length - 1] : stops[0];
        return stop ? formatRiskValue(activeRisk, stop.value, s.risk.hailUnit) : '';
    }

    function setStopValue(index: number, e: Event) {
        if (!activeRisk) return;
        const n = Number((e.target as HTMLInputElement).value);
        if (!Number.isFinite(n)) return;
        s.risk.products[activeRisk].stops[index].value = Math.round(n * 10) / 10;
        s.risk.products[activeRisk].stops = [...s.risk.products[activeRisk].stops].sort((a, b) => a.value - b.value);
        changed();
    }

    function setStopColor(index: number, e: Event) {
        if (!activeRisk) return;
        s.risk.products[activeRisk].stops[index].color = (e.target as HTMLInputElement).value;
        changed();
    }

    function addStop() {
        if (!activeRisk) return;
        const stops = s.risk.products[activeRisk].stops;
        const last = stops[stops.length - 1] ?? { value: 0, color: '#b71c1c' };
        const step = activeRisk === 'hailSize' ? 10 : 5;
        stops.push({ value: Math.round((last.value + step) * 10) / 10, color: last.color });
        changed();
    }

    function removeStop(index: number) {
        if (!activeRisk || s.risk.products[activeRisk].stops.length < 2) return;
        s.risk.products[activeRisk].stops.splice(index, 1);
        s.risk.products[activeRisk].stops = s.risk.products[activeRisk].stops;
        changed();
    }

    async function importScale(e: Event) {
        if (!activeRisk) return;
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            const parsed = parseScale(await file.text());
            if (!parsed.ok) {
                status = parsed.error;
                return;
            }
            s.risk.products[activeRisk].stops = parsed.stops;
            changed();
            status = 'Colour scale imported';
        } catch {
            status = 'That file could not be read.';
        }
    }

    function saveScale() {
        if (!activeRisk) return;
        const blob = new Blob([formatScale(s.risk.products[activeRisk].stops)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${activeRisk}-scale.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    }

    function doReset() {
        resetAll();
        s = settings;
        scanResult = null;
        diagText = '';
        pointerText = '';
        riskNote = '';
        status = 'Back to Windy defaults. Reload the page to restore anything already redrawn.';
        refreshInfo();
    }

    onMount(() => {
        start();
        const unwatch = watchRiskPointer(text => {
            pointerText = text;
        });
        const unnote = watchRiskNotice(text => {
            riskNote = text;
        });
        refreshInfo();
        s = settings;
        return () => {
            unwatch();
            unnote();
            stop();
        };
    });
</script>

<style>
    .plugin__content {
        padding: 6px 14px 24px;
        font-size: 14px;
        line-height: 1.4;
    }
    .status {
        min-height: 1.4em;
        margin: 0 0 4px;
        opacity: 0.75;
    }
    h3 {
        margin: 18px 0 6px;
        font-size: 15px;
        font-weight: 600;
    }
    h4 {
        margin: 14px 0 4px;
        font-size: 13px;
        font-weight: 600;
        opacity: 0.85;
    }
    .block {
        border-top: 1px solid rgba(128, 128, 128, 0.35);
        padding: 4px 0;
    }
    .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
    }
    .row.tight {
        padding: 3px 0;
    }
    .row.wrap {
        flex-wrap: wrap;
    }
    .grow {
        flex: 1;
        min-width: 0;
    }
    .sub {
        display: block;
        padding: 2px 0 6px;
    }
    label {
        cursor: pointer;
    }
    small {
        opacity: 0.65;
    }
    .note {
        display: block;
        margin-top: 8px;
    }
    .mono {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
    }
    .path {
        overflow-wrap: anywhere;
    }
    input[type='color'] {
        width: 34px;
        height: 28px;
        padding: 0;
        border: 1px solid rgba(128, 128, 128, 0.5);
        border-radius: 6px;
        background: none;
    }
    .slider {
        width: 180px;
        cursor: pointer;
    }
    .addr {
        box-sizing: border-box;
        width: 100%;
        margin: 2px 0 6px;
        font: inherit;
    }
    .stop-value {
        width: 90px;
    }
    .legend {
        height: 14px;
        margin: 8px 0 2px;
        border-radius: 7px;
    }
    .narrow {
        max-width: 110px;
    }
    .unit {
        max-width: 150px;
    }
    .swatch {
        width: 72px;
        height: 14px;
        border-radius: 7px;
        flex: none;
    }
    .thumb {
        width: 28px;
        height: 28px;
        object-fit: contain;
        border-radius: 4px;
        background: rgba(128, 128, 128, 0.25);
    }
    .btn {
        display: inline-block;
        padding: 6px 12px;
        border: 1px solid rgba(128, 128, 128, 0.55);
        border-radius: 8px;
        background: rgba(128, 128, 128, 0.15);
        color: inherit;
        font: inherit;
        cursor: pointer;
    }
    .btn.danger {
        border-color: rgba(220, 80, 80, 0.7);
    }
    .btn:disabled {
        opacity: 0.45;
        cursor: default;
    }
    .chip {
        min-width: 30px;
        padding: 3px 6px;
        border: 1px solid rgba(128, 128, 128, 0.55);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
    }
    .chip.on {
        background: #2d8cff;
        border-color: #2d8cff;
        color: #fff;
    }
    textarea {
        width: 100%;
        margin-top: 8px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 11px;
    }
</style>
