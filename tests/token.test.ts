import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readCaBundle, readServiceAccountToken } from "../src/token.js";

describe("readServiceAccountToken", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "k8s-discovery-client-token-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads and trims the token file", () => {
    const tokenPath = join(dir, "token");
    writeFileSync(tokenPath, "  abc123\n");
    expect(readServiceAccountToken(tokenPath)).toBe("abc123");
  });

  test("reflects a rotated token on the very next call -- no caching", () => {
    const tokenPath = join(dir, "token");
    writeFileSync(tokenPath, "first-token");
    expect(readServiceAccountToken(tokenPath)).toBe("first-token");
    writeFileSync(tokenPath, "rotated-token");
    expect(readServiceAccountToken(tokenPath)).toBe("rotated-token");
  });

  test("throws a clear error when the token file is missing", () => {
    expect(() => readServiceAccountToken(join(dir, "does-not-exist"))).toThrow(/could not read ServiceAccount token/);
  });

  test("throws a clear error when the token file is empty", () => {
    const tokenPath = join(dir, "empty-token");
    writeFileSync(tokenPath, "   \n");
    expect(() => readServiceAccountToken(tokenPath)).toThrow(/is empty/);
  });
});

describe("readCaBundle", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "k8s-discovery-client-ca-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads the CA bundle file", () => {
    const caPath = join(dir, "ca.crt");
    writeFileSync(caPath, "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n");
    expect(readCaBundle(caPath)).toContain("BEGIN CERTIFICATE");
  });

  test("throws a clear error when the CA file is missing", () => {
    expect(() => readCaBundle(join(dir, "does-not-exist"))).toThrow(/could not read ServiceAccount CA bundle/);
  });
});
