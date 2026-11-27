import { defineAction } from "@agent-native/core/action";
import { and, asc, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { requireStaff, staffActionErrors } from "../server/staff-auth";

const REPORT_TIME_ZONE = "Asia/Kolkata" as const;
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.")
  .describe('Café business date in YYYY-MM-DD format; the report uses Asia/Kolkata.');

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().int(),
  quantity: z.number().int(),
  lineTotal: z.number().int(),
});

const orderSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  tableNumber: z.number().int(),
  customerName: z.string(),
  status: z.string(),
  paymentMethod: z.string(),
  paymentStatus: z.string(),
  total: z.number().int(),
  items: z.array(itemSchema),
});

const outputSchema = z.object({
  date: z.string(),
  timezone: z.literal(REPORT_TIME_ZONE),
  orderCount: z.number().int(),
  totalItems: z.number().int(),
  totalOrderValue: z.number().int(),
  counterDueValue: z.number().int(),
  onlineUnpaidValue: z.number().int(),
  itemTotals: z.array(z.object({
    name: z.string(),
    unitPrice: z.number().int(),
    quantity: z.number().int(),
    lineTotal: z.number().int(),
  })),
  orders: z.array(orderSchema),
});

function nextCalendarDate(date: string) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function kolkataMidnight(date: string) {
  return new Date(`${date}T00:00:00.000+05:30`).toISOString();
}

export default defineAction({
  description:
    "Get the staff-only daily café order report for a YYYY-MM-DD business date in Asia/Kolkata, including item totals, order details, and payment due summaries.",
  schema: z.object({ date: dateSchema }),
  outputSchema,
  http: { method: "GET" },
  requiresAuth: false,
  agentTool: false,
  persistInBrowser: false,
  readOnly: true,
  errors: staffActionErrors,
  run: async ({ date }, context) => {
    await requireStaff(context);

    const db = getDb();
    const orders = await db
      .select()
      .from(schema.orders)
      .where(and(
        gte(schema.orders.createdAt, kolkataMidnight(date)),
        lt(schema.orders.createdAt, kolkataMidnight(nextCalendarDate(date))),
      ))
      .orderBy(asc(schema.orders.createdAt));
    const orderIds = orders.map((order) => order.id);
    const items = orderIds.length
      ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
      : [];
    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const current = itemsByOrder.get(item.orderId) ?? [];
      current.push(item);
      itemsByOrder.set(item.orderId, current);
    }

    const reportOrders = orders.map((order) => ({
      ...order,
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        lineTotal: item.price * item.quantity,
      })),
    }));

    const itemTotalsByKey = new Map<string, {
      name: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
    }>();
    for (const order of reportOrders) {
      for (const item of order.items) {
        const key = JSON.stringify([item.name, item.price]);
        const total = itemTotalsByKey.get(key) ?? {
          name: item.name,
          unitPrice: item.price,
          quantity: 0,
          lineTotal: 0,
        };
        total.quantity += item.quantity;
        total.lineTotal += item.lineTotal;
        itemTotalsByKey.set(key, total);
      }
    }

    return {
      date,
      timezone: REPORT_TIME_ZONE,
      orderCount: reportOrders.length,
      totalItems: reportOrders.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      ),
      totalOrderValue: reportOrders.reduce((sum, order) => sum + order.total, 0),
      counterDueValue: reportOrders.reduce(
        (sum, order) => sum + (order.paymentMethod === "counter" && order.paymentStatus !== "Paid" ? order.total : 0),
        0,
      ),
      onlineUnpaidValue: reportOrders.reduce(
        (sum, order) => sum + (order.paymentMethod === "online" && order.paymentStatus !== "Paid" ? order.total : 0),
        0,
      ),
      itemTotals: [...itemTotalsByKey.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      orders: reportOrders,
    };
  },
});
