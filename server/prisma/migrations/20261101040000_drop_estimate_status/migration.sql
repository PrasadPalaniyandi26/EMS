-- The estimate is no longer locked: the approved baseline is a copy, so the estimate needs no status or baselined date
ALTER TABLE "cost_estimates" DROP COLUMN "baselined_at",
DROP COLUMN "status";

-- Declare the two relations in the schema; the rules are the same, with ON UPDATE CASCADE spelled out
ALTER TABLE "item_price_log" DROP CONSTRAINT "item_price_log_item_id_fkey";
ALTER TABLE "rate_card_history" DROP CONSTRAINT "rate_card_history_rate_card_id_fkey";

ALTER TABLE "rate_card_history" ADD CONSTRAINT "rate_card_history_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_price_log" ADD CONSTRAINT "item_price_log_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
