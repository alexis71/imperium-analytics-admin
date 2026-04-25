-- CreateTable
CREATE TABLE "PasswordAccessLog" (
    "id" TEXT NOT NULL,
    "accessedByUserId" TEXT NOT NULL,
    "accessedByUserName" TEXT NOT NULL,
    "accessedByRole" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "tenantId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordAccessLog_accessedByUserId_idx" ON "PasswordAccessLog"("accessedByUserId");

-- CreateIndex
CREATE INDEX "PasswordAccessLog_targetUserId_idx" ON "PasswordAccessLog"("targetUserId");

-- CreateIndex
CREATE INDEX "PasswordAccessLog_createdAt_idx" ON "PasswordAccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "PasswordAccessLog_tenantId_idx" ON "PasswordAccessLog"("tenantId");
