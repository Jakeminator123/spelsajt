import { buildApp } from "./app";
import { attachRealtime } from "./realtime";
import { runtimeDependencies } from "./runtime";

try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const app = buildApp(runtimeDependencies());
const realtime = attachRealtime(app);
const host = process.env.GAME_SERVER_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.GAME_SERVER_PORT ?? "4000", 10);

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
