// Default in-cluster paths a projected ServiceAccount token/CA bundle are
// mounted at, and the well-known in-cluster API server DNS name every
// in-cluster client (including real `kubectl`) resolves. Extracted from
// opencode-agent-harness/bridge/src/discovery.ts and
// fleet-console/src/k8s-enumerate.ts, which both defined these identically.
export const DEFAULT_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";
export const DEFAULT_CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
export const DEFAULT_API_SERVER = "https://kubernetes.default.svc";
