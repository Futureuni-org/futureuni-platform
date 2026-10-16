-- CreateEnum
CREATE TYPE "FormSubmissionStatus" AS ENUM ('COMPLETE');

-- CreateTable
CREATE TABLE "frm_form_submissions" (
    "id" TEXT NOT NULL,
    "formSlug" TEXT NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "formTitle" TEXT NOT NULL,
    "status" "FormSubmissionStatus" NOT NULL DEFAULT 'COMPLETE',
    "answers" JSONB NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "frm_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frm_form_submissions_formSlug_submittedAt_idx" ON "frm_form_submissions"("formSlug", "submittedAt");
