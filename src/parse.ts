import { sanitizeK8sName } from "./sanitize.js";

/**
 * Pure parsing/allowlisting core for a K8s `List`-shaped API response
 * (PodList, ServiceList, etc.) -- generalizes the shared shape of
 * `parsePodList`/`parseServiceList`: validate `raw.items` is an array
 * (throwing a consistent, greppable error otherwise), and for each item
 * validate `metadata.namespace`/`metadata.name` before handing the item's
 * metadata/labels to a caller-supplied `extract` closure. An item with an
 * unsanitizable namespace/name is skipped outright -- those fields are
 * structurally required by the K8s API for any real object, so a response
 * missing them doesn't look like a real object and is not worth surfacing
 * as a half-populated/misleading result. `extract` receives the
 * ALREADY-VALIDATED namespace/name so it never has to re-derive them, and
 * returns `null` to skip the item for its own (caller-specific) reasons,
 * or a fully-formed `T` to include it.
 */
export function parseK8sItemList<T>(
  raw: unknown,
  extract: (namespace: string, name: string, metadata: Record<string, unknown>, labels: Record<string, unknown>) => T | null,
): T[] {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new Error('k8s-discovery-client: unexpected K8s API response shape (missing/non-array "items")');
  }

  const results: T[] = [];
  for (const item of items) {
    const metadata = (item as { metadata?: Record<string, unknown> })?.metadata ?? {};
    const namespace = sanitizeK8sName(metadata.namespace);
    const name = sanitizeK8sName(metadata.name);
    if (!namespace || !name) {
      continue;
    }
    const labels = (metadata.labels as Record<string, unknown> | undefined) ?? {};
    const result = extract(namespace, name, metadata, labels);
    if (result !== null) {
      results.push(result);
    }
  }
  return results;
}
