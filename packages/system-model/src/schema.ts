import {
  gameCommandTypesV2,
  gameEventTypesV2,
  gameNamesV2,
} from "@spelsajt/contracts";
import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const sourcePathSchema = z.string().regex(/^[a-z0-9][a-zA-Z0-9._/-]+$/);

export const maturitySchema = z.strictObject({
  contract: z.enum(["zod-v2", "zod-v1", "ad-hoc", "none"]),
  lifecycle: z.enum(["active", "planned", "deprecated"]),
  runtime: z.enum(["implemented", "partial", "absent"]),
  verification: z.enum(["direct", "partial", "fixture-only", "none"]),
});

const ownerSchema = z.enum(["backend", "frontend", "shared"]);
const gameSchema = z.enum(gameNamesV2);
const commandTypeSchema = z.enum(gameCommandTypesV2);
const eventTypeSchema = z.enum(gameEventTypesV2);

const nodeSchema = z.strictObject({
  id: idSchema,
  label: z.string().min(1),
  lane: z.enum(["player", "web", "server", "engine", "data", "presentation"]),
  owner: ownerSchema,
  source: sourcePathSchema,
  maturity: maturitySchema,
  summary: z.string().min(1),
});

const connectionSchema = z.strictObject({
  from: idSchema,
  label: z.string().min(1),
  to: idSchema,
});

const httpInterfaceSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("http"),
  method: z.enum(["GET", "POST"]),
  path: z.string().startsWith("/"),
  source: sourcePathSchema,
  maturity: maturitySchema,
  summary: z.string().min(1),
  accepts: z.array(commandTypeSchema),
  returns: z.string().min(1),
});

const realtimeInterfaceSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("realtime"),
  event: idSchema,
  source: sourcePathSchema,
  maturity: maturitySchema,
  summary: z.string().min(1),
  payload: z.enum(["GameEvent", "GameSnapshot", "ServerReady"]),
  eventTypes: z.array(eventTypeSchema),
});

const presentationConditionSchema = z.strictObject({
  equals: z.string().min(1),
  path: z.string().regex(/^payload\.[a-zA-Z0-9_.]+$/),
});

const presentationCueSchema = z.strictObject({
  actor: z.enum(["dealer", "player", "table", "from-event"]),
  clip: idSchema,
  condition: presentationConditionSchema.optional(),
  eventType: eventTypeSchema,
  game: gameSchema,
  id: idSchema,
  reducedMotionText: z.string().min(1),
  maturity: maturitySchema,
});

const presentationIgnoreSchema = z.strictObject({
  eventType: eventTypeSchema,
  game: gameSchema,
  id: idSchema,
  maturity: maturitySchema,
  reason: z.string().min(1),
});

const stepBaseSchema = z.strictObject({
  detail: z.string().min(1),
  id: idSchema,
  label: z.string().min(1),
  nodeId: idSchema,
});

const commandStepSchema = stepBaseSchema.extend({
  commandType: commandTypeSchema,
  interfaceId: idSchema,
  kind: z.literal("command"),
});

const eventStepSchema = stepBaseSchema.extend({
  eventType: eventTypeSchema,
  interfaceId: idSchema,
  kind: z.literal("event"),
});

const systemStepSchema = stepBaseSchema.extend({
  kind: z.literal("system"),
});

const animationStepSchema = stepBaseSchema.extend({
  cueId: idSchema,
  kind: z.literal("animation"),
});

const scenarioSchema = z.strictObject({
  game: gameSchema,
  id: idSchema,
  label: z.string().min(1),
  steps: z.array(
    z.discriminatedUnion("kind", [
      commandStepSchema,
      eventStepSchema,
      systemStepSchema,
      animationStepSchema,
    ]),
  ).min(1),
  summary: z.string().min(1),
});

export const systemModelSchema = z.strictObject({
  $schema: z.string().min(1),
  connections: z.array(connectionSchema).min(1),
  id: idSchema,
  interfaces: z.array(z.discriminatedUnion("kind", [httpInterfaceSchema, realtimeInterfaceSchema])).min(1),
  nodes: z.array(nodeSchema).min(1),
  presentationCues: z.array(presentationCueSchema).min(1),
  presentationIgnores: z.array(presentationIgnoreSchema),
  scenarios: z.array(scenarioSchema).min(1),
  schemaVersion: z.literal(2),
  title: z.string().min(1),
});

export function buildSystemModelJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(systemModelSchema, {
    io: "input",
    target: "draft-2020-12",
  });

  return {
    ...JSON.parse(JSON.stringify(generated)) as Record<string, unknown>,
    $id: "https://schemas.spelsajt.local/v2/system-model.schema.json",
    title: "Spelsajt system model v2",
  };
}

export type SystemModel = z.infer<typeof systemModelSchema>;
export type SystemScenario = SystemModel["scenarios"][number];
