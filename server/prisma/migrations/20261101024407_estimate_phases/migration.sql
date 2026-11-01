-- CreateTable
CREATE TABLE "estimate_phases" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_phases_pkey" PRIMARY KEY ("id")
);

-- Starting phases, so existing estimate lines keep a phase that is in the list
INSERT INTO "estimate_phases" ("name", "sort_order") VALUES
    ('Design', 1),
    ('Procurement', 2),
    ('Fabrication', 3),
    ('Installation', 4),
    ('Commissioning', 5),
    ('Support', 6);
