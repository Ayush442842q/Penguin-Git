ALTER TABLE tokens ADD COLUMN expires_at TIMESTAMPTZ;

-- For existing tokens, set expires_at to 30 days from their creation date
UPDATE tokens SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL;

-- Make it NOT NULL for future tokens
ALTER TABLE tokens ALTER COLUMN expires_at SET NOT NULL;
