-- CreateTable
CREATE TABLE "project_categories" (
    "id" SERIAL NOT NULL,
    "type_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" SERIAL NOT NULL,
    "type_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_categories_type_id_idx" ON "project_categories"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_categories_type_id_name_key" ON "project_categories"("type_id", "name");

-- CreateIndex
CREATE INDEX "product_categories_type_id_idx" ON "product_categories"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_type_id_name_key" ON "product_categories"("type_id", "name");

-- AddForeignKey
ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "project_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "product_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the former fixed category lists for every existing type, so current data keeps a valid choice
INSERT INTO "project_categories" ("type_id", "name")
SELECT t."id", c."name" FROM "project_types" t
CROSS JOIN (VALUES ('Enterprise Level'), ('Internal Operations'), ('R&D Initiatives'), ('Client Delivery'), ('Infrastructure')) AS c("name");

INSERT INTO "product_categories" ("type_id", "name")
SELECT t."id", c."name" FROM "product_types" t
CROSS JOIN (VALUES ('Mechanical'), ('Electronics'), ('Software'), ('Hybrid')) AS c("name");
