import { defineAction, fail } from "@agent-native/core/action";
import { requireStaff } from "../server/staff-auth";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../server/db";

export default defineAction({
  description: "Update a café order status.",
  schema: z.object({
    id: z.string().describe("Order id to update"),
    status: z.enum(["Received", "Accepted", "Preparing", "Ready"]).optional().describe("Next order status; omit when only changing the estimate"),
    estimatedMinutes: z.number().int().min(1).max(240).nullable().optional().describe("Estimated preparation time in minutes; use null to clear it"),
  }),
  agentTool: false,
  run: async ({ id, status, estimatedMinutes }, context) => {
    requireStaff(context);
    if (!status && estimatedMinutes === undefined) fail("Provide an order status or preparation estimate.");
    const patch: { status?: string; estimatedMinutes?: number | null } = {};
    if (status) patch.status = status;
    if (estimatedMinutes !== undefined) patch.estimatedMinutes = estimatedMinutes;
    const [order] = await getDb().update(schema.orders).set(patch).where(eq(schema.orders.id, id)).returning();
    return order;
  },
});
