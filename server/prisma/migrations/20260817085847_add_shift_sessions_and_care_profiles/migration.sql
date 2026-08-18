-- CreateTable
CREATE TABLE "ShiftSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftDate" DATETIME NOT NULL,
    "checkedInAt" DATETIME,
    "checkedOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "checkedInById" TEXT,
    "checkedOutById" TEXT,
    CONSTRAINT "ShiftSession_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftSession_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CareProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "medicalInfo" TEXT NOT NULL,
    "preferences" TEXT NOT NULL,
    "equipmentSettings" TEXT NOT NULL,
    "emergencyContacts" TEXT NOT NULL,
    "medicationSchedule" TEXT,
    "internalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "CareProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftSession_shiftDate_key" ON "ShiftSession"("shiftDate");
