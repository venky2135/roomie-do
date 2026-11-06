-- ============================================================
-- RoomieDo Migration: Add weekly_xp to profiles
-- Run this in Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

-- 1. Add weekly_xp column to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS weekly_xp INT DEFAULT 0;

-- 2. Optional: Backfill existing weekly_xp from approved task_logs over the last 7 days
WITH weekly_totals AS (
  SELECT 
    user_id,
    COALESCE(SUM(credits_awarded), 0) AS total_weekly_credits
  FROM task_logs
  WHERE completed_at >= (NOW() - INTERVAL '7 days')
  GROUP BY user_id
)
UPDATE profiles p
SET weekly_xp = wt.total_weekly_credits
FROM weekly_totals wt
WHERE p.id = wt.user_id;
