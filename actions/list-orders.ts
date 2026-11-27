import { defineAction } from "@agent-native/core/action";
import { requireStaff } from "../server/staff-auth";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../server/db";

export default defineAction({
  description: "List recent café orders and their items.",
  schema: z.object({}),
  http: { method: "GET" },
  agentTool: false,
  persistInBrowser: false,
  run: async (_, context) => {
    requireStaff(context);
    const db = getDb();
    const orders = await db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(100);
    const items = await db.select().from(schema.orderItems);
    return orders.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id) }));
  },
});
