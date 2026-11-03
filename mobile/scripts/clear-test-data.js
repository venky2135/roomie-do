const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env from mobile/
const envPath = path.join(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function clearTestData() {
  console.log('🧹 Clearing test data in Supabase...\n');

  // 1. Delete all task logs (and cascade to reactions / feedbacks)
  const { error: logErr, count: logCount } = await supabase
    .from('task_logs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (logErr) console.error('Error clearing task_logs:', logErr.message);
  else console.log('✅ Cleared task_logs (feed activity, proof notes, reactions, feedbacks).');

  // 2. Delete test marketplace tasks
  const { error: mpErr } = await supabase
    .from('task_templates')
    .delete()
    .eq('category', 'Marketplace');
  if (mpErr) console.error('Error clearing marketplace tasks:', mpErr.message);
  else console.log('✅ Cleared marketplace_tasks (bounties).');

  // 3. Reset profile stats (XP, credits, streak) back to 0
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ xp: 0, total_credits: 0, streak_days: 0, level: 1 })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (profileErr) console.error('Error resetting profiles:', profileErr.message);
  else console.log('✅ Reset profiles XP, credits, streaks to 0 (accounts & house membership preserved).');

  // 4. Delete proof photos from storage bucket
  try {
    const { data: files } = await supabase.storage.from('task-photos').list();
    if (files && files.length > 0) {
      const paths = files.map((f) => f.name);
      const { error: storageErr } = await supabase.storage.from('task-photos').remove(paths);
      if (storageErr) console.error('Error deleting photos:', storageErr.message);
      else console.log(`✅ Removed ${paths.length} test photo proofs from storage bucket (task-photos).`);
    } else {
      console.log('✅ No photo proofs to clean up in storage.');
    }
  } catch (e) {
    console.warn('Storage cleanup note:', e.message);
  }

  // 5. Clean nudges / user badges if any
  try {
    await supabase.from('nudges').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('user_badges').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('✅ Cleared nudges and user badges.');
  } catch {}

  console.log('\n🎉 Test data cleanup completed successfully!');
}

clearTestData().catch(console.error);
