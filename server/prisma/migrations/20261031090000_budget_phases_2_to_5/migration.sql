-- AlterTable
ALTER TABLE "products" ADD COLUMN     "standard_cost" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "contract_value" DECIMAL(14,2),
ADD COLUMN     "risk_rating" VARCHAR(10),
ADD COLUMN     "target_margin_pct" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR(80) NOT NULL,
    "rate_per_hour" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overhead_rates" (
    "id" SERIAL NOT NULL,
    "fy" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "pool_amount" DECIMAL(14,2) NOT NULL,
    "base_hours" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "overhead_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_estimates" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    "contingency_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "warranty_pct" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baselined_at" TIMESTAMP(3),

    CONSTRAINT "cost_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "phase" VARCHAR(60) NOT NULL,
    "type_id" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "basis" VARCHAR(200),

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "weight_pct" DECIMAL(5,2) NOT NULL,
    "planned_date" DATE NOT NULL,
    "done_date" DATE,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "part_no" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category_id" INTEGER,
    "uom" VARCHAR(12) NOT NULL DEFAULT 'nos',
    "standard_price" DECIMAL(12,2) NOT NULL,
    "last_price" DECIMAL(12,2),
    "supplier" VARCHAR(120),
    "lead_time_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boms" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    "freight_pct" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "warranty_pct" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "sub_bom_id" INTEGER,
    "quantity" DECIMAL(12,3) NOT NULL,
    "scrap_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_operations" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rate_card_id" INTEGER,
    "outsourced_cost" DECIMAL(12,2),

    CONSTRAINT "bom_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_costs" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "fy" INTEGER NOT NULL,
    "material" DECIMAL(14,2) NOT NULL,
    "scrap" DECIMAL(14,2) NOT NULL,
    "freight" DECIMAL(14,2) NOT NULL,
    "conversion" DECIMAL(14,2) NOT NULL,
    "overhead" DECIMAL(14,2) NOT NULL,
    "warranty" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'PROPOSED',
    "approved_by_name" VARCHAR(100),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standard_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plans" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "planned_units" INTEGER NOT NULL DEFAULT 0,
    "actual_units" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_changes" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "from_line_id" INTEGER,
    "to_line_id" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "requested_by_id" INTEGER,
    "requested_by_name" VARCHAR(100),
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMP(3),
    "decision_note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_locks" (
    "id" SERIAL NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "locked_by_name" VARCHAR(100),
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variance_notes" (
    "id" SERIAL NOT NULL,
    "line_id" INTEGER NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "reason_code" VARCHAR(20) NOT NULL,
    "comment" VARCHAR(500),
    "author_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_estimates_project_id_version_key" ON "cost_estimates"("project_id", "version");

-- CreateIndex
CREATE INDEX "estimate_lines_estimate_id_idx" ON "estimate_lines"("estimate_id");

-- CreateIndex
CREATE INDEX "project_milestones_project_id_idx" ON "project_milestones"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_part_no_key" ON "items"("part_no");

-- CreateIndex
CREATE UNIQUE INDEX "boms_product_id_version_key" ON "boms"("product_id", "version");

-- CreateIndex
CREATE INDEX "bom_lines_bom_id_idx" ON "bom_lines"("bom_id");

-- CreateIndex
CREATE INDEX "bom_operations_bom_id_idx" ON "bom_operations"("bom_id");

-- CreateIndex
CREATE INDEX "standard_costs_product_id_idx" ON "standard_costs"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_plans_product_id_year_month_key" ON "production_plans"("product_id", "year", "month");

-- CreateIndex
CREATE INDEX "budget_changes_status_idx" ON "budget_changes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "period_locks_year_month_key" ON "period_locks"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "variance_notes_line_id_year_month_key" ON "variance_notes"("line_id", "year", "month");

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "cost_estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

