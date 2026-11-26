import assert from 'node:assert/strict';
import test from 'node:test';

const Module = require('module');
// theme.ts only needs the colour scheme from React Native
const load = Module._load;
Module._load = function (name: string, ...rest: unknown[]) {
  return name === 'react-native' ? { useColorScheme: () => 'dark' } : load.call(this, name, ...rest);
};
const { darkTheme, lightTheme } = require('../../src/theme');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [name, t] of [['dark', darkTheme], ['light', lightTheme]] as const) {
  test(`${name}: text stays readable`, () => {
    for (const bg of [t.bg, t.surface]) {
      assert.ok(contrast(t.ink, bg) >= 7, `ink on ${bg}`);
      for (const key of ['muted', 'accent', 'protein', 'carbs', 'fat', 'warn'] as const) {
        assert.ok(contrast(t[key], bg) >= 4, `${key} on ${bg}: ${contrast(t[key], bg).toFixed(2)}`);
      }
      assert.ok(contrast(t.faint, bg) >= 3, `faint on ${bg}: ${contrast(t.faint, bg).toFixed(2)}`);
    }
  });
  test(`${name}: button labels stay readable`, () => {
    assert.ok(contrast(t.accentInk, t.accent) >= 4.5);
    for (const stop of [t.grad1, t.grad2]) assert.ok(contrast(t.onGrad, stop) >= 4, `${stop}: ${contrast(t.onGrad, stop).toFixed(2)}`);
    assert.ok(contrast(t.warn, t.warnSoft) >= 4, `warn on warnSoft: ${contrast(t.warn, t.warnSoft).toFixed(2)}`);
  });
}
