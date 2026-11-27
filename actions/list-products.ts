import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { getDb, schema } from "../server/db";

export default defineAction({
  description: "List the café menu.",
  schema: z.object({}),
  http: { method: "GET" },
  requiresAuth: false,
  run: async () => getDb().select().from(schema.products),
});
