import { z } from "zod";

export const postgresGameEventChannel = "spelsajt_game_events_v2";

const postgresGameEventNotificationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sequence: z.int().positive(),
  tableId: z.string().trim().min(1).max(128),
});

export type PostgresGameEventNotification = z.infer<
  typeof postgresGameEventNotificationSchema
>;

export function encodePostgresGameEventNotification(
  notification: PostgresGameEventNotification,
): string {
  return JSON.stringify(postgresGameEventNotificationSchema.parse(notification));
}

export function parsePostgresGameEventNotification(
  payload: string,
): PostgresGameEventNotification {
  return postgresGameEventNotificationSchema.parse(JSON.parse(payload));
}
