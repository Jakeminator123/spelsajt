import { z, type ZodType } from "zod";

import { gameCommandSchema, gameEventSchema, snapshotSchema } from "./index";

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
