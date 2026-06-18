import type { NextRequest } from "next/server";
import { vi } from "vitest";

export function createNextRequest(url: string, body?: unknown): NextRequest {
  return {
    nextUrl: new URL(url),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

export function createFetchAllResult<T>(resources: T[]) {
  return {
    fetchAll: vi.fn().mockResolvedValue({ resources }),
  };
}

export function getQueryParameterValue(
  parameters: Array<{ name: string; value: unknown }> | undefined,
  name: string
) {
  return parameters?.find((parameter) => parameter.name === name)?.value;
}

export function createMockContainer() {
  const query = vi.fn();
  const create = vi.fn();
  const upsert = vi.fn();
  const pointRead = vi.fn();
  const pointDelete = vi.fn();
  const pointReplace = vi.fn();

  const item = vi.fn((id: string, partitionKey: string) => ({
    read: () => pointRead(id, partitionKey),
    delete: () => pointDelete(id, partitionKey),
    replace: (document: unknown) => pointReplace(id, partitionKey, document),
  }));

  return {
    container: {
      items: {
        query,
        create,
        upsert,
      },
      item,
    },
    query,
    create,
    upsert,
    item,
    pointRead,
    pointDelete,
    pointReplace,
  };
}
