import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    fragmentForBackground,
    isAutoBasemapTile,
    labelCss,
    recolorImageData,
    rulesForUrl,
} from '../src/recolor.ts';
import type { RecolorRule } from '../src/recolor.ts';

const outline: RecolorRule = {
    kind: 'outlines',
    prefixes: [],
    color: [255, 0, 0],
    ink: 'all',
    thickness: 1,
};
const border: RecolorRule = {
    kind: 'borders',
    prefixes: [],
    color: [0, 0, 255],
    ink: 'all',
    thickness: 1,
};

const SHADER =
    'vec4 sample=texture2D(tex,uv);vec3 sea=vec3(0.114,0.22,0.51);vec3 land=vec3(0.176,0.266,0.0);return vec4(mix(sea,land,sample.a),1.0);';

test('basemap matcher ignores weather tiles and the land mask', () => {
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/tiles/v11.2/darkmap/4/8/5.png'), true);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/tiles/v11.2/darkmap-retina/4/8/5.png'), true);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/tiles/v11.2/in/darkmap/4/8/5.png'), true);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/tiles/v11.2/simple-retina/5/16/10.png'), true);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/v1/maptiles/outdoor/256/4/8/5/?lang=en'), true);
    assert.equal(isAutoBasemapTile('https://node.windy.com/maptile/2.1/maptile/newest/satellite.day/4/8/5/256/jpg'), true);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/tiles/v11.2/grayland/4/8/5.png'), false);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/tiles/v10.0/temp/5/15/10.png'), false);
    assert.equal(isAutoBasemapTile('https://tiles.windy.com/labels/v2.1/en/3/4/2.json'), false);
});

test('manual prefixes override auto detection', () => {
    const manual: RecolorRule = { ...outline, prefixes: ['https://example.test/map/'] };
    assert.equal(rulesForUrl('https://example.test/map/1.png', [manual]).length, 1);
    assert.equal(rulesForUrl('https://tiles.windy.com/tiles/v11.2/darkmap/1/0/0.png', [manual]).length, 0);
    assert.equal(rulesForUrl('https://tiles.windy.com/tiles/v10.0/temp/1/0/0.png', [outline]).length, 0);
});

test('one rule recolours the whole stroke and keeps its alpha', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 200]);
    recolorImageData(pixels, 3, 1, [outline]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [255, 0, 0, 40]);
    assert.deepEqual(Array.from(pixels.slice(8, 12)), [255, 0, 0, 200]);
});

test('two rules of equal thickness paint the border colour across the whole stroke', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 40, 0, 0, 0, 157]);
    recolorImageData(pixels, 2, 1, [outline, border]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 255, 40]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [0, 0, 255, 157]);
});

test('a thicker outline leaves a casing around the border', () => {
    const wideOutline: RecolorRule = { ...outline, thickness: 3 };
    const pixels = new Uint8ClampedArray(5 * 4);
    pixels[2 * 4 + 3] = 200;
    recolorImageData(pixels, 5, 1, [wideOutline, border]);
    const rim = Math.round(255 * 0.65);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 0, 0, rim]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [255, 0, 0, 255]);
    assert.deepEqual(Array.from(pixels.slice(8, 12)), [0, 0, 255, 200]);
    assert.deepEqual(Array.from(pixels.slice(12, 16)), [255, 0, 0, 255]);
    assert.deepEqual(Array.from(pixels.slice(16, 20)), [255, 0, 0, rim]);
});

test('ink filter leaves the other pixels alone', () => {
    const darkOnly: RecolorRule = { ...outline, ink: 'dark' };
    const pixels = new Uint8ClampedArray([0, 0, 0, 180, 250, 250, 250, 180, 0, 0, 0, 0]);
    recolorImageData(pixels, 3, 1, [darkOnly]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 0, 0, 180]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [250, 250, 250, 180]);
    assert.deepEqual(Array.from(pixels.slice(8, 12)), [0, 0, 0, 0]);
});

test('thickness grows the stroke into a solid line', () => {
    const thick: RecolorRule = { ...outline, thickness: 2 };
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 200]);
    recolorImageData(pixels, 2, 1, [thick]);
    assert.equal(pixels[3] > 0, true);
    assert.deepEqual(Array.from(pixels.slice(0, 3)), [255, 0, 0]);
    assert.deepEqual(Array.from(pixels.slice(4, 7)), [255, 0, 0]);
    assert.equal(pixels[7], 255);
});

test('thickness 1 does not widen the stroke', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 200]);
    recolorImageData(pixels, 2, 1, [outline]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [255, 0, 0, 200]);
});

test('background shader uses the chosen colour and can be restored', () => {
    const next = fragmentForBackground(SHADER, '#336699');
    assert.match(next, /vec3 sea=vec3\(0\.20000,0\.40000,0\.60000\)/);
    assert.match(next, /vec3 land=vec3\(0\.20000,0\.40000,0\.60000\)/);
    assert.equal(fragmentForBackground(SHADER, null), SHADER);
    assert.equal(fragmentForBackground('no sea here', '#ffffff'), 'no sea here');
});

test('label css sets colour and can hide the layer', () => {
    assert.match(labelCss(true, '#abcdef'), /color:#abcdef !important/);
    assert.match(labelCss(false, null), /display:none/);
    assert.equal(labelCss(true, 'red'), '');
});
