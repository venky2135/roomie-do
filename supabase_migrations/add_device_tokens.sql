-- ============================================================
-- RoomieDo Migration: Add user_device_tokens table
-- Run this in Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS user_device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  device_type TEXT DEFAULT 'android', -- 'android' | 'ios'
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup of tokens by user
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id ON user_device_tokens(user_id);

-- Enable Row Level Security
ALTER TABLE user_device_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can select, insert, update, delete their own device tokens
CREATE POLICY "user_device_tokens_manage_own" ON user_device_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

