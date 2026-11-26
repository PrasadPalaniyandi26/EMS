-- Who submitted a budget plan is kept as a user id, so changing a username does not let them approve it
ALTER TABLE "budget_plans" ADD COLUMN "submitted_by_id" INTEGER;

-- Plans already waiting: take the submitter from the audit log
UPDATE "budget_plans" p SET "submitted_by_id" = (
  SELECT a."changed_by" FROM "audit_log" a
  WHERE a."table_name" = 'budget_plans' AND a."record_id" = p."id" AND a."action" = 'SUBMIT'
  ORDER BY a."changed_at" DESC, a."id" DESC LIMIT 1
) WHERE p."status" = 'SUBMITTED';
