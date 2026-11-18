# Task-based affected と Hono RPC の型の事前コンパイル

Hono RPC を使うモノレポ向けの構成例です。型チェックのメモリ使用量を抑えながら、API を変更したときに CI で実行するタスクを必要なものだけに絞ります。

1.2 節を除き、数値はこのリポジトリで実測しました。計測環境は Nx 24.0.4、TypeScript 7.0.2（`tsc`）、TypeScript 6.0.2（`tsc6`）、Hono 4.13、Apple M1 Max（10 コア）です。

## 1. 背景

この構成に至った経緯は次のとおりです。

1. TypeScript 6 のころは、フロントエンドの各プロジェクトの型チェックが CI で問題なく通っていた
2. 型チェックを TypeScript 7（ネイティブ版の `tsc`）に切り替えると、メモリ使用量が増えて CI のマシンのメモリに収まらなくなった
3. 原因は Hono RPC の型にあった。フロントエンドの各プロジェクトが `typeof app` を取り込んでいたため、API 全体のルートの型をプロジェクトごとに計算し直していた
4. API の型を事前にコンパイルして `.d.ts` に出力し、フロントエンドはその `.d.ts` だけを読むようにした
5. Nx の設定で、型の生成を 1 回だけ実行してキャッシュし、API を変更したときは生成された型を読むタスクだけが選ばれるようにした

4 が 2 章の「型の事前コンパイル」、5 が 3 章の「Task-based affected と `dependentTasksOutputFiles`」にあたります。

### 1.1 なぜメモリが増えるか

Hono RPC のクライアントの型は、ルート定義をメソッドチェーンでつないだ `app` の型から導出されます。ルートが増えるほど `typeof app` は大きくなり、`tsc` は `hc<AppType>()` を使うコードを型チェックするたびに、この大きな型を展開します。

TypeScript 7 は、複数のチェッカーで型チェックを並列に実行します（既定は 4 つ）。チェッカー同士は型を共有しません。そのため、同じ `typeof app` を使うファイルが別々のチェッカーに割り当てられると、チェッカーの数だけ同じ型を計算することになります。

`tools/bench.mjs` で、クライアントを使うファイルを 1 個ずつ増やしながら計測しました。エンドポイントは 800 個で、API のソースを import する構成です。

| クライアントを使うファイル | TypeScript 6      | TypeScript 7        | TypeScript 7（`--singleThreaded`） |
| -------------------------- | ----------------- | ------------------- | ---------------------------------- |
| 1 個                       | 479,020（553 MB） | 1,110,805（517 MB） | 484,475（289 MB）                  |
| 2 個                       | 479,274（557 MB） | 1,500,432（710 MB） | 484,729（289 MB）                  |
| 3 個                       | 479,527（561 MB） | 1,890,060（903 MB） | 484,982（290 MB）                  |
| 4 個                       | 479,773（565 MB） | 1,937,899（971 MB） | 485,228（290 MB）                  |
| 5 個                       | 479,824（566 MB） | 1,937,950（971 MB） | 485,279（290 MB）                  |
| 6 個                       | 480,079（569 MB） | 1,938,205（971 MB） | 485,534（290 MB）                  |
| 7 個                       | 480,325（575 MB） | 1,938,460（972 MB） | 485,780（291 MB）                  |
| 8 個                       | 480,571（577 MB） | 1,938,715（972 MB） | 486,026（291 MB）                  |

各セルの値は型の数で、かっこ内がメモリ使用量です。

TypeScript 6 と `--singleThreaded` の値は、ファイルを増やしてもほとんど変わりません。TypeScript 7 の並列実行では違いました。ファイルが 3 個になるまで、1 個増えるごとに型が約 39 万個、メモリ使用量が約 190 MB 増えています。4 個から先は増えません。4 個の時点で、型の数は TypeScript 6 の 4.0 倍、メモリ使用量は 1.7 倍です。

ファイルが 1 個だけなら、TypeScript 7 のメモリ使用量は TypeScript 6 より少なく済みます。2 個以上になると TypeScript 6 を上回ります。4 個で増えなくなるのは、4 つのチェッカーすべてが `typeof app` を計算し終えているからです。

ファイルを 8 個にしたまま `--checkers` でチェッカーの数を変えると、型の数とメモリ使用量はチェッカーの数に比例しました。指定しない場合の値は `--checkers 4` と一致します。

| チェッカーの数 | 型の数    | メモリ使用量 |
| -------------- | --------- | ------------ |
| 指定なし       | 1,938,715 | 972 MB       |
| `--checkers 2` | 970,273   | 518 MB       |
| `--checkers 4` | 1,938,715 | 972 MB       |
| `--checkers 8` | 3,875,799 | 1,880 MB     |

実際のアプリは、クライアントを使うライブラリをいくつも取り込むため、4 個以上の結果に近くなります。1.2 節の実プロジェクトでも、型の数は 4.0 倍、メモリ使用量は 2.1 倍でした。

モノレポでは、Nx がフロントエンドの複数のプロジェクトの型チェックを並列に実行します。1 プロセスあたりの増加分が、同時に動くプロセスの数だけ積み重なります。

### 1.2 実プロジェクトでの数値

この構成のもとになった実プロジェクトで計測した値を示します。実プロジェクトには Hono の API が 1 つあり、その型を読むフロントエンドのプロジェクト（アプリとライブラリ）が約 90 個あります。型チェックには TypeScript 7 を使い、CI のランナーは 4 vCPU、メモリ 16 GB です。

CI ではメモリ使用量を計測していません。CI で確認できたのは、ジョブが成功したか失敗したかだけです。

| CI で確認できたこと                      | 事前コンパイルの前                               | 事前コンパイルの後 |
| ---------------------------------------- | ------------------------------------------------ | ------------------ |
| 型チェックとリントのジョブ（4 本を並列） | `tsc` が異常終了し、ジョブが失敗する場合があった | 完走する           |

メモリ使用量と時間は、ローカル環境（10 コア、メモリ 64 GB）で計測しました。事前コンパイルを入れる直前と直後のコミットを比べています。CI のランナーで測った値ではありません。

| ローカル環境で計測した値                                       | 事前コンパイルの前 | 事前コンパイルの後 |
| -------------------------------------------------------------- | ------------------ | ------------------ |
| フロントエンドの型チェック 1 本のメモリ使用量                  | 4〜6 GB            | 0.1〜0.8 GB        |
| フロントエンドの型チェック 1 本の時間                          | 約 8 秒            | 0.1〜0.6 秒        |
| 全 100 プロジェクトの型チェックを 4 本並列で実行したときの合計 | 最大 16.7 GB       | 最大 7.1 GB        |
| 全 100 プロジェクトの型チェックを 4 本並列で実行したときの時間 | 368 秒             | 51 秒              |

4 本並列の合計は、`tsc` のプロセスが使ったメモリの合計を 1 秒おきに記録し、その最大値を取ったものです。計測は 2 回ずつ行い、事前コンパイルの前は 16.7 GB と 14.5 GB、後は 7.1 GB と 6.6 GB でした。

事前コンパイルの前は、`tsc` がエラーを出力しないまま非ゼロで終了し、CI のジョブは `The operation was canceled.` だけを残して失敗していました。失敗するかどうかは並列に動くタスクの組み合わせ次第で、再実行すると通る場合もありました。

事前コンパイルの後は、API 全体の型を計算するのが `typegen` の 1 プロセスだけになります。この `typegen` は約 10 秒かかり、メモリを 4.2 GB 使います（`--extendedDiagnostics` の値です。プロセスが使ったメモリの最大は 5.4〜5.7 GB でした）。計算のコストがなくなったわけではありません。約 90 回繰り返していた計算が、1 回で済むようになりました。

TypeScript 6 と 7 の違いも確かめました。事前コンパイルを入れる前のコミットで、一番重いアプリの型チェックを両方のバージョンで実行し、`--extendedDiagnostics` の値を比べています（2026 年 11 月に計測）。

|              | 型の数     | メモリ使用量 | 時間    |
| ------------ | ---------- | ------------ | ------- |
| TypeScript 6 | 2,681,497  | 2.42 GB      | 21.8 秒 |
| TypeScript 7 | 10,598,991 | 4.98 GB      | 8.7 秒  |

TypeScript 7 では、型の数が 4.0 倍、メモリ使用量が 2.1 倍になりました。1.1 節のベンチマークで、クライアントを使うファイルが 4 個以上のときと同じ傾向です。

## 2. 型の事前コンパイル

`api` に、型定義だけを出力する `typegen` タスクを追加します。

```jsonc
// apps/api/tsconfig.typegen.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "emitDeclarationOnly": true,
    "noEmit": false,
    "rootDir": "src",
    "outDir": "../../libs/api-rpc/src/__generated__",
  },
}
```

`api-rpc` は、出力された `.d.ts` だけを import します。

```ts
// libs/api-rpc/src/index.ts
import { hc } from 'hono/client';

import type { AppType } from './__generated__/app';

export type ApiClient = ReturnType<typeof hc<AppType>>;

export function createApiClient(baseUrl: string): ApiClient {
  return hc<AppType>(baseUrl);
}
```

フロントエンドの `tsc` が読むのは、推論済みの型が書かれた `.d.ts` です。API のソースから型を推論し直すことはありません。

### 2.1 効果

`node tools/bench.mjs <ルートファイル数> 5 3` で計測しました。クライアントを使うファイルは 4 個で、1.1 節で TypeScript 7 の型の数が増えなくなった個数に合わせています。

TypeScript 7 のメモリ使用量は次のとおりです。

| エンドポイント数 | API のソースを import | `.d.ts` を import |
| ---------------- | --------------------- | ----------------- |
| 200              | 328 MB                | 173 MB            |
| 400              | 529 MB                | 223 MB            |
| 800              | 971 MB                | 356 MB            |

TypeScript 7 が作る型の数は次のとおりです。

| エンドポイント数 | API のソースを import | `.d.ts` を import |
| ---------------- | --------------------- | ----------------- |
| 200              | 659,419               | 272,872           |
| 400              | 1,085,579             | 297,032           |
| 800              | 1,937,899             | 345,352           |

API のソースを import する構成では、メモリ使用量がエンドポイント数にほぼ比例して増えます。`.d.ts` を import する構成に変えると、800 エンドポイントの時点でメモリ使用量は 2.7 分の 1、型の数は 5.6 分の 1 になり、増え方もゆるやかです。

`.d.ts` を import する構成でも、4 つのチェッカーがそれぞれ `.d.ts` の型を読み込みます。そのため、クライアントを使うファイルが 1 個のとき（800 エンドポイントで 143 MB、86,593 個）と比べると、値は大きくなります。

### 2.2 生成物をコミットしない

出力先の `__generated__` は `.gitignore` に入れます。生成物をコミットすると、ソースと食い違っていないかをレビューのたびに確かめる必要が出てくるためです。

### 2.3 TypeScript 6 と 7 を両方入れる

このサンプルは、`typescript` に 6 系、`@typescript/native` に 7 系を指定して、両方を入れています。リンターなど、TypeScript 6 の API を使うツールを動かすためです。コマンドは `tsc` が 7 系、`tsc6` が 6 系です。

```jsonc
// package.json
"devDependencies": {
  "@typescript/native": "npm:typescript@7.0.2",
  "typescript": "npm:@typescript/typescript6@6.0.2"
}
```

## 3. Nx に実行順と変更の伝わり方を宣言する

型を事前にコンパイルする構成では、Nx に 2 つのことを伝える必要があります。1 つは「型チェックの前に型を生成する」という実行順です。もう 1 つは「API を変えたら、生成された型を読むタスクをやり直す」という変更の伝わり方です。どちらも Nx の設定で宣言します。

### 3.1 Task-based affected

Task-based affected は、Nx 24 で既定になった判定方式です。従来の方式とは次の点が違います。

|             | 従来（project-based）                                    | Task-based                                                               |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| 判定の単位  | プロジェクト                                             | タスク                                                                   |
| 選ぶ基準    | 変更されたプロジェクトと、依存するプロジェクトの全タスク | 変更ファイルを `inputs` に含むタスクと、選ばれたタスクの出力を読むタスク |
| `dependsOn` | 判定に関与しない                                         | 実行順を決めるだけで、変更を伝えない                                     |

Nx は、キャッシュのハッシュ計算に使う `inputs` と `outputs` の宣言を、affected の判定にもそのまま使います。そのため、宣言が実態と合っていることが前提です。

Nx 23 以前から `nx migrate` で更新したワークスペースでは、`nx.json` に `"affected": { "legacy": true }` が追加されています。この設定を削除すると Task-based に切り替わります。1 回の実行だけ切り替えたいときは、環境変数 `NX_LEGACY_AFFECTED` に `true` か `false` を指定してください。

### 3.2 生成された型への依存を宣言する

`api-rpc` が import するのは git 管理外のファイルだけなので、Nx は `api-rpc` から `api` への依存を検出できません。何も宣言しなければ、API のルートを変えてもフロントエンドの型チェックは選ばれません。

宣言には 3 つの設定を使います。

#### `typegen` の `outputs`

```jsonc
// apps/api/project.json
"typegen": {
  "executor": "nx:run-commands",
  "cache": true,
  "inputs": ["production", "^production", { "externalDependencies": ["@typescript/native", "typescript"] }],
  "outputs": ["{workspaceRoot}/libs/api-rpc/src/__generated__"],
  "options": { "commands": ["...", "tsc --project apps/api/tsconfig.typegen.json"] }
}
```

`outputs` を宣言しないと、Nx はこのタスクが何を出力したかを把握できず、出力を読むタスクを選べません。`cache: true` を付けると、API が変わらない限り、型の生成結果はキャッシュから復元されます。

#### 中継用の `typegen` と `^typegen`

```jsonc
// libs/api-rpc/project.json
"typegen": {
  "executor": "nx:noop",
  "dependsOn": [{ "projects": ["api"], "target": "typegen" }]
}
```

```jsonc
// nx.json
"targetDefaults": {
  "typecheck": {
    "dependsOn": ["^typegen"]
  }
}
```

`^typegen` は「依存先のプロジェクトの `typegen`」を指します。Nx は `typegen` を持たないプロジェクトを飛ばして依存をたどります。そのため、`api:typegen` につながるのは `api-rpc` に依存するプロジェクトだけです。

```
web-a:typecheck ─────────────────────┐
web-b:typecheck ─────────────────────┤
web-a-feature-todos:typecheck ───────┼─> api-rpc:typegen ──> api:typegen
web-b-feature-todo-create:typecheck ─┤   （nx:noop）         （.d.ts を出力）
api-rpc:typecheck ───────────────────┘

ui:typecheck                （typegen に依存しない）
```

`api-rpc` 自身の `typecheck` には `"dependsOn": ["typegen"]` を書きます。`^typegen` が指すのは依存先だけで、自プロジェクトの `typegen` は含まれないためです。

#### `dependentTasksOutputFiles`

```jsonc
// nx.json
"targetDefaults": {
  "typecheck": {
    "inputs": [
      "default",
      "^production",
      { "externalDependencies": ["@typescript/native", "typescript"] },
      { "dependentTasksOutputFiles": "**/*.d.ts", "transitive": true }
    ],
    "dependsOn": ["^typegen"]
  }
}
```

`dependentTasksOutputFiles` を指定すると、依存するタスクの `outputs` のうち glob に一致するファイルが、このタスクの入力に加わります。Nx はこの入力を次の 2 か所で使います。

- キャッシュのハッシュ計算。出力された `.d.ts` の内容が変わると、`typecheck` のキャッシュは無効になる
- Task-based affected の判定。依存するタスクが選ばれると、その出力を読む `typecheck` も選ばれる

`transitive: true` を付けると、直接依存するタスクのさらに先にあるタスクの出力も対象になります。`typecheck` が直接依存する `api-rpc:typegen` は何も出力しません。`.d.ts` を出力するのは 1 段先の `api:typegen` なので、この指定が必要です。

## 4. 実測結果

選ばれるタスクは、`npx nx affected -t typecheck test build --files=<file> --explain=stdout` で確認しました。

### 4.1 このリポジトリの設定

| 変更したファイル                                           | 選ばれるタスク                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API の内部実装（`usecases/list-todos.ts`）                 | `api:typecheck` `api:test` `api-rpc:typecheck` `web-a-feature-todos:typecheck` `web-b-feature-todo-create:typecheck` `web-a:typecheck` `web-b:typecheck` |
| API のテスト（`usecases/list-todos.spec.ts`）              | `api:typecheck` `api:test`                                                                                                                               |
| `api-rpc` を使わないライブラリ（`libs/ui`）                | `ui:typecheck` `ui:test` `web-a:typecheck` `web-a:build` `web-b:typecheck` `web-b:build`                                                                 |
| `web-a` 用のライブラリ（`libs/web-a/feature-todos`）       | `web-a-feature-todos:typecheck` `web-a-feature-todos:test` `web-a:typecheck` `web-a:build`                                                               |
| `web-b` 用のライブラリ（`libs/web-b/feature-todo-create`） | `web-b-feature-todo-create:typecheck` `web-b-feature-todo-create:test` `web-b:typecheck` `web-b:build`                                                   |

アプリごとのライブラリを変えた場合は、そのアプリのタスクだけが選ばれます。

`--explain` を付けると、選ばれた理由も表示されます。`web-a:typecheck` と `web-b:typecheck` の理由は `dependent-output`（producer は `api:typegen`）、`api:typecheck` の理由は `input-file` でした。

### 4.2 設定を変えた場合

API の内部実装（`usecases/list-todos.ts`）を変えたときに選ばれるタスクが、設定によってどう変わるかを比べました。

| 設定                                                         | 選ばれるタスク                                                                                                        | 問題                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| このリポジトリの設定                                         | `api:*` と、フロントエンドの 5 プロジェクト（`api-rpc`、アプリごとのライブラリ 2 つ、`web-a`、`web-b`）の `typecheck` | なし                                         |
| `transitive` を外す                                          | `api:typecheck` `api:test`                                                                                            | フロントエンドの型チェックが選ばれない       |
| `dependentTasksOutputFiles` を外す                           | `api:typecheck` `api:test`                                                                                            | 同上（ルート定義を変えた場合も選ばれない）   |
| 中継をやめ、`targetDefaults` で `api:typegen` に直接依存する | このリポジトリの設定に加えて `ui:typecheck`                                                                           | `api-rpc` を使わないプロジェクトまで選ばれる |
| `api-rpc` に `implicitDependencies: ["api"]` を置く          | このリポジトリの設定に加えて `web-a-feature-todos:test` `web-b-feature-todo-create:test` `web-a:build` `web-b:build`  | 型を読まないタスクまで選ばれる               |

最後の行は、よく見かける構成です。`implicitDependencies` でプロジェクト間の依存を作ると、フロントエンドの全プロジェクトの `^production` に API のソースが含まれます。この状態では、Task-based affected を有効にしてもテストとビルドは減りません。

### 4.3 キャッシュとの組み合わせ

`typecheck` の入力に含まれるのは、出力された `.d.ts` です。API のソースは含まれません。そのため、API の内部実装を変えても型が変わらなければ、フロントエンドの `typecheck` はキャッシュから復元されます。

| API への変更                           | フロントエンドの 5 プロジェクトの `typecheck` |
| -------------------------------------- | --------------------------------------------- |
| 内部実装だけを変える（型は変わらない） | 選ばれるが、キャッシュから復元される          |
| レスポンスの型を変える                 | 実行される                                    |

キャッシュから復元されるには、条件が 2 つあります。

- CI でキャッシュを共有していること（リモートキャッシュ、またはキャッシュディレクトリの保存と復元）
- 型定義の出力が、同じソースに対して毎回同じ内容になること。このサンプルでは、TypeScript 7 で 5 回出力して内容がすべて一致しました。規模の大きいプロジェクトでは出力の並び順が実行ごとに変わる場合があり、そのときはキャッシュを使えません

## 5. 注意点

### 5.1 テストの `inputs`

このサンプルのテストは Vitest で実行します。`test` タスクは `project.json` に書かず、`@nx/vitest` プラグインが各プロジェクトの `vitest.config.ts` から推論します。

Vitest は型を取り除いてからテストを実行するので、生成された型を読みません。そのため、このサンプルの `test` には `typegen` への `dependsOn` を付けていません。API を変えても、フロントエンドのテストは選ばれません。

テストの中で型チェックをする構成（Vitest の `typecheck` や、`ts-jest` の診断を有効にしている場合など）では、テストにも `typegen` への `dependsOn` を付けてください。`@nx/vitest` が推論する `inputs` には、`dependentTasksOutputFiles` と `transitive: true` が最初から入っています。glob は既定で `**/*.js`、Vitest の `typecheck` を有効にすると `**/*.{js,d.ts}` になります。

### 5.2 型チェックを含むビルド

このサンプルの `web-a:build` と `web-b:build` は `vite build` を実行するだけで、型チェックをしません。ビルドが型チェックを含む場合（`tsc && vite build` や、Next.js の `next build` など）は、ビルドにも同じ宣言が必要です。

### 5.3 プラグインが推論する `inputs`

`@nx/vitest` や `@nx/next` などのプラグインは、`inputs` を自動で設定します。`project.json` に `inputs` を書くと、プラグインが推論した値を上書きしてしまいます。書く前に `npx nx show project <name> --json` で実際の値を確認してください。

### 5.4 CI での件数の数え方

`nx show projects --affected` は、`--withTarget` を付けないと「いずれかのタスクが選ばれたプロジェクト」を返します。ジョブごとに並列数やランナーを決めるときは、`--withTarget=typecheck` のように target を指定して数えてください。カンマ区切りで複数の target を渡した場合は、和集合が返ります。

### 5.5 開発サーバー

`web-a` と `web-b` の `serve` には `api:typegen` への `dependsOn` を付けているので、起動時に型が 1 回生成されます。API を編集しながら型を追従させる `api:typegen-watch`（`tsc --watch`）を起動するのは、`api` の `serve` だけです。アプリの `serve` は watch に依存しないため、アプリがいくつあっても watch は 1 本で済みます。`npx nx run-many -t serve` でまとめて起動したときも、`api:typegen` の実行は 1 回でした。

## 6. 確認に使えるコマンド

```sh
# 選ばれるタスクと理由を表示する（実行しない）
npx nx affected -t typecheck test build --files=<file> --explain

# 理由を JSON で出力する
npx nx affected -t typecheck --files=<file> --explain=stdout

# 従来の方式で 1 回だけ実行する
NX_LEGACY_AFFECTED=true npx nx affected -t typecheck test build --files=<file>

# タスク間の依存を確認する
npx nx run-many -t typecheck --graph=stdout

# プロジェクトの実際の inputs / dependsOn を確認する
npx nx show project web-a --json

# 型チェックのコストを計測する（ルートファイル 80 個、エンドポイント 800 個）
node tools/bench.mjs 80 5

# クライアントを使うファイルを 3 個足して、合計 4 個で計測する
node tools/bench.mjs 80 5 3
```

## 参考

- [Run Only Tasks Affected by a PR（Nx）](https://nx.dev/docs/features/ci-features/affected)
- [Nx 24 のリリースノート](https://nx.dev/blog/nx-24-release)
- [RPC（Hono）](https://hono.dev/docs/guides/rpc)
