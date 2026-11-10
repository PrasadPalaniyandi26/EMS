-- A BOM belongs to exactly one of a product, a project or a build order
ALTER TABLE "boms" DROP CONSTRAINT "boms_one_owner_check";
ALTER TABLE "boms" ADD CONSTRAINT "boms_one_owner_check" CHECK (
  (("product_id" IS NOT NULL)::int + ("project_id" IS NOT NULL)::int + ("build_order_id" IS NOT NULL)::int) = 1
);
