-- The server reads All, Self and Department. 'Own' and 'Own Records' meant Self but were read as Department.
-- 'Global' was also read as Department; it stays that way so nobody sees more than before, until an Admin picks Global again.
UPDATE "user_permissions" SET "data_scope" = 'Self' WHERE "data_scope" IN ('Own', 'Own Records');
UPDATE "user_permissions" SET "data_scope" = 'Department' WHERE "data_scope" NOT IN ('All', 'Self', 'Department');
