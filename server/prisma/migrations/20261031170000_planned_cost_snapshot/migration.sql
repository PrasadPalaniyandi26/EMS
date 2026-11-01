-- A planned cost remembers the rates it was built with, who proposed it, and why it was rejected
ALTER TABLE "standard_costs"
  ADD COLUMN "overhead_rate" DECIMAL(10,2),
  ADD COLUMN "freight_pct" DECIMAL(5,2),
  ADD COLUMN "warranty_pct" DECIMAL(5,2),
  ADD COLUMN "adjust_reason" VARCHAR(300),
  ADD COLUMN "proposed_by_id" INTEGER,
  ADD COLUMN "proposed_by_name" VARCHAR(100),
  ADD COLUMN "rejected_by_name" VARCHAR(100),
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "reject_reason" VARCHAR(300);
