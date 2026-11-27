import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../server/db";

export default defineAction({
  description: "Get one café order and its items by order id for customer tracking.",
  schema: z.object({ id: z.string().describe("Order id from the tracking link") }),
  http: { method: "GET" },
  persistInBrowser: false,
  run: async ({ id }) => {
    const db = getDb();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
    if (!order) return null;
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
    return { ...order, items };
  },
});
