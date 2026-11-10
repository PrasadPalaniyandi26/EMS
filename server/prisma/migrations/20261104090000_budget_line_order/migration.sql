-- A budget line can belong to a build order, so an order carries its own budget beside its product's
ALTER TABLE "budget_lines" ADD COLUMN "build_order_id" INTEGER;
CREATE INDEX "budget_lines_build_order_id_idx" ON "budget_lines"("build_order_id");
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_build_order_id_fkey" FOREIGN KEY ("build_order_id") REFERENCES "build_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
