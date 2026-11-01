-- CreateTable
CREATE TABLE "estimate_baselines" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'PROPOSED',
    "direct" DECIMAL(14,2) NOT NULL,
    "contingency" DECIMAL(14,2) NOT NULL,
    "warranty" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "contingency_pct" DECIMAL(5,2) NOT NULL,
    "warranty_pct" DECIMAL(5,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "proposed_by_id" INTEGER,
    "proposed_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_name" VARCHAR(100),
    "approved_at" TIMESTAMP(3),
    "rejected_by_name" VARCHAR(100),
    "rejected_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(300),

    CONSTRAINT "estimate_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_baselines_project_id_idx" ON "estimate_baselines"("project_id");

-- An estimate that was baselined becomes an approved baseline, and the estimate itself is open to edit again
INSERT INTO "estimate_baselines" ("project_id", "status", "direct", "contingency", "warranty", "total", "contingency_pct", "warranty_pct", "lines", "proposed_by_name", "created_at", "approved_by_name", "approved_at")
SELECT e."project_id", 'APPROVED',
  ROUND(s."direct", 2),
  ROUND(s."direct" * e."contingency_pct" / 100, 2),
  ROUND((s."direct" + s."direct" * e."contingency_pct" / 100) * e."warranty_pct" / 100, 2),
  ROUND(s."direct" + s."direct" * e."contingency_pct" / 100 + (s."direct" + s."direct" * e."contingency_pct" / 100) * e."warranty_pct" / 100, 2),
  e."contingency_pct", e."warranty_pct", s."lines",
  'system', COALESCE(e."baselined_at", now()), 'system', COALESCE(e."baselined_at", now())
FROM "cost_estimates" e
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(l."quantity" * l."rate"), 0) AS "direct",
         COALESCE(jsonb_agg(jsonb_build_object('phase', l."phase", 'type_id', l."type_id", 'description', l."description", 'quantity', l."quantity", 'unit', l."unit", 'rate', l."rate", 'basis', l."basis") ORDER BY l."id") FILTER (WHERE l."id" IS NOT NULL), '[]'::jsonb) AS "lines"
  FROM "estimate_lines" l WHERE l."estimate_id" = e."id"
) s
WHERE e."status" = 'BASELINE'
  AND e."version" = (SELECT MAX(x."version") FROM "cost_estimates" x WHERE x."project_id" = e."project_id");

UPDATE "cost_estimates" SET "status" = 'DRAFT' WHERE "status" = 'BASELINE';
