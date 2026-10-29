-- CreateTable
CREATE TABLE "client_sectors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_sectors_name_key" ON "client_sectors"("name");

-- Seed the former fixed list, plus any sector already typed onto a client
INSERT INTO "client_sectors" ("name")
SELECT s."name" FROM (VALUES ('Retail'), ('Manufacturing'), ('Technology'), ('Healthcare'), ('Finance'), ('Consulting'), ('Education'), ('Logistics'), ('Media'), ('Construction'), ('Other')) AS s("name")
UNION
SELECT DISTINCT "business_type" FROM "clients" WHERE "business_type" IS NOT NULL AND "business_type" <> ''
ON CONFLICT ("name") DO NOTHING;
