-- AlterTable
ALTER TABLE "boms" ADD COLUMN     "change_note" VARCHAR(300),
ADD COLUMN     "effective_from" DATE;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "alternate_group_id" INTEGER,
ADD COLUMN     "is_default_alternate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replaced_by_id" INTEGER,
ADD COLUMN     "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "status_from" DATE,
ADD COLUMN     "status_reason" VARCHAR(300);

-- CreateTable
CREATE TABLE "part_replacements" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "successor_id" INTEGER,
    "effective_from" DATE NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'SCHEDULED',
    "boms_changed" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" INTEGER,
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "part_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "part_replacements_item_id_idx" ON "part_replacements"("item_id");

-- CreateIndex
CREATE INDEX "part_replacements_status_effective_from_idx" ON "part_replacements"("status", "effective_from");

-- CreateIndex
CREATE INDEX "items_alternate_group_id_idx" ON "items"("alternate_group_id");

-- AddForeignKey
ALTER TABLE "part_replacements" ADD CONSTRAINT "part_replacements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_replacements" ADD CONSTRAINT "part_replacements_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Parts archived before this change are retired parts
UPDATE "items" SET "status" = 'RETIRED' WHERE "is_active" = false;
