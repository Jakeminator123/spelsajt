import { z, type ZodType } from "zod";

import { gameCommandSchema, gameEventSchema, snapshotSchema } from "./index";
import {
  commandAckV2Schema,
  gameCommandV2Schema,
  gameEventV2Schema,
  gameSnapshotV2Schema,
  rouletteBetV2Schema,
  socketAuthV2Schema,
  tableSubscriptionAckV2Schema,
  tableSubscriptionV2Schema,
} from "./v2";

const definitions = [
  {
    fileName: "game-command.schema.json",
    id: "https://schemas.spelsajt.local/v1/game-command.schema.json",
    schema: gameCommandSchema,
    title: "Spelsajt game command v1",
  },
  {
    fileName: "game-event.schema.json",
    id: "https://schemas.spelsajt.local/v1/game-event.schema.json",
    schema: gameEventSchema,
    title: "Spelsajt game event v1",
  },
  {
    fileName: "game-snapshot.schema.json",
    id: "https://schemas.spelsajt.local/v1/game-snapshot.schema.json",
    schema: snapshotSchema,
    title: "Spelsajt game snapshot v1",
  },
  {
    fileName: "v2/game-command.schema.json",
    id: "https://schemas.spelsajt.local/v2/game-command.schema.json",
    schema: gameCommandV2Schema,
    title: "Spelsajt game command v2",
  },
  {
    fileName: "v2/game-event.schema.json",
    id: "https://schemas.spelsajt.local/v2/game-event.schema.json",
    schema: gameEventV2Schema,
    title: "Spelsajt game event v2",
  },
  {
    fileName: "v2/game-snapshot.schema.json",
    id: "https://schemas.spelsajt.local/v2/game-snapshot.schema.json",
    schema: gameSnapshotV2Schema,
    title: "Spelsajt game snapshot v2",
  },
  {
    fileName: "v2/command-ack.schema.json",
    id: "https://schemas.spelsajt.local/v2/command-ack.schema.json",
    schema: commandAckV2Schema,
    title: "Spelsajt command acknowledgement v2",
  },
  {
    fileName: "v2/roulette-bet.schema.json",
    id: "https://schemas.spelsajt.local/v2/roulette-bet.schema.json",
    schema: rouletteBetV2Schema,
    title: "Spelsajt roulette bet v2",
  },
  {
    fileName: "v2/socket-auth.schema.json",
    id: "https://schemas.spelsajt.local/v2/socket-auth.schema.json",
    schema: socketAuthV2Schema,
    title: "Spelsajt Socket.IO auth v2",
  },
  {
    fileName: "v2/table-subscription.schema.json",
    id: "https://schemas.spelsajt.local/v2/table-subscription.schema.json",
    schema: tableSubscriptionV2Schema,
    title: "Spelsajt table subscription v2",
  },
  {
    fileName: "v2/table-subscription-ack.schema.json",
    id: "https://schemas.spelsajt.local/v2/table-subscription-ack.schema.json",
    schema: tableSubscriptionAckV2Schema,
    title: "Spelsajt table subscription acknowledgement v2",
  },
] as const satisfies readonly {
  fileName: string;
  id: string;
  schema: ZodType;
  title: string;
}[];

export function buildContractJsonSchemas(): ReadonlyMap<string, Record<string, unknown>> {
  return new Map(
    definitions.map(({ fileName, id, schema, title }) => {
      const generated = z.toJSONSchema(schema, {
        io: "input",
        target: "draft-2020-12",
      });
      const serializable = JSON.parse(JSON.stringify(generated)) as Record<string, unknown>;

      return [
        fileName,
        {
          ...serializable,
          $id: id,
          title,
        },
      ];
    }),
  );
}
