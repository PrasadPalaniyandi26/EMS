-- CreateTable
CREATE TABLE "project_price_changes" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "old_value" DECIMAL(14,2),
    "new_value" DECIMAL(14,2),
    "reason" VARCHAR(300),
    "changed_by_id" INTEGER,
    "changed_by_name" VARCHAR(100),
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_price_changes_project_id_idx" ON "project_price_changes"("project_id");
