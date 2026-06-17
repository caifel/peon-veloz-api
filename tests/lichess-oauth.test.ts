import { describe, it, expect } from "bun:test";
import "./setup"; // sets env vars required by db/client
import {
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  buildAuthUrl,
} from "../src/lib/lichess-oauth";

describe("PKCE helpers", () => {
  it("generateCodeVerifier returns a base64url string", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toBeString();
    expect(verifier.length).toBe(43); // 32 bytes → 43 base64url chars
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateCodeVerifier returns different values each time", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it("computeCodeChallenge produces a valid S256 challenge", async () => {
    const verifier = generateCodeVerifier();
    const challenge = await computeCodeChallenge(verifier);
    expect(challenge).toBeString();
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toBe(verifier); // challenge ≠ verifier
  });

  it("computeCodeChallenge is deterministic", async () => {
    const verifier = "test-verifier-fixed-string-32bytes!";
    const a = await computeCodeChallenge(verifier);
    const b = await computeCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it("generateState returns a UUID", () => {
    const state = generateState();
    expect(state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("buildAuthUrl", () => {
  it("builds a valid Lichess OAuth URL with all required params", () => {
    const url = buildAuthUrl("challenge123", "state456", "http://localhost:4000/api/auth/lichess/callback");
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://lichess.org");
    expect(parsed.pathname).toBe("/oauth");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("peonveloz");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/lichess/callback");
    expect(parsed.searchParams.get("scope")).toBe("email:read");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge123");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("state456");
  });
});

describe("deriveRedirectUri", () => {
  it("uses X-Forwarded-Proto and X-Forwarded-Host when present", async () => {
    // Dynamic import because deriveRedirectUri reads request headers
    const { deriveRedirectUri } = await import("../src/lib/lichess-oauth");
    const req = new Request("http://internal.local/ignored", {
      headers: {
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "midominio.com",
      },
    });
    expect(deriveRedirectUri(req)).toBe("https://midominio.com/api/auth/lichess/callback");
  });

  it("falls back to Host header when no X-Forwarded", async () => {
    const { deriveRedirectUri } = await import("../src/lib/lichess-oauth");
    const req = new Request("http://localhost:4000/some-path");
    expect(deriveRedirectUri(req)).toMatch(/^https?:\/\/localhost:?\d*\/api\/auth\/lichess\/callback$/);
  });
});
