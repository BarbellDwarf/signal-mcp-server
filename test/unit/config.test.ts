import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("applies defaults when no environment variables are set", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      signalApiUrl: "http://localhost:8080",
      signalNumber: undefined,
      transport: "stdio",
      host: "0.0.0.0",
      port: 3000,
      apiToken: undefined,
      logLevel: "info",
    });
  });

  it("overrides every value from the environment", () => {
    const config = loadConfig({
      SIGNAL_API_URL: "https://signal.example.com:8443/",
      SIGNAL_NUMBER: "+15551234567",
      SIGNAL_TRANSPORT: "http",
      HOST: "127.0.0.1",
      PORT: "4242",
      SIGNAL_API_TOKEN: "s3cret",
      LOG_LEVEL: "debug",
    });
    expect(config).toEqual({
      signalApiUrl: "https://signal.example.com:8443",
      signalNumber: "+15551234567",
      transport: "http",
      host: "127.0.0.1",
      port: 4242,
      apiToken: "s3cret",
      logLevel: "debug",
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
    });
    expect(config.signalNumber).toBeUndefined();
    expect(config.apiToken).toBeUndefined();
    expect(config.logLevel).toBe("info");
    expect(config.port).toBe(3000);
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
});
