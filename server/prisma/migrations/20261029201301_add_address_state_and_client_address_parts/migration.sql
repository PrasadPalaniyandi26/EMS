-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "address_line2" VARCHAR(200),
ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "postal_code" VARCHAR(20),
ADD COLUMN     "state" VARCHAR(100),
ADD COLUMN     "street" VARCHAR(200);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "state" VARCHAR(100);
