import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TAB_ORDER, normalizeTabOrder, moveTab } from '../src/tabOrder.js';

test('existing settings keep the current order and newly introduced tabs are retained', () => {
  assert.deepEqual(normalizeTabOrder(null), DEFAULT_TAB_ORDER);
  const order = normalizeTabOrder(['posts', 'home', 'posts', 'unknown']);
  assert.deepEqual(order.slice(0, 2), ['posts', 'home']);
  assert.equal(order.length, DEFAULT_TAB_ORDER.length);
  assert.equal(new Set(order).size, order.length);
});
test('tabs move without mutating the saved order, including private and settings tabs', () => {
  const original = normalizeTabOrder();
  const moved = moveTab(original, 'dm', -1);
  assert.equal(moved.indexOf('dm'), original.indexOf('dm') - 1);
  assert.deepEqual(original, DEFAULT_TAB_ORDER);
  assert.equal(moveTab(original, 'settings', -1).at(-2), 'settings');
  assert.deepEqual(moveTab(original, 'home', -1), original);
  assert.deepEqual(moveTab(original, 'settings', 1), original);
  assert.deepEqual(moveTab(original, 'unknown', 1), original);
});
