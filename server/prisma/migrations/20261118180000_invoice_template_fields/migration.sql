-- Optional header fields of the tax invoice template: consignee, delivery note, reference, despatch, destination, terms
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "consignee" VARCHAR(500),
ADD COLUMN     "delivery_note" VARCHAR(60),
ADD COLUMN     "delivery_note_date" DATE,
ADD COLUMN     "despatch_doc_no" VARCHAR(60),
ADD COLUMN     "despatch_through" VARCHAR(100),
ADD COLUMN     "destination" VARCHAR(100),
ADD COLUMN     "mode_of_payment" VARCHAR(100),
ADD COLUMN     "reference_date" DATE,
ADD COLUMN     "reference_no" VARCHAR(60),
ADD COLUMN     "terms_of_delivery" VARCHAR(300);

