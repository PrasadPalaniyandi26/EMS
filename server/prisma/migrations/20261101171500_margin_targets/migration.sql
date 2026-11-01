-- AlterTable
ALTER TABLE "product_prices" ADD COLUMN     "min_margin_pct" DECIMAL(5,2),
ADD COLUMN     "target_margin_pct" DECIMAL(5,2),
ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "min_margin_pct" DECIMAL(5,2);
