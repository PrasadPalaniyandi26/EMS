-- AlterTable
ALTER TABLE "recurring_transactions" ADD COLUMN     "approved_by_id" INTEGER,
ADD COLUMN     "approved_by_role" VARCHAR(50),
ADD COLUMN     "rejected_by_id" INTEGER,
ADD COLUMN     "rejected_by_role" VARCHAR(50),
ADD COLUMN     "sent_back_by_id" INTEGER,
ADD COLUMN     "sent_back_by_role" VARCHAR(50);
