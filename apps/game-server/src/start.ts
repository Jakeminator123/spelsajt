import { buildApp } from "./app";
import { attachRealtime } from "./realtime";
import {
  gameServerBinding,
  runtimeDependencies,
  socketAuthRevalidationInterval,
} from "./runtime";

try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const authRevalidationIntervalMs = socketAuthRevalidationInterval();
const app = buildApp(runtimeDependencies());
const realtime = attachRealtime(app, {
  authRevalidationIntervalMs,
});
const { host, port } = gameServerBinding();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down game server");
  realtime.close();
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.gameServices.eventBus.start?.();
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
