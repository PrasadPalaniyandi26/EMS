-- AlterTable
ALTER TABLE "boms" ADD COLUMN "build_order_id" INTEGER;

-- AlterTable
ALTER TABLE "bom_lines" ADD COLUMN "source_item_id" INTEGER;

-- CreateTable
CREATE TABLE "build_orders" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "product_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "customer_po" VARCHAR(60),
    "status" VARCHAR(10) NOT NULL DEFAULT 'COMMITTED',
    "start_date" DATE NOT NULL,
    "delivery_date" DATE NOT NULL,
    "delivered_on" DATE,
    "unit_price" DECIMAL(14,2),
    "notes" VARCHAR(500),
    "source_bom_id" INTEGER,
    "source_bom_version" INTEGER,
    "source_standard_cost" DECIMAL(14,2),
    "imported_at" TIMESTAMP(3),
    "unit_cost" DECIMAL(14,2),
    "costed_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(300),
    "created_by" INTEGER,
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "build_orders_code_key" ON "build_orders"("code");

-- CreateIndex
CREATE INDEX "build_orders_product_id_start_date_idx" ON "build_orders"("product_id", "start_date");

-- CreateIndex
CREATE INDEX "build_orders_status_idx" ON "build_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "boms_build_order_id_version_key" ON "boms"("build_order_id", "version");

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_build_order_id_fkey" FOREIGN KEY ("build_order_id") REFERENCES "build_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_orders" ADD CONSTRAINT "build_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_orders" ADD CONSTRAINT "build_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
