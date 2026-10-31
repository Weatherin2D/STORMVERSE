import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    colorizePixels,
    decodePixel,
    encodingMax,
    formatRiskValue,
    hailFromMillimetres,
    parseScale,
    riskTileUrl,
    sampleScale,
} from '../src/risk.ts';
import type { ColorStop } from '../src/risk.ts';

const percentStops: ColorStop[] = [
    { value: 0, color: '#ffffff' },
    { value: 100, color: '#ff0000' },
];

test('a clear pixel is empty and an opaque pixel is a fraction of the maximum', () => {
    assert.equal(decodePixel(0, 0, 0, 100), null);
    assert.equal(decodePixel(0, 0, 255, 100), 0);
    assert.equal(decodePixel(255, 255, 255, 100), 100);
    const raw = Math.round(0.124 * 65535);
    const value = decodePixel(Math.floor(raw / 256), raw % 256, 255, 100);
    assert.ok(value !== null && Math.abs(value - 12.4) < 0.02);
});

test('percent tiles stay on a 0 to 100 range and hail uses the top stop', () => {
    assert.equal(encodingMax('convective', percentStops), 100);
    assert.equal(encodingMax('hailSize', [{ value: 0, color: '#fff' }, { value: 80, color: '#000' }]), 80);
    assert.equal(encodingMax('hailSize', []), 150);
});

test('colours blend between stops and hold at the ends', () => {
    const low = sampleScale(percentStops, -5);
    const mid = sampleScale(percentStops, 50);
    const high = sampleScale(percentStops, 140);
    assert.deepEqual(low, { r: 255, g: 255, b: 255, a: 255 });
    assert.deepEqual(mid, { r: 255, g: 128, b: 128, a: 255 });
    assert.deepEqual(high, { r: 255, g: 0, b: 0, a: 255 });
});

test('colouring a tile keeps the number and hides empty pixels', () => {
    const raw = Math.round(0.5 * 65535);
    const rgba = [Math.floor(raw / 256), raw % 256, 0, 255, 0, 0, 0, 0];
    const painted = colorizePixels(rgba, 100, percentStops, 0.5);
    assert.ok(Math.abs(painted.values[0] - 50) < 0.02);
    assert.equal(Number.isNaN(painted.values[1]), true);
    assert.equal(painted.pixels[0], 255);
    assert.equal(painted.pixels[3], 128);
    assert.equal(painted.pixels[7], 0);
});

test('a colour scale file replaces the stops, and a bad file explains why', () => {
    const parsed = parseScale('{"stops":[{"value":12.4,"color":"#f9a825"},{"value":0,"color":"#fff"}]}');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
        assert.equal(parsed.stops[0].value, 0);
        assert.equal(parsed.stops[1].value, 12.4);
        assert.equal(parsed.stops[1].color, '#f9a825');
    }
    assert.equal(parseScale('nope').ok, false);
    assert.equal(parseScale('{"stops":[]}').ok, false);
    const rejected = parseScale('{"stops":[{"value":1,"color":"red"}]}');
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.match(rejected.error, /hex/);
});

test('hail size stays in millimetres until it is shown', () => {
    assert.equal(hailFromMillimetres(25.4, 'mm'), 25.4);
    assert.equal(hailFromMillimetres(25.4, 'cm'), 2.54);
    assert.equal(hailFromMillimetres(25.4, 'in'), 1);
    assert.equal(formatRiskValue('tornado', 12.36, 'mm'), '12.4%');
    assert.equal(formatRiskValue('hailSize', 25.4, 'cm'), '2.5 cm');
    assert.equal(formatRiskValue('hailSize', 25.4, 'in'), '1.0 in');
});

test('a tile address fills the zoom and wraps the x column', () => {
    assert.equal(riskTileUrl('https://tiles.example/{product}/{z}/{x}/{y}.png', 'tornado', 2, -1, 3), 'https://tiles.example/tornado/2/3/3.png');
    assert.equal(riskTileUrl('https://tiles.example/{z}/{x}.png', 'tornado', 2, 1, 1), null);
});
