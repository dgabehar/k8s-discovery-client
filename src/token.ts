import { readFileSync } from "node:fs";

import { DEFAULT_CA_PATH, DEFAULT_TOKEN_PATH } from "./constants.js";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fresh read on EVERY call -- never cache/hoist/memoize this value. A
 * projected ServiceAccount token is time-bound and kubelet-rotated into the
 * same file path (typically hourly); a long-running caller that cached this
 * value would silently start failing with 401s once the token file rotates
 * underneath it.
 */
export function readServiceAccountToken(tokenPath: string = DEFAULT_TOKEN_PATH): string {
  let raw: string;
  try {
    raw = readFileSync(tokenPath, "utf-8");
  } catch (err) {
    throw new Error(`k8s-discovery-client: could not read ServiceAccount token at ${tokenPath}: ${describeError(err)}`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`k8s-discovery-client: ServiceAccount token at ${tokenPath} is empty`);
  }
  return trimmed;
}

export function readCaBundle(caPath: string = DEFAULT_CA_PATH): string {
  try {
    return readFileSync(caPath, "utf-8");
  } catch (err) {
    throw new Error(`k8s-discovery-client: could not read ServiceAccount CA bundle at ${caPath}: ${describeError(err)}`);
  }
}
