export type Todo = {
  id: number;
  title: string;
  done: boolean;
};

const todos: Todo[] = [
  { id: 1, title: 'Nx の affected を試す', done: true },
  { id: 2, title: 'Hono RPC の型を事前に生成する', done: false },
];

export function findAllTodos(): Todo[] {
  return todos;
}

export function insertTodo(title: string): Todo {
  const todo: Todo = { id: todos.length + 1, title, done: false };
  todos.push(todo);
  return todo;
}
