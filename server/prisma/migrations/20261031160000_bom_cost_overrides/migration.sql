-- Per-product overhead rate override and the reason for adjusting overhead, freight or warranty
ALTER TABLE "boms" ADD COLUMN "overhead_rate_override" DECIMAL(10,2),
ADD COLUMN "adjust_reason" VARCHAR(300);
