CREATE TYPE "MediaStorageProvider" AS ENUM ('POSTGRESQL', 'CLOUDINARY');
ALTER TABLE media_assets ADD COLUMN storage_provider "MediaStorageProvider" NOT NULL DEFAULT 'POSTGRESQL',
 ADD COLUMN cloudinary_public_id TEXT, ADD COLUMN cloudinary_secure_url TEXT,
 ALTER COLUMN data DROP NOT NULL, DROP CONSTRAINT media_values;
CREATE UNIQUE INDEX media_assets_cloudinary_public_id_key ON media_assets(cloudinary_public_id);
ALTER TABLE media_assets ADD CONSTRAINT media_values CHECK (
 file_size > 0 AND file_size <= 2097152 AND mime_type IN ('image/jpeg','image/png','image/webp') AND
 ((storage_provider = 'POSTGRESQL' AND data IS NOT NULL AND octet_length(data) = file_size AND cloudinary_public_id IS NULL AND cloudinary_secure_url IS NULL)
 OR (storage_provider = 'CLOUDINARY' AND data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_secure_url IS NOT NULL AND cloudinary_secure_url LIKE 'https://%')));

CREATE TYPE "PaymentProvider" AS ENUM ('SSLCOMMERZ');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATING','PENDING','PAID','FAILED','CANCELLED','EXPIRED','REVIEW_REQUIRED');
CREATE TABLE payments (
 id UUID PRIMARY KEY, appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 provider "PaymentProvider" NOT NULL DEFAULT 'SSLCOMMERZ',
 merchant_transaction_id VARCHAR(30) NOT NULL UNIQUE, amount DECIMAL(12,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'BDT',
 status "PaymentStatus" NOT NULL DEFAULT 'INITIATING', session_key TEXT, checkout_url TEXT,
 validation_id VARCHAR(50) UNIQUE, bank_transaction_id VARCHAR(80) UNIQUE, failure_reason TEXT,
 paid_at TIMESTAMPTZ, applied BOOLEAN NOT NULL DEFAULT false, gateway_incidents JSONB NOT NULL DEFAULT '[]', last_reconciled_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL,
 CONSTRAINT payment_values CHECK (amount >= 10 AND amount <= 500000 AND currency = 'BDT'),
 CONSTRAINT payment_paid CHECK (status <> 'PAID' OR applied),
 CONSTRAINT payment_applied CHECK (NOT applied OR (status IN ('PAID','REVIEW_REQUIRED') AND paid_at IS NOT NULL AND validation_id IS NOT NULL AND bank_transaction_id IS NOT NULL))
);
CREATE INDEX payments_appointment_id_created_at_idx ON payments(appointment_id,created_at);
CREATE INDEX payments_status_created_at_idx ON payments(status,created_at);
CREATE UNIQUE INDEX payments_one_active ON payments(appointment_id) WHERE status IN ('INITIATING','PENDING');
CREATE UNIQUE INDEX payments_one_applied ON payments(appointment_id) WHERE applied;
CREATE FUNCTION preserve_payment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.appointment_id <> OLD.appointment_id OR NEW.amount <> OLD.amount OR NEW.currency <> OLD.currency
 OR NEW.provider <> OLD.provider OR NEW.merchant_transaction_id <> OLD.merchant_transaction_id THEN
 RAISE EXCEPTION 'Payment snapshot is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_snapshot BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION preserve_payment_snapshot();
