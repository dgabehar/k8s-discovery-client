import { DEFAULT_API_SERVER, DEFAULT_CA_PATH, DEFAULT_TOKEN_PATH } from "./constants.js";
import { readCaBundle, readServiceAccountToken } from "./token.js";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface FetchOptions {
  apiServer?: string;
  tokenPath?: string;
  caPath?: string;
  /** Injectable for tests -- production callers always omit this and get the real global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Either `{ name }` (a `GET .../<resource>/<name>` request for one named
 * object) or `{ labelSelector }` (a `GET .../<resource>?labelSelector=...`
 * list request) -- never both.
 */
export type K8sUrlTarget = { name: string; labelSelector?: never } | { labelSelector: string; name?: never };

/**
 * Builds a namespaced K8s API URL for either a get-by-name or a
 * label-selector list request. Replaces the three near-identical
 * per-resource URL builders (pods/services/secrets) both consuming repos
 * used to hand-roll.
 */
export function buildK8sNamespacedUrl(
  apiServer: string,
  namespace: string,
  resource: string,
  target: K8sUrlTarget,
): string {
  const base = `${apiServer}/api/v1/namespaces/${encodeURIComponent(namespace)}/${resource}`;
  if (target.name !== undefined) {
    return `${base}/${encodeURIComponent(target.name)}`;
  }
  return `${base}?labelSelector=${encodeURIComponent(target.labelSelector)}`;
}

/**
 * The real K8s API call: fresh ServiceAccount token + CA bundle read on
 * EVERY call (see token.ts's own doc comments on why), Bearer auth,
 * CA-pinned TLS (`tls: { ca, rejectUnauthorized: true }` -- verifies against
 * the projected CA bundle, never the system trust store, matching in-cluster
 * `kubectl`'s own behavior). Throws with status/body on a non-OK response;
 * otherwise returns the parsed JSON body, `unknown` -- callers own their own
 * shape validation.
 */
export async function fetchK8sResource(url: string, options: FetchOptions = {}): Promise<unknown> {
  const tokenPath = options.tokenPath ?? DEFAULT_TOKEN_PATH;
  const caPath = options.caPath ?? DEFAULT_CA_PATH;
  const fetchImpl = options.fetchImpl ?? fetch;

  const token = readServiceAccountToken(tokenPath);
  const ca = readCaBundle(caPath);

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    tls: { ca, rejectUnauthorized: true },
  } as RequestInit & { tls: { ca: string; rejectUnauthorized: boolean } });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `k8s-discovery-client: K8s API request failed: ${response.status} ${response.statusText}${body ? ` -- ${body}` : ""}`,
    );
  }

  return response.json();
}

/**
 * Same as `fetchK8sResource`, but returns `null` (never throws) on ANY
 * failure -- not found, RBAC denied, malformed response, a token/CA read
 * failure, anything. Generalizes the "one missing/misconfigured resource
 * degrades to null rather than aborting an entire discovery pass" discipline
 * `fleet-console/src/k8s-enumerate.ts`'s own `fetchSecretValue` already
 * established for status-token Secrets.
 */
export async function fetchK8sResourceOrNull(url: string, options: FetchOptions = {}): Promise<unknown | null> {
  try {
    return await fetchK8sResource(url, options);
  } catch {
    return null;
  }
}

export { describeError };
