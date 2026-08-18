-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShoppingListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "quantity" TEXT NOT NULL DEFAULT '1',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "listId" TEXT NOT NULL,
    "addedById" TEXT,
    CONSTRAINT "ShoppingListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShoppingListItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ShoppingListItem" ("addedById", "completed", "createdAt", "id", "listId", "name", "quantity", "updatedAt") SELECT "addedById", "completed", "createdAt", "id", "listId", "name", "quantity", "updatedAt" FROM "ShoppingListItem";
DROP TABLE "ShoppingListItem";
ALTER TABLE "new_ShoppingListItem" RENAME TO "ShoppingListItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
