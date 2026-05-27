-- N°80 Fase B1 · License.billingMode for activate → invoice hook
ALTER TABLE "License" ADD COLUMN "billingMode" TEXT NOT NULL DEFAULT 'prepaid';
