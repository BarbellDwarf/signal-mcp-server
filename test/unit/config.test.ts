import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("applies defaults when no environment variables are set", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      signalApiUrl: "http://localhost:8080",
      signalNumber: undefined,
      transport: "stdio",
      host: "127.0.0.1",
      port: 3000,
      maxBodyBytes: 10485760,
      apiToken: undefined,
      logLevel: "info",
    });
  });

  it("overrides every value from the environment", () => {
    const config = loadConfig({
      SIGNAL_API_URL: "https://signal.example.com:8443/",
      SIGNAL_NUMBER: "+15551234567",
      SIGNAL_TRANSPORT: "http",
      HOST: "0.0.0.0",
      PORT: "4242",
      SIGNAL_MAX_BODY_BYTES: "2048",
      SIGNAL_API_TOKEN: "s3cret",
      LOG_LEVEL: "debug",
      SIGNAL_ALLOWED_HOSTS: "mcp.example.com",
    });
    expect(config).toEqual({
      signalApiUrl: "https://signal.example.com:8443",
      signalNumber: "+15551234567",
      transport: "http",
      host: "0.0.0.0",
      port: 4242,
      maxBodyBytes: 2048,
      apiToken: "s3cret",
      logLevel: "debug",
      allowedHosts: ["mcp.example.com"],
    });
  });

  it("strips trailing slashes from the API URL", () => {
    expect(loadConfig({ SIGNAL_API_URL: "http://localhost:8080///" }).signalApiUrl).toBe(
      "http://localhost:8080",
    );
  });

  it("treats empty-string values as unset", () => {
    const config = loadConfig({
      SIGNAL_NUMBER: "",
      SIGNAL_API_TOKEN: "",
      LOG_LEVEL: "",
      PORT: "",
      SIGNAL_MAX_BODY_BYTES: "",
      SIGNAL_ALLOWED_HOSTS: "",
    });
    expect(config.signalNumber).toBeUndefined();
    expect(config.apiToken).toBeUndefined();
    expect(config.logLevel).toBe("info");
    expect(config.port).toBe(3000);
    expect(config.maxBodyBytes).toBe(10485760);
    expect(config.allowedHosts).toBeUndefined();
  });

  it("throws on an invalid transport", () => {
    expect(() => loadConfig({ SIGNAL_TRANSPORT: "sse" })).toThrow(/Invalid configuration/);
  });

  it("throws on a non-numeric port", () => {
    expect(() => loadConfig({ PORT: "not-a-port" })).toThrow(/Invalid configuration/);
  });

  it("throws on a negative or over-range port", () => {
    expect(() => loadConfig({ PORT: "-1" })).toThrow(/Invalid configuration/);
    expect(() => loadConfig({ PORT: "70000" })).toThrow(/Invalid configuration/);
  });

  it("allows port 0 for an ephemeral HTTP bind", () => {
    expect(loadConfig({ PORT: "0" }).port).toBe(0);
  });

  it("throws on an invalid API URL", () => {
    expect(() => loadConfig({ SIGNAL_API_URL: "not-a-url" })).toThrow(/Invalid configuration/);
  });

  it("throws on an invalid log level", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(/Invalid configuration/);
  });

  it("throws a descriptive message naming the offending field", () => {
    expect(() => loadConfig({ SIGNAL_TRANSPORT: "bogus" })).toThrow(/SIGNAL_TRANSPORT/);
  });

  it("parses SIGNAL_ALLOWED_RECIPIENTS into a trimmed allowlist", () => {
    const config = loadConfig({
      SIGNAL_ALLOWED_RECIPIENTS: " +15551234567 , group-1, ,+15559876543 ",
    });
    expect(config.allowedRecipients).toEqual(
      new Set(["+15551234567", "group-1", "+15559876543"]),
    );
  });

  it("omits the allowlist when SIGNAL_ALLOWED_RECIPIENTS is unset or blank", () => {
    expect(loadConfig({}).allowedRecipients).toBeUndefined();
    expect(loadConfig({ SIGNAL_ALLOWED_RECIPIENTS: "" }).allowedRecipients).toBeUndefined();
    expect(loadConfig({ SIGNAL_ALLOWED_RECIPIENTS: " , " }).allowedRecipients).toBeUndefined();
  });

  it("defaults HOST to the loopback interface", () => {
    expect(loadConfig({ HOST: "" }).host).toBe("127.0.0.1");
  });

  it("defaults SIGNAL_MAX_BODY_BYTES to 10 MiB", () => {
    expect(loadConfig({}).maxBodyBytes).toBe(10485760);
  });

  it("parses SIGNAL_MAX_BODY_BYTES as a positive integer", () => {
    expect(loadConfig({ SIGNAL_MAX_BODY_BYTES: "2048" }).maxBodyBytes).toBe(2048);
  });

  it("rejects a junk, zero, negative, or fractional SIGNAL_MAX_BODY_BYTES", () => {
    expect(() => loadConfig({ SIGNAL_MAX_BODY_BYTES: "not-a-number" })).toThrow(
      /Invalid configuration/,
    );
    expect(() => loadConfig({ SIGNAL_MAX_BODY_BYTES: "0" })).toThrow(/Invalid configuration/);
    expect(() => loadConfig({ SIGNAL_MAX_BODY_BYTES: "-5" })).toThrow(/Invalid configuration/);
    expect(() => loadConfig({ SIGNAL_MAX_BODY_BYTES: "1.5" })).toThrow(/Invalid configuration/);
  });

  it("parses SIGNAL_ALLOWED_HOSTS into a trimmed, deduplicated host list", () => {
    const config = loadConfig({
      SIGNAL_ALLOWED_HOSTS: " mcp.example.com , mcp.example.com:8443, , localhost, mcp.example.com ",
    });
    expect(config.allowedHosts).toEqual([
      "mcp.example.com",
      "mcp.example.com:8443",
      "localhost",
    ]);
  });

  it("omits allowedHosts when SIGNAL_ALLOWED_HOSTS is unset or blank", () => {
    expect(loadConfig({}).allowedHosts).toBeUndefined();
    expect(loadConfig({ SIGNAL_ALLOWED_HOSTS: "" }).allowedHosts).toBeUndefined();
    expect(loadConfig({ SIGNAL_ALLOWED_HOSTS: " , " }).allowedHosts).toBeUndefined();
  });
});
