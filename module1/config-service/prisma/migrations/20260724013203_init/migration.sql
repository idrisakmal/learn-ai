-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "comments" VARCHAR(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "comments" VARCHAR(1024),
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_name_key" ON "applications"("name");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_applicationId_name_key" ON "configurations"("applicationId", "name");

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
