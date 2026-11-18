import { expect, test } from 'vitest';

import { summarizeTodos } from './todos';

test('summarizeTodos should count finished todos', () => {
  const summary = summarizeTodos([
    { id: 1, title: 'a', done: true },
    { id: 2, title: 'b', done: false },
  ]);

  expect(summary).toBe('1 / 2 件が完了');
});
