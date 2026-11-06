-- ============================================================
-- RoomieDo Migration: Sunday Reset System & Notification Queue
-- Run this in Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

-- 1. Weekly Resets Tracking Table (Ensures Sunday calculation is idempotent)
CREATE TABLE IF NOT EXISTS weekly_resets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  week_key       TEXT NOT NULL, -- e.g. '2026-W45'
  winner_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  loser_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  winner_credits INT DEFAULT 0,
  loser_credits  INT DEFAULT 0,
  details        JSONB DEFAULT '{}'::jsonb,
  announced_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(house_id, week_key)
);

CREATE INDEX IF NOT EXISTS idx_weekly_resets_house_week ON weekly_resets(house_id, week_key);
ALTER TABLE weekly_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_resets_read" ON weekly_resets
  FOR SELECT USING (TRUE);

-- 2. Persistent Notification Queue (Survives Render auto-sleeps & server restarts)
CREATE TABLE IF NOT EXISTS notification_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       UUID REFERENCES houses(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL for house-wide broadcast
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  data           JSONB DEFAULT '{}'::jsonb,
  status         TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  scheduled_for  TIMESTAMPTZ DEFAULT NOW(),
  sent_at        TIMESTAMPTZ,
  attempts       INT DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_pending 
  ON notification_queue(status, scheduled_for);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_queue_read_own" ON notification_queue
  FOR SELECT USING (
    user_id = auth.uid() 
    OR (house_id IS NOT NULL AND house_id IN (SELECT house_id FROM profiles WHERE id = auth.uid()))
  );

