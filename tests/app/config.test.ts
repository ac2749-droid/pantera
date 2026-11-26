import assert from 'node:assert/strict';
import test from 'node:test';

import { indexConfig } from '../../src/foodIndex/config';

test('the index is used only when both an address and a key are set', () => {
  assert.equal(indexConfig(undefined, 'k'), null);
  assert.equal(indexConfig('http://x', '  '), null);
  assert.deepEqual(indexConfig(' http://127.0.0.1:7700 ', ' k '), { url: 'http://127.0.0.1:7700', key: 'k', timeoutMs: 2500 });
});
