-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "gstin" VARCHAR(15),
ADD COLUMN     "payment_terms_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "company_profile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "legal_name" VARCHAR(150) NOT NULL,
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "address_line" VARCHAR(300),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(20),
    "email" VARCHAR(200),
    "phone" VARCHAR(30),
    "bank_name" VARCHAR(100),
    "bank_account" VARCHAR(30),
    "bank_ifsc" VARCHAR(15),
    "terms" VARCHAR(1000),
    "signatory" VARCHAR(100),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_seq" INTEGER NOT NULL,

    CONSTRAINT "invoice_counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_pos" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "po_number" VARCHAR(60) NOT NULL,
    "po_date" DATE NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "valid_until" DATE,
    "project_id" INTEGER,
    "build_order_id" INTEGER,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "file_path" VARCHAR(255),
    "note" VARCHAR(500),
    "created_by" INTEGER,
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_pos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(16),
    "client_id" INTEGER NOT NULL,
    "po_id" INTEGER,
    "project_id" INTEGER,
    "build_order_id" INTEGER,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "supply_type" VARCHAR(5),
    "place_of_supply" VARCHAR(100),
    "taxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(500),
    "seller" JSONB,
    "buyer" JSONB,
    "issued_at" TIMESTAMP(3),
    "issued_by_name" VARCHAR(100),
    "cancel_reason" VARCHAR(300),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_name" VARCHAR(100),
    "created_by" INTEGER,
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "hsn" VARCHAR(10),
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(12) NOT NULL DEFAULT 'nos',
    "rate" DECIMAL(14,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "taxable" DECIMAL(14,2) NOT NULL,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" VARCHAR(20),
    "reference" VARCHAR(100),
    "transaction_id" INTEGER,
    "created_by_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_pos_status_idx" ON "client_pos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_pos_client_id_po_number_key" ON "client_pos"("client_id", "po_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_payments_transaction_id_key" ON "invoice_payments"("transaction_id");

-- CreateIndex
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "client_pos" ADD CONSTRAINT "client_pos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_pos" ADD CONSTRAINT "client_pos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_pos" ADD CONSTRAINT "client_pos_build_order_id_fkey" FOREIGN KEY ("build_order_id") REFERENCES "build_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "client_pos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_build_order_id_fkey" FOREIGN KEY ("build_order_id") REFERENCES "build_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The first invoice number is 10001
INSERT INTO "invoice_counter" ("id", "last_seq") VALUES (1, 10000);
