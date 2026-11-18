import { Hono } from 'hono';
import { validator } from 'hono/validator';

import { createTodo } from './usecases/create-todo';
import { listTodos } from './usecases/list-todos';

// ルートをメソッドチェーンでつなぐと、Hono が全ルートの型を app の型に積み上げる
export const app = new Hono()
  .get('/todos', (c) => c.json({ todos: listTodos() }))
  .post(
    '/todos',
    validator('json', (value, c) => {
      const title = (value as { title?: unknown }).title;
      if (typeof title !== 'string' || title.trim() === '') {
        return c.json({ message: 'title is required' }, 400);
      }
      return { title };
    }),
    (c) => c.json({ todo: createTodo(c.req.valid('json').title) }, 201),
  );

export type AppType = typeof app;
