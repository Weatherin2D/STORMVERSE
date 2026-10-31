import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    fragmentForBackground,
    isAutoBasemapTile,
    isLineArtTile,
    labelCss,
    recolorImageData,
    rulesForUrl,
} from '../src/recolor.ts';
import type { RecolorRule } from '../src/recolor.ts';

const major: RecolorRule = {
    kind: 'major',
    prefixes: [],
    color: [255, 0, 0],
    ink: 'all',
    thickness: 1,
};
const regional: RecolorRule = {
    kind: 'regional',
    prefixes: [],
    color: [0, 0, 255],
    ink: 'all',
    thickness: 1,
};
const streams: RecolorRule = {
    kind: 'streams',
    prefixes: [],
    color: [0, 180, 0],
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
    const manual: RecolorRule = { ...major, prefixes: ['https://example.test/map/'] };
    assert.equal(rulesForUrl('https://example.test/map/1.png', [manual]).length, 1);
    assert.equal(rulesForUrl('https://tiles.windy.com/tiles/v11.2/darkmap/1/0/0.png', [manual]).length, 0);
    assert.equal(rulesForUrl('https://tiles.windy.com/tiles/v10.0/temp/1/0/0.png', [major]).length, 0);
    assert.equal(isLineArtTile('https://tiles.windy.com/tiles/v11.2/darkmap/4/8/5.png'), true);
    assert.equal(rulesForUrl('https://tiles.windy.com/v1/maptiles/outdoor/256/4/8/5/', [major]).length, 0);
});

test('one rule recolours its own line and keeps the alpha', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 200]);
    recolorImageData(pixels, 3, 1, [major]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [255, 0, 0, 40]);
    assert.deepEqual(Array.from(pixels.slice(8, 12)), [255, 0, 0, 200]);
});

test('separate line strengths take separate colours', () => {
    const pixels = new Uint8ClampedArray(13 * 4);
    pixels[0 * 4 + 3] = 200;
    pixels[6 * 4 + 3] = 100;
    pixels[12 * 4 + 3] = 30;
    recolorImageData(pixels, 13, 1, [major, regional, streams]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 0, 0, 200]);
    assert.deepEqual(Array.from(pixels.slice(6 * 4, 6 * 4 + 4)), [0, 0, 255, 100]);
    assert.deepEqual(Array.from(pixels.slice(12 * 4, 12 * 4 + 4)), [0, 180, 0, 30]);
});

test('a stream colour does not paint the coastline', () => {
    const pixels = new Uint8ClampedArray(8 * 4);
    pixels[0 * 4 + 3] = 200;
    pixels[7 * 4 + 3] = 30;
    recolorImageData(pixels, 8, 1, [streams]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 0, 200]);
    assert.deepEqual(Array.from(pixels.slice(7 * 4, 7 * 4 + 4)), [0, 180, 0, 30]);
});

test('hiding streams clears only that line', () => {
    const pixels = new Uint8ClampedArray(13 * 4);
    pixels[0 * 4 + 3] = 200;
    pixels[12 * 4 + 3] = 30;
    recolorImageData(pixels, 13, 1, [{ ...streams, hidden: true }, major]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 0, 0, 200]);
    assert.deepEqual(Array.from(pixels.slice(12 * 4, 12 * 4 + 4)), [0, 0, 0, 0]);
});

test('ink filter leaves the other pixels alone', () => {
    const darkOnly: RecolorRule = { ...major, ink: 'dark' };
    const pixels = new Uint8ClampedArray([0, 0, 0, 180, 250, 250, 250, 180, 0, 0, 0, 0]);
    recolorImageData(pixels, 3, 1, [darkOnly]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 0, 0, 180]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [250, 250, 250, 180]);
    assert.deepEqual(Array.from(pixels.slice(8, 12)), [0, 0, 0, 0]);
});

test('thickness grows the stroke into a solid line', () => {
    const thick: RecolorRule = { ...major, thickness: 2 };
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 200]);
    recolorImageData(pixels, 2, 1, [thick]);
    assert.equal(pixels[3] > 0, true);
    assert.deepEqual(Array.from(pixels.slice(0, 3)), [255, 0, 0]);
    assert.deepEqual(Array.from(pixels.slice(4, 7)), [255, 0, 0]);
    assert.equal(pixels[7], 255);
});

test('tenths of thickness change the stroke before a full pixel', () => {
    const faint = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 40]);
    recolorImageData(faint, 2, 1, [{ ...major, thickness: 1.2 }]);
    assert.equal(faint[3], 0);
    assert.deepEqual(Array.from(faint.slice(4, 7)), [255, 0, 0]);
    assert.equal(faint[7] > 40, true);
    assert.equal(faint[7] < 255, true);

    const wider = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 40]);
    recolorImageData(wider, 2, 1, [{ ...major, thickness: 1.5 }]);
    assert.deepEqual(Array.from(wider.slice(0, 3)), [255, 0, 0]);
    assert.equal(wider[3] > 0, true);
    assert.equal(wider[3] < 120, true);
    assert.equal(wider[7], 255);
});

test('thickness 1 does not widen the stroke', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 200]);
    recolorImageData(pixels, 2, 1, [major]);
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(pixels.slice(4, 8)), [255, 0, 0, 200]);
});

test('colour photos are left alone', () => {
    const pixels = new Uint8ClampedArray([20, 80, 200, 255, 200, 30, 40, 255]);
    const copy = new Uint8ClampedArray(pixels);
    recolorImageData(pixels, 2, 1, [major]);
    assert.deepEqual(Array.from(pixels), Array.from(copy));
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
