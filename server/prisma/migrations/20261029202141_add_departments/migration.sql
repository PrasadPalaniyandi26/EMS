-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- Seed the two fixed lists the user and budget forms used, plus any department already on a user or budget
INSERT INTO "departments" ("name")
SELECT d."name" FROM (VALUES
  ('Engineering'), ('Finance'), ('Operations'), ('Human Resource'), ('Logistics'), ('Sales'),
  ('Product Development'), ('Marketing Operations'), ('IT Infrastructure'), ('Human Resources'), ('Legal'), ('Research & Development')
) AS d("name")
UNION
SELECT DISTINCT "department" FROM "users" WHERE "department" IS NOT NULL AND "department" <> ''
UNION
SELECT DISTINCT "department" FROM "budgets" WHERE "department" IS NOT NULL AND "department" <> ''
ON CONFLICT ("name") DO NOTHING;
