import { defineAction } from "@agent-native/core/action";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../server/db";

export default defineAction({
  description: "Place a café table order.",
  schema: z.object({
    tableNumber: z.number().int().positive().max(999),
    customerName: z.string().max(100).default(""),
    instructions: z.string().max(500).default(""),
    paymentMethod: z.enum(["counter", "online"]),
    items: z.array(z.object({
      productId: z.string().min(1).max(128),
      quantity: z.number().int().positive().max(99),
    })).min(1).max(30),
  }),
  requiresAuth: false,
  maxBodyBytes: 16_384,
  run: async ({ tableNumber, customerName, instructions, paymentMethod, items }) => {
    const db = getDb();
    const products = await db.select().from(schema.products).where(inArray(schema.products.id, items.map((item) => item.productId)));
    const lines = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error("Menu item not found");
      return { ...item, name: product.name, price: product.price };
    });
    const id = crypto.randomUUID();
    const [order] = await db.insert(schema.orders).values({ id, tableNumber, customerName, instructions, paymentMethod, paymentStatus: paymentMethod === "online" ? "Demo mode — not paid" : "Due at counter", status: "Received", total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0), createdAt: new Date().toISOString() }).returning();
    await db.insert(schema.orderItems).values(lines.map((line) => ({ id: crypto.randomUUID(), orderId: id, ...line })));
    return { ...order, items: lines };
  },
});
