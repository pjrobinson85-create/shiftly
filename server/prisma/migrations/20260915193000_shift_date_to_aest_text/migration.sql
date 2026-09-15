-- M5: ShiftSession.shiftDate / ShiftNote.shiftDate
-- DATETIME epoch-millis (Prisma) -> TEXT "YYYY-MM-DD" in AEST (UTC+10, no DST).
-- One shift-day = one row, unambiguously, regardless of host/DB timezone.
--
-- Values in the live DB are epoch milliseconds (e.g. 1789394400000), stored
-- as INTEGER by Prisma (or digit-only TEXT if written as a string).
-- datetime(<s>, 'unixepoch') renders in UTC; adding 10h yields AEST.
-- Legacy ISO-8601 text rows (e.g. '2026-09-14T14:00:00.000Z') take the ELSE
-- branch: datetime() parses them as UTC instants and applies the same +10h.

-- ---- ShiftSession ----

CREATE TABLE "new_ShiftSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftDate" TEXT NOT NULL,
    "checkedInAt" DATETIME,
    "checkedOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "checkedInById" TEXT,
    "checkedOutById" TEXT,
    CONSTRAINT "ShiftSession_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftSession_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ShiftSession" (
  "id", "shiftDate", "checkedInAt", "checkedOutAt", "createdAt", "updatedAt",
  "checkedInById", "checkedOutById"
)
SELECT
  "id",
  CASE
    WHEN "shiftDate" GLOB '[0-9]*' AND "shiftDate" NOT GLOB '*T*' THEN
      substr(datetime(CAST("shiftDate" AS INTEGER) / 1000, 'unixepoch', '+10 hours'), 1, 10)
    ELSE
      substr(datetime("shiftDate", '+10 hours'), 1, 10)
  END,
  "checkedInAt", "checkedOutAt", "createdAt", "updatedAt",
  "checkedInById", "checkedOutById"
FROM "ShiftSession";

DROP TABLE "ShiftSession";

ALTER TABLE "new_ShiftSession" RENAME TO "ShiftSession";

-- Recreate the unique index (dropped with the old table; matches schema.prisma @unique)
CREATE UNIQUE INDEX "ShiftSession_shiftDate_key" ON "ShiftSession"("shiftDate");

-- ---- ShiftNote (same column, no unique) ----

CREATE TABLE "new_ShiftNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "photos" JSONB NOT NULL,
    "shiftDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ShiftNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_ShiftNote" (
  "id", "content", "photos", "shiftDate", "createdAt", "userId"
)
SELECT
  "id",
  "content",
  "photos",
  CASE
    WHEN "shiftDate" GLOB '[0-9]*' AND "shiftDate" NOT GLOB '*T*' THEN
      substr(datetime(CAST("shiftDate" AS INTEGER) / 1000, 'unixepoch', '+10 hours'), 1, 10)
    ELSE
      substr(datetime("shiftDate", '+10 hours'), 1, 10)
  END,
  "createdAt",
  "userId"
FROM "ShiftNote";

DROP TABLE "ShiftNote";

ALTER TABLE "new_ShiftNote" RENAME TO "ShiftNote";
