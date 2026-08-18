-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "dueDate" DATETIME NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "completedById" TEXT,
    "assignedToId" TEXT,
    "recurringTaskId" TEXT,
    CONSTRAINT "TaskInstance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "RecurringTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaskInstance" ("completed", "completedAt", "completedById", "createdAt", "createdById", "description", "dueDate", "id", "isRecurring", "priority", "recurringTaskId", "title", "updatedAt") SELECT "completed", "completedAt", "completedById", "createdAt", "createdById", "description", "dueDate", "id", "isRecurring", "priority", "recurringTaskId", "title", "updatedAt" FROM "TaskInstance";
DROP TABLE "TaskInstance";
ALTER TABLE "new_TaskInstance" RENAME TO "TaskInstance";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
