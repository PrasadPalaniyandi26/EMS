-- One base hours figure per financial year; every pool is recovered over it
CREATE TABLE "overhead_bases" (
  "id" SERIAL PRIMARY KEY,
  "fy" INTEGER NOT NULL,
  "base_hours" DECIMAL(12,2) NOT NULL
);
CREATE UNIQUE INDEX "overhead_bases_fy_key" ON "overhead_bases"("fy");

-- Pools in a year that shared the same hours give that year's base
INSERT INTO "overhead_bases" ("fy", "base_hours")
SELECT "fy", MAX("base_hours") FROM "overhead_rates" GROUP BY "fy";

ALTER TABLE "overhead_rates" DROP COLUMN "base_hours";
