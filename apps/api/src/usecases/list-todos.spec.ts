import { expect, test } from 'vitest';

import { listTodos } from './list-todos';

test('listTodos should return todos ordered by id', () => {
  const ids = listTodos().map((todo) => todo.id);

  expect(ids).toEqual(ids.toSorted((a, b) => a - b));
});
