-- Two roles for the budget and costing work: Configurator keeps the setup data (parts, BOMs, operations),
-- Operations prepares the plans, estimates and build orders. Finance still approves the money.
INSERT INTO "roles" ("role_id", "role_name", "description", "access_level")
SELECT m.next_id, 'CONFIGURATOR', 'Maintains parts, BOMs, operations and costing setup', 'Standard'
FROM (SELECT COALESCE(MAX("role_id"), 0) + 1 AS next_id FROM "roles") m
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "role_name" = 'CONFIGURATOR');

INSERT INTO "roles" ("role_id", "role_name", "description", "access_level")
SELECT m.next_id, 'OPERATIONS', 'Prepares budget plans, project estimates, build plans and build orders', 'Standard'
FROM (SELECT COALESCE(MAX("role_id"), 0) + 1 AS next_id FROM "roles") m
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "role_name" = 'OPERATIONS');

SELECT setval(pg_get_serial_sequence('"roles"', 'role_id'), (SELECT MAX("role_id") FROM "roles"));
