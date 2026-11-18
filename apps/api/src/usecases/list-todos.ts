import { findAllTodos, type Todo } from '../todos/todo';

export function listTodos(): Todo[] {
  return findAllTodos().toSorted((a, b) => a.id - b.id);
}
