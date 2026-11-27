CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"table_number" integer NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"payment_method" text NOT NULL,
	"payment_status" text DEFAULT 'Pending' NOT NULL,
	"status" text DEFAULT 'Received' NOT NULL,
	"total" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"price" integer NOT NULL,
	"image" text NOT NULL,
	"tag" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "products" ("id", "name", "description", "category", "price", "image", "tag") VALUES
('chai', 'Masala Chai', 'A little spice, a lot of comfort. Made the proper way.', 'Chai & Tea', 40, 'https://images.pexels.com/photos/5071493/pexels-photo-5071493.jpeg', 'HOUSE FAVOURITE'),
('filter', 'Filter Coffee', 'Slow-brewed South Indian coffee, strong and soulful.', 'Coffee', 70, 'https://images.pexels.com/photos/15480366/pexels-photo-15480366.jpeg', 'CLASSIC'),
('cold', 'Cold Coffee', 'Creamy, chilled coffee for the long conversations.', 'Cold Drinks', 120, 'https://images.pexels.com/photos/38028984/pexels-photo-38028984.jpeg', ''),
('latte', 'Caramel Latte', 'Espresso and steamed milk with a caramel finish.', 'Coffee', 150, 'https://images.pexels.com/photos/15480366/pexels-photo-15480366.jpeg', ''),
('sandwich', 'Aloo Cheese Sandwich', 'A toasted, cheesy favourite with a little desi kick.', 'Snacks', 130, 'https://images.pexels.com/photos/8363976/pexels-photo-8363976.jpeg', 'MUST TRY'),
('fries', 'Peri Peri Fries', 'Crispy golden fries tossed in our spicy seasoning.', 'Snacks', 110, 'https://images.pexels.com/photos/8363976/pexels-photo-8363976.jpeg', ''),
('brownie', 'Chocolate Brownie', 'Rich, fudgy chocolate goodness. Best shared.', 'Desserts', 100, 'https://images.pexels.com/photos/19846422/pexels-photo-19846422.jpeg', ''),
('lemon', 'Lemon Iced Tea', 'Bright, refreshing tea with a squeeze of lemon.', 'Cold Drinks', 90, 'https://images.pexels.com/photos/792613/pexels-photo-792613.jpeg', '');
