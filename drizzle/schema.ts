import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  image: text("image").notNull(),
  tag: text("tag").notNull().default(""),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  tableNumber: integer("table_number").notNull(),
  customerName: text("customer_name").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("Pending"),
  status: text("status").notNull().default("Received"),
  total: integer("total").notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  createdAt: text("created_at").notNull(),
});

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  quantity: integer("quantity").notNull(),
});
