-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "build_order_id" INTEGER;

-- CreateIndex
CREATE INDEX "transactions_build_order_id_idx" ON "transactions"("build_order_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_build_order_id_fkey" FOREIGN KEY ("build_order_id") REFERENCES "build_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
