import { createApiClient } from '@sample/api-rpc';
import { Heading } from '@sample/ui';
import { createTodo } from '@sample/web-b-feature-todo-create';
import { type FormEvent, useState } from 'react';

const client = createApiClient('/api');

export function App() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const todo = await createTodo(client, title);
      setMessage(`「${todo.title}」を追加しました`);
      setTitle('');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '追加できませんでした',
      );
    }
  }

  return (
    <main>
      <Heading>Todos Admin</Heading>
      <form onSubmit={handleSubmit}>
        <input
          aria-label="タイトル"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit">追加</button>
      </form>
      <p>{message}</p>
    </main>
  );
}
