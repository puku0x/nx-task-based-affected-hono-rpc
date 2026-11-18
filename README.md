# nx-task-based-affected-hono-rpc

Nx 24 の Task-based affected と、Hono RPC の型の事前コンパイルを組み合わせた最小構成のサンプルです。

次の 2 つを、手元で動かして確かめられます。

- API の型を事前に `.d.ts` へコンパイルし、フロントエンドの型チェック（TypeScript 7）のメモリ使用量を抑える
- API の内部実装だけを変えたときに、フロントエンドのテストやビルドを走らせない

仕組みの解説は [docs/task-based-affected-with-hono-rpc.md](./docs/task-based-affected-with-hono-rpc.md) にあります。

## 構成

| プロジェクト                     | 種類                   | 内容                                                            |
| -------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `apps/api`                       | アプリ                 | Hono の API。`typegen` で型定義（`.d.ts`）を出力する            |
| `apps/web-a`                     | アプリ                 | Vite + React。Todo の一覧を表示する                             |
| `apps/web-b`                     | アプリ                 | Vite + React。Todo を追加する                                   |
| `libs/api-rpc`                   | 共通のライブラリ       | 出力された型定義だけを読み、型付きの API クライアントを公開する |
| `libs/ui`                        | 共通のライブラリ       | `api-rpc` を使わない                                            |
| `libs/web-a/feature-todos`       | `web-a` 用のライブラリ | `api-rpc` を使う。プロジェクト名は `web-a-feature-todos`        |
| `libs/web-b/feature-todo-create` | `web-b` 用のライブラリ | `api-rpc` を使う。プロジェクト名は `web-b-feature-todo-create`  |

```
web-a ──> web-a-feature-todos ───────┐
  └─────> ui                         ├──> api-rpc ··(typegen の出力)··> api
web-b ──> web-b-feature-todo-create ─┘
  └─────> ui
```

アプリごとのライブラリは `libs/<アプリ名>/` に置き、どのアプリからも使うライブラリは `libs/` の直下に置いています。

フロントエンドのアプリを 2 つ置いたのは、アプリが複数あっても `api:typegen` が 1 回しか実行されないことを確かめられるようにするためです。

`api-rpc` と `api` の間に、プロジェクト間の依存はありません。`api-rpc` が読むのは、`api:typegen` が `libs/api-rpc/src/__generated__` に出力した型定義だけです。

## 必要なもの

- Node.js 24 以上
- npm 11 以上

## セットアップ

```sh
npm install
npx nx run-many -t typecheck test build
```

`typecheck` は `api:typegen` に依存しているので、型定義は `typecheck` の前に自動で生成されます。

## 試し方

`--files` に変更したファイルを指定して `--explain` を付けると、選ばれるタスクとその理由が表示されます。タスクそのものは実行されません。

```sh
# API の内部実装を変えた場合
npx nx affected -t typecheck test build --files=apps/api/src/usecases/list-todos.ts --explain

# API のテストだけを変えた場合
npx nx affected -t typecheck test build --files=apps/api/src/usecases/list-todos.spec.ts --explain

# api-rpc を使わないライブラリを変えた場合
npx nx affected -t typecheck test build --files=libs/ui/src/truncate.ts --explain

# web-a 用のライブラリを変えた場合
npx nx affected -t typecheck test build --files=libs/web-a/feature-todos/src/todos.ts --explain
```

このサンプルで選ばれるタスクは次のとおりです。

| 変更したファイル                                    | 選ばれるタスク                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/usecases/list-todos.ts`               | `api:typecheck` `api:test` `api-rpc:typecheck` `web-a-feature-todos:typecheck` `web-b-feature-todo-create:typecheck` `web-a:typecheck` `web-b:typecheck` |
| `apps/api/src/usecases/list-todos.spec.ts`          | `api:typecheck` `api:test`                                                                                                                               |
| `libs/ui/src/truncate.ts`                           | `ui:typecheck` `ui:test` `web-a:typecheck` `web-a:build` `web-b:typecheck` `web-b:build`                                                                 |
| `libs/web-a/feature-todos/src/todos.ts`             | `web-a-feature-todos:typecheck` `web-a-feature-todos:test` `web-a:typecheck` `web-a:build`                                                               |
| `libs/web-b/feature-todo-create/src/create-todo.ts` | `web-b-feature-todo-create:typecheck` `web-b-feature-todo-create:test` `web-b:typecheck` `web-b:build`                                                   |

- API を変えても、フロントエンドの `test` と `build`、`ui:typecheck` は選ばれません
- `web-a` 用のライブラリを変えても、`web-b` のタスクは選ばれません。逆も同じです

## 型チェックのコストを計測する

ルート数の多い Hono アプリを `tmp-bench/` に生成し、クライアント側の型チェックを「API のソースを import する場合」と「`.d.ts` を import する場合」で比べます。

```sh
# ルートファイル 80 個、1 ファイルあたり GET と POST を 5 組（エンドポイント 800 個）
node tools/bench.mjs 80 5

# クライアントを使うファイルを 3 個足して、合計 4 個にする（アプリがライブラリをいくつも取り込む場合を想定）
node tools/bench.mjs 80 5 3
```

`tsc` は TypeScript 7、`tsc6` は TypeScript 6 です。TypeScript 6 の API を使うツールと共存させるため、`package.json` で両方を入れています。

## 開発サーバー

```sh
# API と 2 つのアプリをまとめて起動する
npx nx run-many -t serve

# 個別に起動する
npx nx serve api     # http://localhost:3000
npx nx serve web-a   # http://localhost:5173 （/api を api へ中継する）
npx nx serve web-b   # http://localhost:5174 （/api を api へ中継する）
```

- `web-a` と `web-b` の `serve` は、起動前に `api:typegen` を 1 回実行します。まとめて起動しても、`api:typegen` の実行は 1 回です
- `api` の `serve` は `api:typegen-watch`（`tsc --watch`）も起動します。API を編集すると、型定義が再生成されます
- `typegen-watch` を起動するのは `api` の `serve` だけなので、アプリの数が増えても watch は 1 本です

## 主な設定ファイル

- [`nx.json`](./nx.json): `typecheck` の `inputs` と `dependsOn`、`@nx/vitest` プラグインの登録
- [`apps/api/project.json`](./apps/api/project.json): `typegen` の `outputs`、`typegen-watch`
- [`libs/api-rpc/project.json`](./libs/api-rpc/project.json): 中継用の `typegen`
- [`apps/api/tsconfig.typegen.json`](./apps/api/tsconfig.typegen.json): 型定義の出力先
