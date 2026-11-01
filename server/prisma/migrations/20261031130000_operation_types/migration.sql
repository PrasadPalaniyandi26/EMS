-- CreateTable
CREATE TABLE "operation_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_outsourced" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "operation_types_pkey" PRIMARY KEY ("id")
);

-- Starting list
INSERT INTO "operation_types" ("name", "is_outsourced", "sort_order") VALUES
  ('Final assembly', false, 1),
  ('Testing and inspection', false, 2),
  ('Packing and dispatch', false, 3),
  ('Outsourced work', true, 4);

-- AlterTable
ALTER TABLE "bom_operations" ADD COLUMN "operation_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_operation_type_id_fkey" FOREIGN KEY ("operation_type_id") REFERENCES "operation_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
