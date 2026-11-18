import { createApiClient } from '@sample/api-rpc';
import {
  fetchTodos,
  summarizeTodos,
  type Todo,
} from '@sample/web-a-feature-todos';
import { Heading, truncate } from '@sample/ui';
import { useEffect, useState } from 'react';

const client = createApiClient('/api');

export function App() {
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    fetchTodos(client).then(setTodos);
  }, []);

  return (
    <main>
      <Heading>Todos</Heading>
      <p>{summarizeTodos(todos)}</p>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            {todo.done ? '[x]' : '[ ]'} {truncate(todo.title, 30)}
          </li>
        ))}
      </ul>
    </main>
  );
}
