-- AlterTable
ALTER TABLE "standard_costs" ADD COLUMN "outsourced" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Existing standards: outsourced work taken from the build steps of their BOM
UPDATE "standard_costs" sc
SET "outsourced" = COALESCE((SELECT SUM(bo."outsourced_cost") FROM "bom_operations" bo WHERE bo."bom_id" = sc."bom_id"), 0);
