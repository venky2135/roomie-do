-- ============================================================
-- RoomieDo — Supabase SQL Schema
-- Run this in Supabase → SQL Editor → New Query
-- ============================================================

-- ── Houses ──────────────────────────────────────────────────
CREATE TABLE houses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Profiles ─────────────────────────────────────────────────
CREATE TABLE profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  house_id       UUID REFERENCES houses(id) ON DELETE SET NULL,
  username       TEXT NOT NULL,
  phone          TEXT,
  avatar_url     TEXT,
  total_credits  INT DEFAULT 0,
  level          INT DEFAULT 1,
  xp             INT DEFAULT 0,
  streak_days    INT DEFAULT 0,
  is_admin       BOOLEAN DEFAULT FALSE,
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Task Templates ───────────────────────────────────────────
CREATE TABLE task_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  icon           TEXT DEFAULT '🧹',
  category       TEXT DEFAULT 'General',
  base_credits   INT DEFAULT 20,
  photo_required BOOLEAN DEFAULT FALSE,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Task Logs ────────────────────────────────────────────────
CREATE TABLE task_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id         UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  credits_awarded INT DEFAULT 0,
  photo_url       TEXT,
  notes           TEXT,
  completed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Badges ───────────────────────────────────────────────────
CREATE TABLE badges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  icon            TEXT,
  description     TEXT,
  condition_type  TEXT NOT NULL, -- 'tasks_count' | 'streak_days' | 'total_credits' | 'level'
  condition_value INT NOT NULL
);

-- ── User Badges ──────────────────────────────────────────────
CREATE TABLE user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- ── Reactions ────────────────────────────────────────────────
CREATE TABLE reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_log_id UUID NOT NULL REFERENCES task_logs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_log_id, user_id, emoji)
);

-- ── Nudges ───────────────────────────────────────────────────
CREATE TABLE nudges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sent_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Marketplace Tasks (Chore Bounties) ────────────────────────
CREATE TABLE marketplace_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  bounty_xp    INT DEFAULT 25,
  claimed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at   TIMESTAMPTZ,
  status       TEXT DEFAULT 'open', -- 'open' | 'claimed' | 'completed'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Task Anonymous Feedbacks ──────────────────────────────────
CREATE TABLE task_feedbacks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_log_id  UUID NOT NULL REFERENCES task_logs(id) ON DELETE CASCADE,
  feedback     TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE houses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudges       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTION: Get current user's house_id (prevents RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_house_id()
RETURNS UUID AS $$
  SELECT house_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles: user can read own profile + housemates
CREATE POLICY "profiles_read" ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (house_id IS NOT NULL AND house_id = get_my_house_id())
  );

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Houses: users can read their own house
CREATE POLICY "houses_read" ON houses FOR SELECT
  USING (id = get_my_house_id());

CREATE POLICY "houses_insert" ON houses FOR INSERT
  WITH CHECK (admin_id = auth.uid());

CREATE POLICY "houses_update_admin" ON houses FOR UPDATE
  USING (admin_id = auth.uid());

-- Task templates: house members can read; backend (service role) manages writes
CREATE POLICY "task_templates_read" ON task_templates FOR SELECT
  USING (house_id = get_my_house_id());

-- Task logs: house members can read
CREATE POLICY "task_logs_read" ON task_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR user_id IN (SELECT id FROM profiles WHERE house_id = get_my_house_id())
  );

-- Badges: public read
CREATE POLICY "badges_read" ON badges FOR SELECT USING (TRUE);

-- User badges: user can read own + housemates
CREATE POLICY "user_badges_read" ON user_badges FOR SELECT
  USING (user_id IN (SELECT id FROM profiles WHERE house_id = (SELECT house_id FROM profiles WHERE id = auth.uid())));

-- Reactions: house members can read + insert
CREATE POLICY "reactions_read" ON reactions FOR SELECT
  USING (user_id IN (SELECT id FROM profiles WHERE house_id = (SELECT house_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "reactions_insert" ON reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Nudges
CREATE POLICY "nudges_read" ON nudges FOR SELECT
  USING (to_user_id = auth.uid() OR from_user_id = auth.uid());

-- ============================================================
-- REALTIME: Enable for activity feed
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE task_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE nudges;

-- ============================================================
-- HELPER FUNCTION: Award bonus credits (used by weekly cron)
-- ============================================================
CREATE OR REPLACE FUNCTION award_bonus_credits(p_user_id UUID, p_credits INT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET
    total_credits = total_credits + p_credits,
    xp = xp + p_credits
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SEED: Default Badges
-- ============================================================
INSERT INTO badges (name, icon, description, condition_type, condition_value) VALUES
  ('First Chore', '⭐', 'Complete your first task', 'tasks_count', 1),
  ('Getting Started', '🌱', 'Complete 5 tasks', 'tasks_count', 5),
  ('Task Master', '💪', 'Complete 25 tasks', 'tasks_count', 25),
  ('Centurion', '💯', 'Complete 100 tasks', 'tasks_count', 100),
  ('On a Roll', '🔥', 'Maintain a 3-day streak', 'streak_days', 3),
  ('7-Day Warrior', '⚡', 'Maintain a 7-day streak', 'streak_days', 7),
  ('Monthly Master', '🗓️', 'Maintain a 30-day streak', 'streak_days', 30),
  ('Credit Starter', '💰', 'Earn 100 total credits', 'total_credits', 100),
  ('High Earner', '💎', 'Earn 500 total credits', 'total_credits', 500),
  ('Credit King', '👑', 'Earn 2000 total credits', 'total_credits', 2000),
  ('Level Up', '🎮', 'Reach Level 3', 'level', 3),
  ('House Pro', '🏠', 'Reach Level 6', 'level', 6),
  ('Legend', '🌟', 'Reach Level 9', 'level', 9);

-- ============================================================
-- STORAGE: Create buckets
-- ============================================================
-- Run these in Supabase Dashboard → Storage → New Bucket
-- Bucket name: avatars      (public: false)
-- Bucket name: task-photos  (public: false)



-- ============================================================
-- USER DEVICE TOKENS (Push Notifications / Firebase FCM)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  device_type TEXT DEFAULT 'android', -- 'android' | 'ios'
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id ON user_device_tokens(user_id);
ALTER TABLE user_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_device_tokens_manage_own" ON user_device_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================
-- GROCERY ITEMS (Shared House Grocery List)
-- ============================================================
CREATE TABLE IF NOT EXISTS grocery_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id    UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  added_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '🛒',
  quantity    TEXT,
  is_checked  BOOLEAN DEFAULT FALSE,
  checked_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_items_house_id ON grocery_items(house_id);

ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

-- House members can read all items in their house
CREATE POLICY "grocery_items_read" ON grocery_items FOR SELECT
  USING (house_id = get_my_house_id());

-- Any house member can insert items into their house
CREATE POLICY "grocery_items_insert" ON grocery_items FOR INSERT
  WITH CHECK (house_id = get_my_house_id() AND added_by = auth.uid());

-- Any house member can update items (check-off / re-open)
CREATE POLICY "grocery_items_update" ON grocery_items FOR UPDATE
  USING (house_id = get_my_house_id());

-- Only the adder can delete their own item
CREATE POLICY "grocery_items_delete" ON grocery_items FOR DELETE
  USING (added_by = auth.uid());

-- Enable realtime for live cross-roommate sync
ALTER PUBLICATION supabase_realtime ADD TABLE grocery_items;


-- ============================================================
-- WEEKLY RESETS & NOTIFICATION QUEUE (Render resilient)
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_resets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  week_key       TEXT NOT NULL,
  winner_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  loser_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  winner_credits INT DEFAULT 0,
  loser_credits  INT DEFAULT 0,
  details        JSONB DEFAULT '{}'::jsonb,
  announced_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(house_id, week_key)
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       UUID REFERENCES houses(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  data           JSONB DEFAULT '{}'::jsonb,
  status         TEXT DEFAULT 'pending',
  scheduled_for  TIMESTAMPTZ DEFAULT NOW(),
  sent_at        TIMESTAMPTZ,
  attempts       INT DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
