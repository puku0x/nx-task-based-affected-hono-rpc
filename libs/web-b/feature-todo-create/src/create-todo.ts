import type { ApiClient } from '@sample/api-rpc';
import type { InferResponseType } from 'hono/client';

// 201 のレスポンスの型を api のルート定義から導出する
export type CreatedTodo = InferResponseType<
  ApiClient['todos']['$post'],
  201
>['todo'];

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

export async function createTodo(
  client: ApiClient,
  title: string,
): Promise<CreatedTodo> {
  const response = await client.todos.$post({
    json: { title: normalizeTitle(title) },
  });
  if (response.status !== 201) {
    const { message } = await response.json();
    throw new Error(message);
  }
  const { todo } = await response.json();
  return todo;
}
