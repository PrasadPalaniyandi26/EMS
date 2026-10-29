
-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "type_id" INTEGER;

-- CreateTable
CREATE TABLE "category_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_types_kind_name_key" ON "category_types"("kind", "name");

-- CreateIndex
CREATE INDEX "categories_type_id_idx" ON "categories"("type_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "category_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Starting types, so existing categories are grouped (an admin can rearrange them in the Category dialog)
INSERT INTO "category_types" ("name", "kind") VALUES
  ('Travel & Meals', 'expense'), ('Facilities', 'expense'), ('People', 'expense'), ('Other', 'expense'),
  ('General', 'income');

UPDATE "categories" c SET "type_id" = t."id"
FROM "category_types" t
WHERE t."kind" = c."type" AND t."name" = CASE
  WHEN c."type" = 'income' THEN 'General'
  WHEN c."name" IN ('Food & Dining', 'Transport') THEN 'Travel & Meals'
  WHEN c."name" IN ('Utilities', 'Rent', 'Insurance') THEN 'Facilities'
  WHEN c."name" IN ('Healthcare', 'Education') THEN 'People'
  ELSE 'Other'
END;
