-- CreateTable
CREATE TABLE "flags" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flags_applicationId_name_key" ON "flags"("applicationId", "name");

-- AddForeignKey
ALTER TABLE "flags" ADD CONSTRAINT "flags_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
