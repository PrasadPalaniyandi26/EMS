-- Project and product types become global: "client X, project Y, of type Z".
-- Types with the same name (ignoring case) under different clients are merged into the oldest one:
-- their projects/products and categories move to it, then the duplicates are removed.

-- Project types
CREATE TEMP TABLE "pt_map" AS
SELECT "id", MIN("id") OVER (PARTITION BY lower(trim("name"))) AS "keep_id" FROM "project_types";

UPDATE "project_types" SET "is_active" = true
WHERE "id" IN (SELECT m."keep_id" FROM "pt_map" m JOIN "project_types" t ON t."id" = m."id" WHERE t."is_active");

UPDATE "projects" SET "type_id" = m."keep_id" FROM "pt_map" m WHERE "projects"."type_id" = m."id" AND m."id" <> m."keep_id";

INSERT INTO "project_categories" ("type_id", "name", "is_active", "created_by", "created_at")
SELECT m."keep_id", c."name", c."is_active", c."created_by", c."created_at"
FROM "project_categories" c JOIN "pt_map" m ON m."id" = c."type_id" WHERE m."id" <> m."keep_id"
ON CONFLICT ("type_id", "name") DO NOTHING;

DELETE FROM "project_types" WHERE "id" IN (SELECT "id" FROM "pt_map" WHERE "id" <> "keep_id");

-- Product types
CREATE TEMP TABLE "prt_map" AS
SELECT "id", MIN("id") OVER (PARTITION BY lower(trim("name"))) AS "keep_id" FROM "product_types";

UPDATE "product_types" SET "is_active" = true
WHERE "id" IN (SELECT m."keep_id" FROM "prt_map" m JOIN "product_types" t ON t."id" = m."id" WHERE t."is_active");

UPDATE "products" SET "type_id" = m."keep_id" FROM "prt_map" m WHERE "products"."type_id" = m."id" AND m."id" <> m."keep_id";

INSERT INTO "product_categories" ("type_id", "name", "is_active", "created_by", "created_at")
SELECT m."keep_id", c."name", c."is_active", c."created_by", c."created_at"
FROM "product_categories" c JOIN "prt_map" m ON m."id" = c."type_id" WHERE m."id" <> m."keep_id"
ON CONFLICT ("type_id", "name") DO NOTHING;

DELETE FROM "product_types" WHERE "id" IN (SELECT "id" FROM "prt_map" WHERE "id" <> "keep_id");

-- DropForeignKey
ALTER TABLE "product_types" DROP CONSTRAINT "product_types_client_id_fkey";

-- DropForeignKey
ALTER TABLE "project_types" DROP CONSTRAINT "project_types_client_id_fkey";

-- DropIndex
DROP INDEX "product_types_client_id_idx";

-- DropIndex
DROP INDEX "product_types_client_id_name_key";

-- DropIndex
DROP INDEX "project_types_client_id_idx";

-- DropIndex
DROP INDEX "project_types_client_id_name_key";

-- AlterTable
ALTER TABLE "product_types" DROP COLUMN "client_id";

-- AlterTable
ALTER TABLE "project_types" DROP COLUMN "client_id";

-- CreateIndex
CREATE UNIQUE INDEX "product_types_name_key" ON "product_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "project_types_name_key" ON "project_types"("name");
