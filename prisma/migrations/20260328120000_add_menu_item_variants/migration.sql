ALTER TABLE "MenuItem"
ADD COLUMN "variantGroupId" TEXT,
ADD COLUMN "variantGroupTitle" TEXT,
ADD COLUMN "variantLabel" TEXT;

CREATE INDEX "MenuItem_variantGroupId_idx" ON "MenuItem"("variantGroupId");
