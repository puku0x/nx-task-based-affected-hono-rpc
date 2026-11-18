import type { ApiClient } from '@sample/api-rpc';
import type { InferResponseType } from 'hono/client';

// レスポンスの型は api のルート定義から導出され、手書きの型定義を持たない
export type Todo = InferResponseType<
  ApiClient['todos']['$get']
>['todos'][number];

export async function fetchTodos(client: ApiClient): Promise<Todo[]> {
  const response = await client.todos.$get();
  const { todos } = await response.json();
  return todos;
}

export function summarizeTodos(todos: Todo[]): string {
  const done = todos.filter((todo) => todo.done).length;
  return `${done} / ${todos.length} 件が完了`;
}
