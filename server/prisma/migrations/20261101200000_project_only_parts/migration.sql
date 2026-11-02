-- A part can belong to one project only (a one-off part on a job BOM)
ALTER TABLE "items" ADD COLUMN "project_id" INTEGER;
CREATE INDEX "items_project_id_idx" ON "items"("project_id");
