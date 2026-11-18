import { expect, test } from 'vitest';

import { normalizeTitle } from './create-todo';

test('normalizeTitle should trim and collapse whitespace', () => {
  expect(normalizeTitle('  buy   milk ')).toBe('buy milk');
});
