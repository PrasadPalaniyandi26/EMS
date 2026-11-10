-- A BOM is one flat list of parts. Parts carry a group label (for a subtotal) and a sequence number (the step of the build they are needed for)
-- in place of sub-assemblies. Work (operations) carries the same sequence.
ALTER TABLE "bom_lines" ADD COLUMN "group_name" VARCHAR(60), ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bom_operations" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;

-- Sub-assembly lines that exist today become the parts and the work inside them, grouped under the sub-assembly's name.
-- The expanded parts take the earlier sequence and the BOM's own parts move later, so the timing stays as it was:
-- the sub-assembly is built first, then the rest. A line is replaced by the parts of the BOM it pointed at (a product's latest BOM for a job's standard product).
DO $$
DECLARE
  l RECORD;
  src_id INTEGER;
  gname TEXT;
  shift INTEGER;
  guard INTEGER := 0;
BEGIN
  LOOP
    SELECT * INTO l FROM bom_lines WHERE item_id IS NULL AND (sub_bom_id IS NOT NULL OR sub_product_id IS NOT NULL) ORDER BY id LIMIT 1;
    EXIT WHEN NOT FOUND;
    guard := guard + 1;
    IF guard > 100 THEN RAISE EXCEPTION 'Sub-assemblies are nested too deeply to flatten.'; END IF;

    IF l.sub_bom_id IS NOT NULL THEN
      src_id := l.sub_bom_id;
    ELSE
      SELECT id INTO src_id FROM boms WHERE product_id = l.sub_product_id ORDER BY version DESC LIMIT 1;
    END IF;

    -- Stop rather than drop the line: its cost would silently disappear from the BOM
    IF src_id IS NULL OR src_id = l.bom_id THEN
      RAISE EXCEPTION 'bom_lines % points at no BOM that can be expanded. Give that sub-assembly a BOM or remove the line, then run the migration again.', l.id;
    END IF;

    SELECT COALESCE(p.name, 'Sub-assembly') INTO gname FROM boms b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = src_id;

    -- Push the BOM's own work later by the highest step the sub-assembly uses, so no two steps merge
    SELECT GREATEST(
      COALESCE((SELECT MAX(sequence) FROM bom_lines WHERE bom_id = src_id), 0),
      COALESCE((SELECT MAX(sequence) FROM bom_operations WHERE bom_id = src_id), 0)) INTO shift;
    UPDATE bom_lines SET sequence = sequence + shift WHERE bom_id = l.bom_id AND id <> l.id;
    UPDATE bom_operations SET sequence = sequence + shift WHERE bom_id = l.bom_id;

    INSERT INTO bom_lines (bom_id, item_id, sub_bom_id, sub_product_id, sub_standard_id, sub_unit_cost, source_item_id, group_name, sequence, quantity, scrap_pct)
    SELECT l.bom_id, s.item_id, s.sub_bom_id, s.sub_product_id, s.sub_standard_id, s.sub_unit_cost,
           CASE WHEN (SELECT build_order_id FROM boms WHERE id = l.bom_id) IS NOT NULL THEN s.item_id END,
           COALESCE(s.group_name, gname), s.sequence,
           ROUND(s.quantity * l.quantity, 3),
           LEAST(100, ROUND(((1 + s.scrap_pct / 100) * (1 + l.scrap_pct / 100) - 1) * 100, 2))
    FROM bom_lines s WHERE s.bom_id = src_id;

    INSERT INTO bom_operations (bom_id, name, hours, rate_card_id, outsourced_cost, fixed_cost, operation_type_id, sequence)
    SELECT l.bom_id, o.name, ROUND(o.hours * l.quantity, 2), o.rate_card_id, ROUND(o.outsourced_cost * l.quantity, 2), ROUND(o.fixed_cost * l.quantity, 2), o.operation_type_id, o.sequence
    FROM bom_operations o WHERE o.bom_id = src_id;

    DELETE FROM bom_lines WHERE id = l.id;
  END LOOP;
END $$;
