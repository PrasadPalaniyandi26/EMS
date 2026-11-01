-- AlterTable: project types that build a physical product get a job BOM
ALTER TABLE "project_types" ADD COLUMN "has_job_bom" BOOLEAN NOT NULL DEFAULT false;
UPDATE "project_types" SET "has_job_bom" = true WHERE "code" = 'J100';

-- AlterTable: a BOM belongs to a product or to a project
ALTER TABLE "boms" ALTER COLUMN "product_id" DROP NOT NULL;
ALTER TABLE "boms" ADD COLUMN "project_id" INTEGER;
ALTER TABLE "boms" ADD CONSTRAINT "boms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "boms_project_id_version_key" ON "boms"("project_id", "version");
CREATE INDEX "boms_project_id_idx" ON "boms"("project_id");
ALTER TABLE "boms" ADD CONSTRAINT "boms_one_owner_check" CHECK (("product_id" IS NOT NULL AND "project_id" IS NULL) OR ("product_id" IS NULL AND "project_id" IS NOT NULL));

-- AlterTable: standard product used as a sub-assembly in a job BOM, with the approved cost at the time
ALTER TABLE "bom_lines" ADD COLUMN "sub_product_id" INTEGER, ADD COLUMN "sub_standard_id" INTEGER, ADD COLUMN "sub_unit_cost" DECIMAL(12,2);
