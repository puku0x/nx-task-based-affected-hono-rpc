import { hc } from 'hono/client';

// api のソースではなく、api:typegen が出力した型定義だけを読む
import type { AppType } from './__generated__/app';

export type { AppType };

export type ApiClient = ReturnType<typeof hc<AppType>>;

export function createApiClient(baseUrl: string): ApiClient {
  return hc<AppType>(baseUrl);
}
