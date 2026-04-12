import { clearCache as clearPretextCache } from "@chenglou/pretext";
import type { PreparedTextLayoutHandle } from "./text-layout-types";

const preparedTextCache = new Map<string, PreparedTextLayoutHandle>();

export function getPreparedTextLayoutHandle(cacheKey: string) {
  return preparedTextCache.get(cacheKey) ?? null;
}

export function setPreparedTextLayoutHandle(
  cacheKey: string,
  handle: PreparedTextLayoutHandle,
) {
  preparedTextCache.set(cacheKey, handle);
  return handle;
}

export function invalidateTextLayoutCache(fontKey?: string) {
  if (!fontKey) {
    preparedTextCache.clear();
    clearPretextCache();
    return;
  }

  for (const cacheKey of [...preparedTextCache.keys()]) {
    if (cacheKey.includes(fontKey)) {
      preparedTextCache.delete(cacheKey);
    }
  }
}
