-- DropForeignKey
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_category_id_fkey";

-- DropForeignKey
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_user_id_fkey";

-- DropForeignKey
ALTER TABLE "monthly_budget_settings" DROP CONSTRAINT "monthly_budget_settings_user_id_fkey";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "code" VARCHAR(10);

-- AlterTable
ALTER TABLE "category_types" ADD COLUMN     "applies_to" VARCHAR(40),
ADD COLUMN     "code" VARCHAR(10);

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "owner_id" INTEGER;

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "code" VARCHAR(10);

-- AlterTable
ALTER TABLE "product_types" ADD COLUMN     "code" VARCHAR(10);

-- AlterTable
ALTER TABLE "project_categories" ADD COLUMN     "code" VARCHAR(10);

-- AlterTable
ALTER TABLE "project_types" ADD COLUMN     "code" VARCHAR(10);

-- AlterTable
ALTER TABLE "recurring_transactions" ADD COLUMN     "department_id" INTEGER,
ADD COLUMN     "escalation_pct" DECIMAL(5,2),
ADD COLUMN     "renewal_date" DATE;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "budget_line_id" INTEGER,
ADD COLUMN     "department_id" INTEGER,
ADD COLUMN     "over_budget_reason" VARCHAR(500);

-- DropTable
DROP TABLE "budgets";

-- DropTable
DROP TABLE "monthly_budget_settings";

-- CreateTable
CREATE TABLE "budget_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "fy_start_month" SMALLINT NOT NULL DEFAULT 4,
    "over_budget_mode" VARCHAR(10) NOT NULL DEFAULT 'WARN',
    "control_level" VARCHAR(10) NOT NULL DEFAULT 'TYPE',
    "net_of_claimable_gst" BOOLEAN NOT NULL DEFAULT true,
    "approval_threshold" DECIMAL(14,2) NOT NULL DEFAULT 100000,
    "contingency_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" SERIAL NOT NULL,
    "fy" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(15) NOT NULL DEFAULT 'DRAFT',
    "envelope" DECIMAL(14,2),
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMP(3),
    "submitted_by_name" VARCHAR(100),
    "approved_at" TIMESTAMP(3),
    "approved_by_id" INTEGER,
    "approved_by_name" VARCHAR(100),
    "decision_note" VARCHAR(500),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "cost_object" VARCHAR(12) NOT NULL,
    "project_id" INTEGER,
    "product_id" INTEGER,
    "department_id" INTEGER,
    "type_id" INTEGER,
    "category_id" INTEGER,
    "control_level" VARCHAR(10) NOT NULL DEFAULT 'TYPE',
    "strict" BOOLEAN NOT NULL DEFAULT false,
    "is_contingency" BOOLEAN NOT NULL DEFAULT false,
    "owner_id" INTEGER,
    "note" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_periods" (
    "id" SERIAL NOT NULL,
    "line_id" INTEGER NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "budget_line_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_alert_rules" (
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "detail" VARCHAR(300),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DECIMAL(8,2),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_alert_rules_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "budget_alerts" (
    "id" SERIAL NOT NULL,
    "rule_code" VARCHAR(30) NOT NULL,
    "line_id" INTEGER,
    "level" VARCHAR(10) NOT NULL,
    "message" VARCHAR(300) NOT NULL,
    "action" VARCHAR(30),
    "owner_id" INTEGER,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_plans_fy_key" ON "budget_plans"("fy");

-- CreateIndex
CREATE INDEX "budget_lines_plan_id_idx" ON "budget_lines"("plan_id");

-- CreateIndex
CREATE INDEX "budget_lines_project_id_idx" ON "budget_lines"("project_id");

-- CreateIndex
CREATE INDEX "budget_lines_product_id_idx" ON "budget_lines"("product_id");

-- CreateIndex
CREATE INDEX "budget_lines_department_id_idx" ON "budget_lines"("department_id");

-- CreateIndex
CREATE INDEX "budget_lines_type_id_idx" ON "budget_lines"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_periods_line_id_year_month_key" ON "budget_line_periods"("line_id", "year", "month");

-- CreateIndex
CREATE INDEX "budget_alerts_status_idx" ON "budget_alerts"("status");

-- CreateIndex
CREATE INDEX "budget_alerts_line_id_idx" ON "budget_alerts"("line_id");

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_periods" ADD CONSTRAINT "budget_line_periods_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "budget_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defaults
INSERT INTO "budget_settings" ("id") VALUES (1);

INSERT INTO "budget_alert_rules" ("code", "name", "detail", "enabled", "threshold") VALUES
  ('UTILISATION', 'Utilisation', 'Caution at 75%, warning at 90%, critical at 100% of the line (actual plus committed)', true, 75),
  ('NO_LINE', 'No budget line', 'Approved or submitted expenses that match no budget line', true, NULL),
  ('UNDER_USE', 'Under-use', 'Less than 50% used with 75% or more of the period gone: money may be released', true, 50),
  ('APPROVAL_WAIT', 'Approvals holding money', 'Submitted expense waiting more than 5 working days', true, 5),
  ('PLAN_READINESS', 'Plan readiness', 'Plan not approved by 1 April, or lines not phased', true, NULL);
