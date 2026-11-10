-- BOMs are flat lists of parts now; sub-assembly lines were expanded into parts by the previous migration.
ALTER TABLE "bom_lines" DROP COLUMN "sub_bom_id", DROP COLUMN "sub_product_id", DROP COLUMN "sub_standard_id", DROP COLUMN "sub_unit_cost";
ALTER TABLE "bom_lines" ALTER COLUMN "item_id" SET NOT NULL;
