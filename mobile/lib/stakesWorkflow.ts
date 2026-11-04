import { supabase, supabaseAdmin } from './supabase';

export interface WeeklyStakes {
  bounty: string;
  penalty: string;
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULT_STAKES: WeeklyStakes = {
  bounty: 'Winner gets treated to weekend takeout dinner by housemates 🍕',
  penalty: 'Loser does the weekend kitchen deep clean & takes out the trash 🧹',
};

/**
 * Fetch the current weekly bounty & penalty for a house.
 */
export async function fetchWeeklyStakes(houseId: string): Promise<WeeklyStakes> {
  try {
    const { data, error } = await supabaseAdmin
      .from('task_templates')
      .select('*')
      .eq('house_id', houseId)
      .eq('category', 'WeeklyStakes')
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_STAKES;
    }

    try {
      const parsed = JSON.parse(data.name);
      return {
        bounty: parsed.bounty || DEFAULT_STAKES.bounty,
        penalty: parsed.penalty || DEFAULT_STAKES.penalty,
        updatedAt: parsed.updatedAt,
        updatedBy: parsed.updatedBy,
      };
    } catch {
      return DEFAULT_STAKES;
    }
  } catch {
    return DEFAULT_STAKES;
  }
}

/**
 * Update the weekly bounty & penalty for a house (Admin action).
 */
export async function saveWeeklyStakes(params: {
  houseId: string;
  bounty: string;
  penalty: string;
  userId: string;
}): Promise<{ success: boolean; stakes?: WeeklyStakes; error?: string }> {
  try {
    const stakesPayload: WeeklyStakes = {
      bounty: params.bounty.trim() || DEFAULT_STAKES.bounty,
      penalty: params.penalty.trim() || DEFAULT_STAKES.penalty,
      updatedAt: new Date().toISOString(),
      updatedBy: params.userId,
    };

    const nameContent = JSON.stringify(stakesPayload);

    // Check if a template already exists for this house
    const { data: existing } = await supabaseAdmin
      .from('task_templates')
      .select('id')
      .eq('house_id', params.houseId)
      .eq('category', 'WeeklyStakes')
      .maybeSingle();

    if (existing?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from('task_templates')
        .update({
          name: nameContent,
          is_active: true,
        })
        .eq('id', existing.id);

      if (updateErr) return { success: false, error: updateErr.message };
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('task_templates')
        .insert({
          house_id: params.houseId,
          name: nameContent,
          category: 'WeeklyStakes',
          icon: '🏆',
          base_credits: 0,
          photo_required: false,
          is_active: true,
        });

      if (insertErr) return { success: false, error: insertErr.message };
    }

    return { success: true, stakes: stakesPayload };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save weekly stakes' };
  }
}

