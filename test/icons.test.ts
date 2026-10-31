import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    applyRadarPattern,
    buildIconSheet,
    buildLightningAtlas,
    maskFromPixels,
    paintMask,
} from '../src/icons.ts';
import type { IconMask } from '../src/icons.ts';

const solid = (width: number, height: number, value: number): IconMask => ({
    width,
    height,
    values: new Uint8Array(width * height).fill(value),
});

test('a transparent picture uses its alpha as the shape', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]);
    const mask = maskFromPixels(rgba, 2, 1);
    assert.deepEqual([...mask.values], [255, 0]);
});

test('an opaque picture uses brightness as the shape', () => {
    const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]);
    const mask = maskFromPixels(rgba, 2, 1);
    assert.equal(mask.values[0], 255);
    assert.equal(mask.values[1], 0);
});

test('a mask tiles into one channel of each cell', () => {
    const target = new Uint8Array(8 * 8 * 4);
    paintMask(target, 8, 8, solid(4, 4, 255), 4, [0]);
    for (let i = 0; i < target.length; i += 4) {
        assert.equal(target[i], 255);
        assert.equal(target[i + 1], 0);
        assert.equal(target[i + 2], 0);
        assert.equal(target[i + 3], 0);
    }
});

test('a mask keeps its shape when a cell is wider than it is', () => {
    const mask: IconMask = {
        width: 2,
        height: 4,
        values: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    };
    const target = new Uint8Array(4 * 4 * 4).fill(9);
    paintMask(target, 4, 4, mask, 4, [0]);
    const red = (x: number, y: number) => target[(y * 4 + x) * 4];
    assert.equal(red(0, 0), 0);
    assert.equal(red(1, 0), 1);
    assert.equal(red(2, 0), 2);
    assert.equal(red(3, 0), 0);
    assert.equal(red(1, 3), 7);
    assert.equal(target[1], 9);
});

test('snow and hail replace only their radar pattern channels', () => {
    const original = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < original.length; i += 4) {
        original[i] = 1;
        original[i + 1] = 2;
        original[i + 2] = 3;
        original[i + 3] = 4;
    }
    const snowOnly = applyRadarPattern(original, 16, 16, solid(16, 16, 9), null);
    assert.equal(snowOnly[0], 9);
    assert.equal(snowOnly[1], 2);
    assert.equal(snowOnly[2], 3);
    assert.equal(snowOnly[3], 4);

    const both = applyRadarPattern(original, 16, 16, solid(16, 16, 9), solid(16, 16, 8));
    assert.equal(both[0], 9);
    assert.equal(both[1], 2);
    assert.equal(both[2], 8);
    assert.equal(both[3], 4);
});

test('a rain or thunder sheet copies the shape into every channel', () => {
    const sheet = buildIconSheet(solid(32, 32, 128));
    assert.equal(sheet.length, 32 * 32 * 4);
    assert.deepEqual([sheet[0], sheet[1], sheet[2], sheet[3]], [128, 128, 128, 128]);
});

test('the lightning atlas repeats the shape in the four bolt windows', () => {
    const atlas = buildLightningAtlas(solid(10, 10, 255));
    assert.equal(atlas.length, 256 * 64 * 4);
    const pixel = (x: number, y: number) => {
        const index = (y * 256 + x) * 4;
        return [atlas[index], atlas[index + 1], atlas[index + 2], atlas[index + 3]];
    };
    assert.deepEqual(pixel(0, 0), [0, 0, 0, 255]);
    for (const x of [25, 75, 125, 175]) assert.deepEqual(pixel(x, 32), [255, 255, 255, 255]);
    assert.deepEqual(pixel(220, 32), [0, 0, 0, 255]);
});
