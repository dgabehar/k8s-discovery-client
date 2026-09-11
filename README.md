# @dgabehar/k8s-discovery-client

Shared in-cluster Kubernetes-API-discovery primitives, extracted from
`opencode-agent-harness/bridge/src/discovery.ts` and
`fleet-console/src/k8s-enumerate.ts`, which had independently developed the
same pattern: a long-running Bun process querying the K8s API over
HTTPS+Bearer using its own projected ServiceAccount token, with no
`kubectl` binary and no `@kubernetes/client-node` (or any other K8s SDK)
dependency -- Bun's native `fetch` already supports the per-request
`tls: { ca, rejectUnauthorized }` override this needs.

## What this package is

- Fresh-read-every-call ServiceAccount token/CA bundle access
  (`readServiceAccountToken`, `readCaBundle`) -- never cached, so a
  long-running process never silently starts failing once the token file
  rotates underneath it (kubelet rotates it roughly hourly).
- A generic namespaced-URL builder (`buildK8sNamespacedUrl`) covering both
  "list by label selector" and "get one object by name."
- A generic CA-pinned, Bearer-authenticated fetch wrapper
  (`fetchK8sResource`, and `fetchK8sResourceOrNull` for callers that want a
  single missing/misconfigured object to degrade to `null` rather than
  abort an entire pass).
- Kubernetes grammar validators for output-allowlisting untrusted API
  responses before they reach a caller's own application logic --
  `sanitizeLabelValue` (label-value grammar) and `sanitizeK8sName`
  (DNS-1123 subdomain grammar, for `metadata.namespace`/`metadata.name`).
- `parseK8sItemList`, generalizing the "validate `.items` is an array, skip
  any item with an unsanitizable namespace/name, extract the rest" shape
  both consumers' own list-parsing functions shared.

## What this package deliberately is NOT

- **Not a full K8s client SDK.** No CRUD beyond GET/list, no watch support,
  no generated types for every K8s resource kind. If a consumer needs that,
  this package is the wrong tool.
- **Not the place for a label-selector constant.** `FLEET_LABEL_SELECTOR`
  (`app.kubernetes.io/name=opencode-acp-harness,app.kubernetes.io/component=agent-bridge`)
  is intentionally kept duplicated as a local constant in each consuming
  repo rather than exported from here, even though both consumers' copies
  are currently byte-identical. The two consumers use it to answer two
  different questions (which pods are my agent peers vs. which
  releases/pods a monitoring dashboard should show) that happen to share a
  selector string today by coincidence, not by requirement -- a future
  change to one consumer's selection semantics should not force a version
  bump of this package and a mandatory re-consumption by the other.
- **Not the place for application-specific content policy.** Free-text
  sanitization rules (e.g. bounding/truncating an operator-authored
  description field) belong in the one consumer that has a concrete use
  for them, not here -- this package validates Kubernetes *grammar*, not
  arbitrary application content shape.

## Usage

```ts
import {
  buildK8sNamespacedUrl,
  fetchK8sResource,
  parseK8sItemList,
  sanitizeLabelValue,
  DEFAULT_API_SERVER,
} from "@dgabehar/k8s-discovery-client";

const url = buildK8sNamespacedUrl(DEFAULT_API_SERVER, "agents", "pods", {
  labelSelector: "app.kubernetes.io/component=agent-bridge",
});
const raw = await fetchK8sResource(url);
const pods = parseK8sItemList(raw, (namespace, name, _metadata, labels) => ({
  namespace,
  name,
  release: sanitizeLabelValue(labels["app.kubernetes.io/instance"]),
}));
```

## Publishing

Tag-triggered (`v*.*.*`) via `.github/workflows/publish.yml`, which
verifies the pushed tag matches `package.json`'s own `version` before
running `npm publish` against GitHub Packages (`npm.pkg.github.com`).
Consumers add a scope-mapping `.npmrc` (`@dgabehar:registry=https://npm.pkg.github.com`)
and pin an exact version in their own `package.json`.
