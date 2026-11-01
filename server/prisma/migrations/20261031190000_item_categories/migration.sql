-- Part categories for the Part master
CREATE TABLE "item_categories" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(60) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "item_categories_name_key" ON "item_categories"("name");

ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
