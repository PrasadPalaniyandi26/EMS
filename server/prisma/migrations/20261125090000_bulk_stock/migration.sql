-- AlterTable
ALTER TABLE "items" ADD COLUMN     "purchase_factor" DECIMAL(12,4),
ADD COLUMN     "purchase_uom" VARCHAR(12),
ADD COLUMN     "reorder_level" DECIMAL(14,3),
ADD COLUMN     "stock_category_id" INTEGER,
ADD COLUMN     "supply_mode" VARCHAR(10) NOT NULL DEFAULT 'DIRECT';

-- CreateTable
CREATE TABLE "stock_purchase_lines" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "stock_purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "stock_moves" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "moved_on" DATE NOT NULL,
    "transaction_id" INTEGER,
    "project_id" INTEGER,
    "build_order_id" INTEGER,
    "department_id" INTEGER,
    "category_id" INTEGER,
    "corrects_id" INTEGER,
    "count_id" INTEGER,
    "reason" VARCHAR(300),
    "created_by_id" INTEGER,
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" SERIAL NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by_name" VARCHAR(100),
    "submitted_at" TIMESTAMP(3),
    "approved_by_name" VARCHAR(100),
    "approved_at" TIMESTAMP(3),
    "note" VARCHAR(300),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" SERIAL NOT NULL,
    "count_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "expected_qty" DECIMAL(14,3),
    "counted_qty" DECIMAL(14,3),

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_purchase_lines_transaction_id_idx" ON "stock_purchase_lines"("transaction_id");

-- CreateIndex
CREATE INDEX "stock_purchase_lines_item_id_idx" ON "stock_purchase_lines"("item_id");

-- CreateIndex
CREATE INDEX "stock_moves_item_id_moved_on_idx" ON "stock_moves"("item_id", "moved_on");

-- CreateIndex
CREATE INDEX "stock_moves_project_id_idx" ON "stock_moves"("project_id");

-- CreateIndex
CREATE INDEX "stock_moves_build_order_id_idx" ON "stock_moves"("build_order_id");

-- CreateIndex
CREATE INDEX "stock_moves_transaction_id_idx" ON "stock_moves"("transaction_id");

-- CreateIndex
CREATE INDEX "stock_moves_category_id_idx" ON "stock_moves"("category_id");

-- CreateIndex
CREATE INDEX "stock_moves_corrects_id_idx" ON "stock_moves"("corrects_id");

-- CreateIndex
CREATE INDEX "stock_moves_count_id_idx" ON "stock_moves"("count_id");

-- CreateIndex
CREATE INDEX "stock_moves_kind_moved_on_idx" ON "stock_moves"("kind", "moved_on");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_year_month_key" ON "stock_counts"("year", "month");

-- CreateIndex
CREATE INDEX "stock_count_lines_item_id_idx" ON "stock_count_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_count_id_item_id_key" ON "stock_count_lines"("count_id", "item_id");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_stock_category_id_fkey" FOREIGN KEY ("stock_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_purchase_lines" ADD CONSTRAINT "stock_purchase_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_purchase_lines" ADD CONSTRAINT "stock_purchase_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_build_order_id_fkey" FOREIGN KEY ("build_order_id") REFERENCES "build_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "stock_moves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Stock purchases are budgeted against Store; stock count differences are charged to Workshop
INSERT INTO "departments" ("name") VALUES ('Store'), ('Workshop') ON CONFLICT ("name") DO NOTHING;

INSERT INTO "budget_alert_rules" ("code", "name", "detail", "enabled", "threshold")
VALUES ('REORDER', 'Stock at reorder level', 'A stock part is at or below its reorder level', true, NULL)
ON CONFLICT ("code") DO NOTHING;
