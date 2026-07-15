CREATE TABLE "TtsClientAuthRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TtsClientAuthRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TtsClientAuthRequest_clientId_key" ON "TtsClientAuthRequest"("clientId");
CREATE INDEX "TtsClientAuthRequest_machineId_createdAt_idx" ON "TtsClientAuthRequest"("machineId", "createdAt" DESC);
