-- One active OTP row per email (upsert on request). Migrates legacy multi-row table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'otp_codes'
      AND column_name = 'id'
  ) THEN
    CREATE TABLE otp_codes_next (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      request_count INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO otp_codes_next (
      email, code_hash, expires_at, used_at, window_start, request_count, updated_at
    )
    SELECT DISTINCT ON (LOWER(TRIM(email)))
      LOWER(TRIM(email)),
      code_hash,
      expires_at,
      used_at,
      COALESCE(created_at, NOW()),
      1,
      COALESCE(GREATEST(used_at, created_at), NOW())
    FROM otp_codes
    ORDER BY LOWER(TRIM(email)), created_at DESC;

    DROP INDEX IF EXISTS idx_otp_codes_email_created;
    DROP TABLE otp_codes;
    ALTER TABLE otp_codes_next RENAME TO otp_codes;
  END IF;
END $$;
