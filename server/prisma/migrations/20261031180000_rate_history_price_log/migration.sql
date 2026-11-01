-- Dated labour rates and a log of prices paid for parts
CREATE TABLE "rate_card_history" (
  "id" SERIAL PRIMARY KEY,
  "rate_card_id" INTEGER NOT NULL REFERENCES "rate_cards"("id") ON DELETE CASCADE,
  "rate_per_hour" DECIMAL(10,2) NOT NULL,
  "effective_from" DATE NOT NULL,
  "changed_by_name" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "rate_card_history_rate_card_id_effective_from_key" ON "rate_card_history"("rate_card_id", "effective_from");

INSERT INTO "rate_card_history" ("rate_card_id", "rate_per_hour", "effective_from")
SELECT "id", "rate_per_hour", "effective_from" FROM "rate_cards";

CREATE TABLE "item_price_log" (
  "id" SERIAL PRIMARY KEY,
  "item_id" INTEGER NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "price" DECIMAL(12,2) NOT NULL,
  "paid_on" DATE NOT NULL,
  "supplier" VARCHAR(150),
  "note" VARCHAR(200),
  "recorded_by_name" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "item_price_log_item_id_idx" ON "item_price_log"("item_id");

INSERT INTO "item_price_log" ("item_id", "price", "paid_on", "note")
SELECT "id", "last_price", CURRENT_DATE, 'Existing last paid price' FROM "items" WHERE "last_price" IS NOT NULL;
