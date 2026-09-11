/**
 * Kubernetes' own label-value grammar (`metav1validation.IsValidLabelValue`):
 * empty, or `[A-Za-z0-9]` at both ends with `[A-Za-z0-9._-]` in between, at
 * most 63 characters. Re-validated here rather than transitively trusted
 * from the apiserver's own admission-time check, in case of a future
 * refactor, a proxy/cache sitting between the caller and the real
 * apiserver, or a value that is syntactically a valid label but was never
 * meant to be read back and surfaced as tool output to an LLM.
 */
export const LABEL_VALUE_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9._-]{0,61}[A-Za-z0-9])?$/;

/**
 * Same grammar as a Kubernetes namespace/pod NAME (DNS-1123 subdomain):
 * lowercase alphanumeric segments separated by single dots, each segment
 * starting/ending alphanumeric with only `-` in between, at most 253
 * characters.
 */
export const K8S_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

/** Rejects (returns `null` for) anything that is not a syntactically valid Kubernetes label value. */
export function sanitizeLabelValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return LABEL_VALUE_PATTERN.test(value) ? value : null;
}

/** Rejects (returns `null` for) anything that is not a syntactically valid Kubernetes object name. */
export function sanitizeK8sName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) {
    return null;
  }
  return K8S_NAME_PATTERN.test(value) ? value : null;
}
