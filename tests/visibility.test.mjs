import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteVisible } from '../app/js/visibility.js';

test('offscreen sprites are culled, including all four edges', () => {
  for (const [x, y] of [[-11, 50], [111, 50], [50, -11], [50, 111]]) {
    assert.equal(spriteVisible(x, y, 10, 100, 100), false);
  }
  for (const [x, y] of [[-10, 50], [110, 50], [50, -10], [50, 110]]) {
    assert.equal(spriteVisible(x, y, 10, 100, 100), true);
  }
});

test('rounded holes only cull fully contained sprites, preserving corners and overlap', () => {
  const holes = [{ l: 10, t: 10, r: 90, b: 90, rad: 15 }];
  assert.equal(spriteVisible(50, 50, 10, 100, 100, holes), false);
  assert.equal(spriteVisible(20, 20, 10, 100, 100, holes), true);
  assert.equal(spriteVisible(30, 50, 10, 100, 100, holes), true);
  assert.equal(spriteVisible(50, 50, 45, 100, 100, holes), true);
  assert.equal(spriteVisible(50, 50, 10, 100, 100), true);
});
