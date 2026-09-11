import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildK8sNamespacedUrl, fetchK8sResource, fetchK8sResourceOrNull } from "../src/http.js";

describe("buildK8sNamespacedUrl", () => {
  test("builds a label-selector list URL", () => {
    const url = buildK8sNamespacedUrl("https://kubernetes.default.svc", "agents", "pods", {
      labelSelector: "app.kubernetes.io/name=opencode-acp-harness",
    });
    expect(url).toBe(
      "https://kubernetes.default.svc/api/v1/namespaces/agents/pods?labelSelector=app.kubernetes.io%2Fname%3Dopencode-acp-harness",
    );
  });

  test("builds a get-by-name URL", () => {
    const url = buildK8sNamespacedUrl("https://kubernetes.default.svc", "agents", "configmaps", {
      name: "demo-agent-profile",
    });
    expect(url).toBe("https://kubernetes.default.svc/api/v1/namespaces/agents/configmaps/demo-agent-profile");
  });

  test("URL-encodes the namespace and name/selector", () => {
    const url = buildK8sNamespacedUrl("https://kubernetes.default.svc", "ns with space", "secrets", {
      name: "name/with/slash",
    });
    expect(url).toBe("https://kubernetes.default.svc/api/v1/namespaces/ns%20with%20space/secrets/name%2Fwith%2Fslash");
  });
});

describe("fetchK8sResource", () => {
  let dir: string;
  let tokenPath: string;
  let caPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "k8s-discovery-client-http-test-"));
    tokenPath = join(dir, "token");
    caPath = join(dir, "ca.crt");
    writeFileSync(tokenPath, "test-token");
    writeFileSync(caPath, "test-ca");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("sends a Bearer token built from the fresh token file, and CA-pinned TLS options", async () => {
    let capturedInit: (RequestInit & { tls?: { ca: string; rejectUnauthorized: boolean } }) | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedInit = init as typeof capturedInit;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await fetchK8sResource("https://kubernetes.default.svc/api/v1/namespaces/agents/pods", {
      tokenPath,
      caPath,
      fetchImpl,
    });

    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer test-token");
    expect(capturedInit?.tls).toEqual({ ca: "test-ca", rejectUnauthorized: true });
  });

  test("re-reads the token fresh on every call -- reflects rotation with no caching", async () => {
    const seenTokens: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      seenTokens.push(headers.Authorization ?? "");
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    await fetchK8sResource("https://kubernetes.default.svc/api/v1/namespaces/agents/pods", { tokenPath, caPath, fetchImpl });
    writeFileSync(tokenPath, "rotated-token");
    await fetchK8sResource("https://kubernetes.default.svc/api/v1/namespaces/agents/pods", { tokenPath, caPath, fetchImpl });

    expect(seenTokens).toEqual(["Bearer test-token", "Bearer rotated-token"]);
  });

  test("returns the parsed JSON body on success", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 })) as unknown as typeof fetch;

    const result = await fetchK8sResource("https://kubernetes.default.svc/api/v1/namespaces/agents/pods", {
      tokenPath,
      caPath,
      fetchImpl,
    });

    expect(result).toEqual({ items: [1, 2, 3] });
  });

  test("throws with status and body text on a non-OK response", async () => {
    const fetchImpl = (async () =>
      new Response("forbidden", { status: 403, statusText: "Forbidden" })) as unknown as typeof fetch;

    await expect(
      fetchK8sResource("https://kubernetes.default.svc/api/v1/namespaces/agents/pods", { tokenPath, caPath, fetchImpl }),
    ).rejects.toThrow(/403.*Forbidden.*forbidden/s);
  });

  test("throws when the token file is missing (never silently proceeds unauthenticated)", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    await expect(
      fetchK8sResource("https://kubernetes.default.svc/api/v1/namespaces/agents/pods", {
        tokenPath: join(dir, "does-not-exist"),
        caPath,
        fetchImpl,
      }),
    ).rejects.toThrow(/could not read ServiceAccount token/);
  });
});

describe("fetchK8sResourceOrNull", () => {
  let dir: string;
  let tokenPath: string;
  let caPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "k8s-discovery-client-http-null-test-"));
    tokenPath = join(dir, "token");
    caPath = join(dir, "ca.crt");
    writeFileSync(tokenPath, "test-token");
    writeFileSync(caPath, "test-ca");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns the parsed body on success, same as fetchK8sResource", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ data: { foo: "bar" } }), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchK8sResourceOrNull("https://kubernetes.default.svc/api/v1/namespaces/agents/secrets/x", {
      tokenPath,
      caPath,
      fetchImpl,
    });
    expect(result).toEqual({ data: { foo: "bar" } });
  });

  test("swallows a non-OK response and returns null instead of throwing", async () => {
    const fetchImpl = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    const result = await fetchK8sResourceOrNull("https://kubernetes.default.svc/api/v1/namespaces/agents/secrets/x", {
      tokenPath,
      caPath,
      fetchImpl,
    });
    expect(result).toBeNull();
  });

  test("swallows a token-read failure and returns null instead of throwing", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const result = await fetchK8sResourceOrNull("https://kubernetes.default.svc/api/v1/namespaces/agents/secrets/x", {
      tokenPath: join(dir, "does-not-exist"),
      caPath,
      fetchImpl,
    });
    expect(result).toBeNull();
  });
});
