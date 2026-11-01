-- Operations can be costed as a fixed amount per unit, with no role or hours
ALTER TABLE "operation_types" ADD COLUMN "is_fixed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bom_operations" ADD COLUMN "fixed_cost" DECIMAL(12,2);
ALTER TABLE "standard_costs" ADD COLUMN "fixed" DECIMAL(14,2) NOT NULL DEFAULT 0;
