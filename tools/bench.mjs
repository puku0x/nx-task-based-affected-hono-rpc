// ルート数の多い Hono アプリを tmp-bench/ に生成し、クライアント側の型チェックのコストを
// 「API のソースを直接 import する場合」と「事前に出力した .d.ts を import する場合」で比べる
//
// 使い方: node tools/bench.mjs [ルートファイル数] [1 ファイルあたりのエンドポイントの組数] [クライアントを使うファイル数]
// クライアントを使うファイル数は、アプリが取り込むフロントエンドのライブラリの数を想定している
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const routeFiles = Number(process.argv[2] ?? 40);
const pairsPerFile = Number(process.argv[3] ?? 5);
const consumerFiles = Number(process.argv[4] ?? 0);
const root = 'tmp-bench';

rmSync(root, { recursive: true, force: true });
for (const dir of ['api', 'direct', 'dts']) {
  mkdirSync(join(root, dir), { recursive: true });
}

for (let r = 0; r < routeFiles; r++) {
  let source = `import { Hono } from 'hono';\nimport { validator } from 'hono/validator';\n\nexport const r${r} = new Hono()`;
  for (let k = 0; k < pairsPerFile; k++) {
    source += `\n  .get('/items${k}/:id', (c) => c.json({ id: c.req.param('id'), name: 'n', count: ${k}, tags: ['a'], nested: { a: 1, b: 'x', c: [true] }, kind: 'k${r}_${k}' as const }))`;
    source += `\n  .post('/items${k}', validator('json', (v) => v as { name: string; count: number; kind: 'k${r}_${k}' }), (c) => c.json({ created: c.req.valid('json'), ok: true as const }, 201))`;
  }
  writeFileSync(join(root, 'api', `r${r}.ts`), `${source};\n`);
}

const indexes = Array.from({ length: routeFiles }, (_, r) => r);
writeFileSync(
  join(root, 'api', 'app.ts'),
  [
    "import { Hono } from 'hono';",
    ...indexes.map((r) => `import { r${r} } from './r${r}';`),
    '',
    `export const app = new Hono()${indexes.map((r) => `\n  .route('/r${r}', r${r})`).join('')};`,
    '',
    'export type AppType = typeof app;',
    '',
  ].join('\n'),
);

const client = (
  from,
) => `import { hc, type InferResponseType } from 'hono/client';
import type { AppType } from '${from}';

export const client = hc<AppType>('/');

export type Item = InferResponseType<(typeof client)['r3']['items2'][':id']['$get']>;

export async function load(): Promise<Item> {
  const response = await client.r3.items2[':id'].$get({ param: { id: '1' } });
  return response.json();
}
`;
writeFileSync(join(root, 'direct', 'client.ts'), client('../api/app'));
writeFileSync(join(root, 'dts', 'client.ts'), client('./generated/app'));

// 同じクライアントを、別々のエンドポイントで使うファイル
const consumer = (index) => {
  const route = `r${index % routeFiles}`;
  const item = `items${index % pairsPerFile}`;
  return `import type { InferResponseType } from 'hono/client';
import { client } from './client';

export type Item${index} = InferResponseType<(typeof client)['${route}']['${item}'][':id']['$get']>;

export async function load${index}(): Promise<Item${index}> {
  const response = await client.${route}.${item}[':id'].$get({ param: { id: '${index}' } });
  return response.json();
}
`;
};
for (let index = 0; index < consumerFiles; index++) {
  for (const dir of ['direct', 'dts']) {
    writeFileSync(join(root, dir, `consumer${index}.ts`), consumer(index));
  }
}

const compilerOptions = {
  target: 'ES2023',
  lib: ['ES2023', 'DOM'],
  module: 'preserve',
  moduleResolution: 'bundler',
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: ['node'],
};
for (const dir of ['api', 'direct', 'dts']) {
  writeFileSync(
    join(root, dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions, include: ['.'] }, null, 2),
  );
}
writeFileSync(
  join(root, 'api', 'tsconfig.typegen.json'),
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: false,
        rootDir: '.',
        outDir: '../dts/generated',
      },
    },
    null,
    2,
  ),
);

execFileSync(
  'npx',
  ['tsc', '--project', join(root, 'api', 'tsconfig.typegen.json')],
  { stdio: 'inherit' },
);

function measure(label, bin, dir, extraArgs = []) {
  const result = spawnSync(
    'npx',
    [
      bin,
      '--noEmit',
      '--project',
      join(root, dir, 'tsconfig.json'),
      '--extendedDiagnostics',
      ...extraArgs,
    ],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout}${result.stderr}`;
  const pick = (name) => output.match(new RegExp(`${name}:\\s+([\\d.]+)`))?.[1];
  return {
    構成: label,
    Types: Number(pick('Types')),
    'Memory used (MB)': Math.round(Number(pick('Memory used')) / 1024),
    'Total time (s)': Number(pick('Total time')),
    エラー: result.status === 0 ? 'なし' : 'あり',
  };
}

console.log(
  `エンドポイント数: ${routeFiles * pairsPerFile * 2}、クライアントを使うファイル数: ${consumerFiles + 1}`,
);
console.table([
  measure('TypeScript 6 / ソースを import', 'tsc6', 'direct'),
  measure('TypeScript 7 / ソースを import', 'tsc', 'direct'),
  measure(
    'TypeScript 7 / ソースを import（--singleThreaded）',
    'tsc',
    'direct',
    ['--singleThreaded'],
  ),
  measure('TypeScript 6 / .d.ts を import', 'tsc6', 'dts'),
  measure('TypeScript 7 / .d.ts を import', 'tsc', 'dts'),
]);
