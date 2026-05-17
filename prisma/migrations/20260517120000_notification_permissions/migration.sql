-- Add notification log permissions without touching existing data.
INSERT INTO "permissions" ("id", "key", "module", "description", "created_at", "updated_at")
VALUES
  (
    gen_random_uuid(),
    'notifications.read',
    'notifications',
    'View WhatsApp notification delivery logs',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'notifications.retry',
    'notifications',
    'Retry failed WhatsApp notification deliveries',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Owner', 'Admin', 'Branch Manager')
  AND p."key" IN ('notifications.read', 'notifications.retry')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
INNER JOIN "permissions" p ON p."key" = 'notifications.read'
WHERE r."name" = 'Receptionist'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
