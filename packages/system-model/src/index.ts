import rawSystemModel from "../models/play-money-mvp.json";

import { systemModelSchema } from "./schema";

export { buildSystemModelJsonSchema, maturitySchema, systemModelSchema } from "./schema";
export type { SystemModel, SystemScenario } from "./schema";

export const systemModel = systemModelSchema.parse(rawSystemModel);
