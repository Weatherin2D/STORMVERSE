<section class="plugin__content">
    <p class="status" aria-live="polite">{status}</p>

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
                <select bind:value={s.kinds[kind].ink} on:change={() => changed(kind)} aria-label="Pixels to recolour">
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
    } from './engine';
    import type { IconKind, Kind, ScanResult } from './engine';

    let s = settings;
    let status = '';
    let diagText = '';
    let scanResult: ScanResult | null = null;
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

    const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '');
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

    function doReset() {
        resetAll();
        s = settings;
        scanResult = null;
        diagText = '';
        status = 'Back to Windy defaults. Reload the page to restore anything already redrawn.';
        refreshInfo();
    }

    onMount(() => {
        start();
        refreshInfo();
        s = settings;
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
    select {
        max-width: 110px;
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
