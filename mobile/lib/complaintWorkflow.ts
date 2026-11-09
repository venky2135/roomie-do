import { supabaseAdmin } from './supabase';
import { notifyComplaintRaised, notifyComplaintUpheld } from './api';
import { calculateUserStreak } from './streakWorkflow';

export interface ComplaintMetadata {
  type: 'anonymous_complaint';
  accusedId: string;
  accusedUsername: string;
  accusedAvatar?: string;
  category: string; // e.g. 'Dishes & Kitchen', 'Noise', 'Cleanliness', 'Bathroom', 'Other'
  title: string;
  details?: string;
  reporterId: string; // Stored securely to prevent self-voting or self-complaining, never revealed publicly in UI
  upvotes: string[]; // User IDs of roommates who upvoted
  status: 'pending' | 'upheld' | 'dismissed';
  streakPenalty: number; // -10 streaks penalty
  requiredUpvotes: number; // Number of upvotes needed to uphold
  upheldAt?: string;
}

/**
 * Parse complaint metadata from task log notes. Returns null if not a complaint.
 */
export function parseComplaintMetadata(notesRaw: string | null | undefined): ComplaintMetadata | null {
  if (!notesRaw) return null;
  try {
    const parsed = JSON.parse(notesRaw);
    if (parsed && parsed.type === 'anonymous_complaint') {
      return {
        type: 'anonymous_complaint',
        accusedId: parsed.accusedId || '',
        accusedUsername: parsed.accusedUsername || 'Roommate',
        accusedAvatar: parsed.accusedAvatar || '🧑',
        category: parsed.category || 'General',
        title: parsed.title || '',
        details: parsed.details || '',
        reporterId: parsed.reporterId || '',
        upvotes: Array.isArray(parsed.upvotes) ? parsed.upvotes : [],
        status: parsed.status || 'pending',
        streakPenalty: Number(parsed.streakPenalty) || 10,
        requiredUpvotes: Number(parsed.requiredUpvotes) || 1,
        upheldAt: parsed.upheldAt,
      };
    }
  } catch {}
  return null;
}

/**
 * Find or create the dedicated Anonymous Complaint template for the house.
 */
export async function getOrCreateComplaintTemplate(houseId: string): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from('task_templates')
    .select('id')
    .eq('house_id', houseId)
    .eq('category', 'Complaint')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('task_templates')
    .insert({
      house_id: houseId,
      name: 'Anonymous Complaint',
      icon: '🤫',
      category: 'Complaint',
      base_credits: 0,
      photo_required: false,
      is_active: false,
    })
    .select('id')
    .single();

  if (error || !created) {
    console.warn('Failed to create complaint template:', error);
    return null;
  }

  return created.id;
}

/**
 * Submit an anonymous complaint against another roommate.
 * Posts as a task_log so it reflects immediately in the Activity Feed in realtime.
 */
export async function submitAnonymousComplaint(params: {
  reporterId: string;
  houseId: string;
  accusedId: string;
  accusedUsername: string;
  accusedAvatar?: string;
  category: string;
  title: string;
  details?: string;
  totalMembers: number;
}): Promise<{ success: boolean; logId?: string; error?: string }> {
  try {
    if (!params.reporterId || !params.accusedId) {
      return { success: false, error: 'Invalid complaint parameters.' };
    }

    if (params.reporterId === params.accusedId) {
      return { success: false, error: 'You cannot file a complaint against yourself.' };
    }

    const templateId = await getOrCreateComplaintTemplate(params.houseId);
    if (!templateId) {
      return { success: false, error: 'Could not initialize complaint system.' };
    }

    // Required upvotes:
    // When house has 2 members (reporter & accused), 1 confirmation needed.
    // When house has 3 members, 1 other roommate needed.
    // When house has 4 members, 1 other roommate needed.
    // When house has 5+ members, Math.ceil(otherRoommates / 2) needed.
    const otherMembers = Math.max(1, params.totalMembers - 2);
    const requiredUpvotes = Math.max(1, Math.ceil(otherMembers / 2));

    const complaintMeta: ComplaintMetadata = {
      type: 'anonymous_complaint',
      accusedId: params.accusedId,
      accusedUsername: params.accusedUsername,
      accusedAvatar: params.accusedAvatar || '🧑',
      category: params.category.trim() || 'General',
      title: params.title.trim(),
      details: (params.details || '').trim(),
      reporterId: params.reporterId,
      upvotes: [],
      status: 'pending',
      streakPenalty: 10,
      requiredUpvotes,
    };

    const { data, error } = await supabaseAdmin
      .from('task_logs')
      .insert({
        user_id: params.reporterId,
        task_id: templateId,
        credits_awarded: 0,
        notes: JSON.stringify(complaintMeta),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to submit complaint.' };
    }

    // Send push notification to housemates
    notifyComplaintRaised({
      logId: data.id,
      accusedUsername: params.accusedUsername,
      category: complaintMeta.category,
      title: complaintMeta.title,
    }).catch((e) => console.warn('[Push] Complaint notification failed:', e));

    return { success: true, logId: data.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit complaint.' };
  }
}

/**
 * Upvote a complaint.
 * When other roommates upvote it and threshold is reached, the accused loses 10 streaks (-10 streaks).
 */
export async function upvoteComplaint(params: {
  logId: string;
  voterUserId: string;
  voterUsername: string;
  houseId: string;
}): Promise<{ success: boolean; isUpheld?: boolean; error?: string }> {
  try {
    const { data: log, error: logErr } = await supabaseAdmin
      .from('task_logs')
      .select('*')
      .eq('id', params.logId)
      .single();

    if (logErr || !log) {
      return { success: false, error: 'Complaint not found.' };
    }

    const currentMeta = parseComplaintMetadata(log.notes);
    if (!currentMeta) {
      return { success: false, error: 'Invalid complaint metadata.' };
    }

    if (currentMeta.status === 'upheld') {
      return { success: false, error: 'This complaint is already upheld and penalty applied.' };
    }

    if (currentMeta.accusedId === params.voterUserId) {
      return { success: false, error: 'You cannot vote on a complaint against yourself.' };
    }

    if (currentMeta.reporterId === params.voterUserId) {
      return { success: false, error: 'You cannot upvote a complaint you filed.' };
    }

    if (currentMeta.upvotes.includes(params.voterUserId)) {
      return { success: false, error: 'You have already upvoted this complaint.' };
    }

    const updatedUpvotes = [...currentMeta.upvotes, params.voterUserId];
    const isUpheld = updatedUpvotes.length >= currentMeta.requiredUpvotes;

    const updatedMeta: ComplaintMetadata = {
      ...currentMeta,
      upvotes: updatedUpvotes,
      status: isUpheld ? 'upheld' : 'pending',
      upheldAt: isUpheld ? new Date().toISOString() : undefined,
    };

    // Update the task log
    const { error: updateErr } = await supabaseAdmin
      .from('task_logs')
      .update({ notes: JSON.stringify(updatedMeta) })
      .eq('id', params.logId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // If upheld, deduct 10 streaks and 10 XP/credits from the accused roommate's profile
    if (isUpheld) {
      const penalty = currentMeta.streakPenalty || 20;

      const { data: accusedProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, streak_days, xp, total_credits, weekly_xp, username')
        .eq('id', currentMeta.accusedId)
        .single();

      if (accusedProfile) {
        const currentStreak = accusedProfile.streak_days ?? 0;
        const currentXp = accusedProfile.xp ?? 0;
        const currentCredits = accusedProfile.total_credits ?? 0;
        const currentWeeklyXp = accusedProfile.weekly_xp ?? 0;

        const newStreak = Math.max(0, currentStreak - penalty);
        const newXp = Math.max(0, currentXp - penalty);
        const newCredits = Math.max(0, currentCredits - penalty);
        const newWeeklyXp = Math.max(0, currentWeeklyXp - penalty);

        await supabaseAdmin
          .from('profiles')
          .update({
            streak_days: newStreak,
            xp: newXp,
            total_credits: newCredits,
            weekly_xp: newWeeklyXp,
          })
          .eq('id', currentMeta.accusedId);
      }

      // Recalculate streak to ensure cache is fresh
      calculateUserStreak(currentMeta.accusedId).catch(() => {});

      // Send push notification that complaint is upheld
      notifyComplaintUpheld({
        logId: params.logId,
        accusedUserId: currentMeta.accusedId,
        accusedUsername: currentMeta.accusedUsername,
        title: currentMeta.title,
        streakPenalty: penalty,
      }).catch((e) => console.warn('[Push] Complaint upheld notification failed:', e));
    }

    return { success: true, isUpheld };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upvote complaint.' };
  }
}

/**
 * Withdraw an anonymous complaint (only the reporter can withdraw while pending).
 */
export async function withdrawComplaint(
  logId: string,
  reporterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: log, error: logErr } = await supabaseAdmin
      .from('task_logs')
      .select('notes')
      .eq('id', logId)
      .single();

    if (logErr || !log) {
      return { success: false, error: 'Complaint not found.' };
    }

    const meta = parseComplaintMetadata(log.notes);
    if (!meta) {
      return { success: false, error: 'Invalid complaint metadata.' };
    }

    if (meta.reporterId !== reporterId) {
      return { success: false, error: 'Only the reporter can withdraw this complaint.' };
    }

    if (meta.status === 'upheld') {
      return { success: false, error: 'Cannot withdraw a complaint that has already been upheld.' };
    }

    const { error: delErr } = await supabaseAdmin
      .from('task_logs')
      .delete()
      .eq('id', logId);

    if (delErr) {
      return { success: false, error: delErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to withdraw complaint.' };
  }
}

