-- The estimated budget on projects and products is replaced by budget planning and the approved estimate baseline
ALTER TABLE "projects" DROP COLUMN "budget";
ALTER TABLE "products" DROP COLUMN "budget";
