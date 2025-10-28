-- Add fcm_token column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token text;

-- Add comment to explain the column
COMMENT ON COLUMN users.fcm_token IS 'Firebase Cloud Messaging token for push notifications'; 