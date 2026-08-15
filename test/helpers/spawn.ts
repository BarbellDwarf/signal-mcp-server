import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
  "dist/index.js",
);

export interface SpawnedServer {
  proc: ChildProcess;
  stdout: string;
  stderr: string;
}

/** Spawn `node dist/index.js` with the given env and capture its output. */
export function spawnServer(env: NodeJS.ProcessEnv): SpawnedServer {
  const proc = spawn(process.execPath, [DIST_PATH], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const state: SpawnedServer = { proc, stdout: "", stderr: "" };
  proc.stdout?.on("data", (chunk: Buffer) => {
    state.stdout += chunk.toString();
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    state.stderr += chunk.toString();
  });
  return state;
}

/** Resolve the `url` from the startup log line (`{"transport":"http","url":"..."}`). */
export function waitForHttpUrl(state: SpawnedServer, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for the server URL.\nstdout:\n${state.stdout}\nstderr:\n${state.stderr}`,
        ),
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      state.proc.stdout?.removeListener("data", onData);
      state.proc.removeListener("exit", onExit);
    };

    const onData = () => {
      const match = state.stdout.match(/"url":"([^"]+)"/);
      if (match) {
        cleanup();
        resolve(match[1] as string);
      }
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(
        new Error(
          `Server exited (code ${code}) before listening.\nstdout:\n${state.stdout}\nstderr:\n${state.stderr}`,
        ),
      );
    };

    state.proc.stdout?.on("data", onData);
    state.proc.once("exit", onExit);
  });
}

/** Terminate the spawned server and wait for it to exit. */
export async function stopServer(state: SpawnedServer): Promise<void> {
  if (state.proc.exitCode !== null) return;
  state.proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (state.proc.exitCode !== null) {
      resolve();
      return;
    }
    state.proc.once("exit", () => resolve());
    setTimeout(() => {
      if (state.proc.exitCode === null) {
        state.proc.kill("SIGKILL");
      }
      resolve();
    }, 5000);
  });
}
