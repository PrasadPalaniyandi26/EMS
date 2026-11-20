-- What the tax invoice template needs: bank branch, bank address, account name, closing line and the logo
-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "bank_account_name" VARCHAR(150),
ADD COLUMN     "bank_address" VARCHAR(300),
ADD COLUMN     "bank_branch" VARCHAR(100),
ADD COLUMN     "footer_note" VARCHAR(300),
ADD COLUMN     "logo" TEXT;

