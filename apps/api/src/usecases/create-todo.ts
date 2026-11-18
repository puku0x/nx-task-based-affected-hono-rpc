import { insertTodo, type Todo } from '../todos/todo';

export function createTodo(title: string): Todo {
  return insertTodo(title.trim());
}
