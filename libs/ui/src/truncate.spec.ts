import { expect, test } from 'vitest';

import { truncate } from './truncate';

test('truncate should cut text longer than the limit', () => {
  expect(truncate('abcdef', 3)).toBe('abc…');
});

test('truncate should keep text within the limit', () => {
  expect(truncate('abc', 3)).toBe('abc');
});
