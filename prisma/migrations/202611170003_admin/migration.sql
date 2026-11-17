CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER';
CREATE TABLE "media_assets" (
 "id" UUID PRIMARY KEY,
 "data" BYTEA NOT NULL,
 "mime_type" TEXT NOT NULL,
 "file_size" INTEGER NOT NULL,
 "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT media_values CHECK (file_size > 0 AND file_size <= 2097152 AND octet_length(data) = file_size AND mime_type IN ('image/jpeg','image/png','image/webp'))
);
