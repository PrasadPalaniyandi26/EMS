-- Milestones are a simple tracker (name, planned date, done date); the earned value weights are gone.
ALTER TABLE "project_milestones" DROP COLUMN "weight_pct";
