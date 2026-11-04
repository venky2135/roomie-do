import { supabase, supabaseAdmin } from './supabase';

export interface TaskLogMetadata {
  note: string;
  status: 'pending_verification' | 'completed';
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  feedbacks?: Array<{
    id: string;
    text: string;
    createdAt: string;
    isAnonymous: boolean;
  }>;
  reactions?: Record<string, string[]>; // emoji -> array of user_ids who reacted
}

export function parseLogNotes(notesRaw: string | null | undefined): TaskLogMetadata {
  if (!notesRaw) {
    return {
      note: '',
      status: 'completed', // legacy logs without metadata are treated as completed
      feedbacks: [],
      reactions: {},
    };
  }

  try {
    const parsed = JSON.parse(notesRaw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      ('status' in parsed || 'feedbacks' in parsed || 'reactions' in parsed)
    ) {
      return {
        note: parsed.note || '',
        status: parsed.status || 'completed',
        verifiedBy: parsed.verifiedBy,
        verifiedByName: parsed.verifiedByName,
        verifiedAt: parsed.verifiedAt,
        feedbacks: Array.isArray(parsed.feedbacks) ? parsed.feedbacks : [],
        reactions: parsed.reactions && typeof parsed.reactions === 'object' ? parsed.reactions : {},
      };
    }
  } catch {
    // Plain string note from before
  }

  return {
    note: notesRaw,
    status: 'completed',
    feedbacks: [],
    reactions: {},
  };
}

export function encodeLogNotes(meta: TaskLogMetadata): string {
  return JSON.stringify(meta);
}

/**
 * Returns true only if a task log has been approved by a housemate or is a verified legacy log.
 * Logs with status 'pending_verification' or unapproved leave requests return false.
 */
export function isLogApproved(notesRaw: string | null | undefined): boolean {
  if (!notesRaw) return true; // legacy logs without metadata are treated as completed
  try {
    const parsed = JSON.parse(notesRaw);
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.type === 'leave_request') {
        return parsed.status === 'approved';
      }
      if (parsed.status === 'pending_verification') {
        return false;
      }
      if (parsed.status === 'completed') {
        return true;
      }
    }
  } catch {
    // Plain string note from before
    return true;
  }
  return true;
}

/**
 * Toggle an emoji reaction for a user on a task log.
 */
export async function toggleTaskLogReaction(
  logId: string,
  emoji: string,
  userId: string
): Promise<{ success: boolean; reactions?: Record<string, string[]>; error?: string }> {
  try {
    const { data: log, error: logErr } = await supabaseAdmin
      .from('task_logs')
      .select('notes')
      .eq('id', logId)
      .single();

    if (logErr || !log) {
      return { success: false, error: 'Task log not found.' };
    }

    const currentMeta = parseLogNotes(log.notes);
    const reactions: Record<string, string[]> = { ...(currentMeta.reactions || {}) };
    const currentUsers = reactions[emoji] || [];

    if (currentUsers.includes(userId)) {
      reactions[emoji] = currentUsers.filter((id) => id !== userId);
    } else {
      reactions[emoji] = [...currentUsers, userId];
    }

    const updatedMeta: TaskLogMetadata = {
      ...currentMeta,
      reactions,
    };

    const { error: updateErr } = await supabaseAdmin
      .from('task_logs')
      .update({ notes: encodeLogNotes(updatedMeta) })
      .eq('id', logId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, reactions };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to toggle reaction.' };
  }
}

/**
 * Vote / Verify a task log by a housemate.
 * Awards the XP credits to the task creator upon verification.
 */
export async function verifyTaskLog(
  logId: string,
  verifiedByUserId: string,
  verifiedByUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Fetch current log
    const { data: log, error: logErr } = await supabaseAdmin
      .from('task_logs')
      .select('*, profiles(id, xp, total_credits, streak_days)')
      .eq('id', logId)
      .single();

    if (logErr || !log) {
      return { success: false, error: 'Task log not found.' };
    }

    if (log.user_id === verifiedByUserId) {
      return { success: false, error: 'You cannot approve your own chore.' };
    }

    const currentMeta = parseLogNotes(log.notes);
    if (currentMeta.status === 'completed') {
      return { success: false, error: 'Task is already approved.' };
    }

    // 2. Update metadata to completed
    const updatedMeta: TaskLogMetadata = {
      ...currentMeta,
      status: 'completed',
      verifiedBy: verifiedByUserId,
      verifiedByName: verifiedByUsername,
      verifiedAt: new Date().toISOString(),
    };

    const { error: updateErr } = await supabaseAdmin
      .from('task_logs')
      .update({ notes: encodeLogNotes(updatedMeta) })
      .eq('id', logId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 3. Award XP and total credits to the logger
    const creator = log.profiles;
    if (creator) {
      const award = log.credits_awarded || 20;
      const newXp = (creator.xp || 0) + award;
      const newCredits = (creator.total_credits || 0) + award;
      const newLevel = Math.floor(newXp / 500) + 1;
      await supabaseAdmin
        .from('profiles')
        .update({
          xp: newXp,
          total_credits: newCredits,
          level: newLevel,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', creator.id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Verification failed.' };
  }
}

/**
 * Add anonymous feedback to a task log.
 */
export async function addAnonymousFeedback(
  logId: string,
  feedbackText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: log, error: logErr } = await supabaseAdmin
      .from('task_logs')
      .select('notes')
      .eq('id', logId)
      .single();

    if (logErr || !log) {
      return { success: false, error: 'Task log not found.' };
    }

    const currentMeta = parseLogNotes(log.notes);
    const newFeedback = {
      id: Math.random().toString(36).slice(2, 9),
      text: feedbackText.trim(),
      createdAt: new Date().toISOString(),
      isAnonymous: true,
    };

    const updatedFeedbacks = [...(currentMeta.feedbacks || []), newFeedback];
    const updatedMeta: TaskLogMetadata = {
      ...currentMeta,
      feedbacks: updatedFeedbacks,
    };

    const { error: updateErr } = await supabaseAdmin
      .from('task_logs')
      .update({ notes: encodeLogNotes(updatedMeta) })
      .eq('id', logId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit feedback.' };
  }
}

// ─── Marketplace Tasks ───────────────────────────────────────
export interface MarketplaceTask {
  id: string;
  houseId: string;
  title: string;
  description: string;
  bountyXp: number;
  createdBy: string;
  createdByName: string;
  claimedBy?: string | null;
  claimedByName?: string | null;
  status: 'open' | 'claimed' | 'completed';
  createdAt: string;
}

interface MarketplaceIconMeta {
  type: 'marketplace';
  description: string;
  createdBy: string;
  createdByName: string;
  claimedBy?: string | null;
  claimedByName?: string | null;
  status: 'open' | 'claimed' | 'completed';
}

/**
 * Fetch marketplace chores for the house.
 */
export async function fetchMarketplaceTasks(houseId: string): Promise<MarketplaceTask[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('house_id', houseId)
    .eq('category', 'Marketplace')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((t) => {
    let meta: Partial<MarketplaceIconMeta> = {};
    try {
      meta = JSON.parse(t.icon);
    } catch {
      meta = { description: '', createdBy: '', createdByName: 'Roommate', status: 'open' };
    }

    return {
      id: t.id,
      houseId: t.house_id,
      title: t.name,
      description: meta.description || '',
      bountyXp: t.base_credits || 25,
      createdBy: meta.createdBy || '',
      createdByName: meta.createdByName || 'Roommate',
      claimedBy: meta.claimedBy || null,
      claimedByName: meta.claimedByName || null,
      status: meta.status || 'open',
      createdAt: t.created_at,
    };
  });
}

/**
 * Post a new chore to the marketplace.
 */
export async function createMarketplaceTask(params: {
  houseId: string;
  title: string;
  description: string;
  bountyXp: number;
  userId: string;
  username: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const iconMeta: MarketplaceIconMeta = {
      type: 'marketplace',
      description: params.description,
      createdBy: params.userId,
      createdByName: params.username,
      status: 'open',
    };

    const { error } = await supabaseAdmin.from('task_templates').insert({
      house_id: params.houseId,
      name: params.title,
      category: 'Marketplace',
      base_credits: params.bountyXp,
      icon: JSON.stringify(iconMeta),
      photo_required: false,
      is_active: true,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Claim an open marketplace task.
 */
export async function claimMarketplaceTask(
  taskId: string,
  userId: string,
  username: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: task, error: fetchErr } = await supabaseAdmin
      .from('task_templates')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchErr || !task) return { success: false, error: 'Task not found.' };

    let meta: MarketplaceIconMeta;
    try {
      meta = JSON.parse(task.icon);
    } catch {
      meta = {
        type: 'marketplace',
        description: '',
        createdBy: '',
        createdByName: 'Roommate',
        status: 'open',
      };
    }

    if (meta.status !== 'open') {
      return { success: false, error: 'Task is already claimed or completed.' };
    }

    meta.status = 'claimed';
    meta.claimedBy = userId;
    meta.claimedByName = username;

    const { error } = await supabaseAdmin
      .from('task_templates')
      .update({ icon: JSON.stringify(meta) })
      .eq('id', taskId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Mark a claimed marketplace task as completed (creates task log for verification).
 */
export async function completeMarketplaceTask(
  taskId: string,
  userId: string,
  notes?: string,
  photoUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: task, error: fetchErr } = await supabaseAdmin
      .from('task_templates')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchErr || !task) return { success: false, error: 'Task not found.' };

    let meta: MarketplaceIconMeta;
    try {
      meta = JSON.parse(task.icon);
    } catch {
      meta = {
        type: 'marketplace',
        description: '',
        createdBy: '',
        createdByName: 'Roommate',
        status: 'claimed',
      };
    }

    // Set template status to completed
    meta.status = 'completed';
    await supabaseAdmin
      .from('task_templates')
      .update({ icon: JSON.stringify(meta), is_active: false })
      .eq('id', taskId);

    // Insert task log with pending verification
    const logMetadata: TaskLogMetadata = {
      note: notes || meta.description || 'Completed marketplace chore',
      status: 'pending_verification',
      feedbacks: [],
    };

    const { error: logErr } = await supabaseAdmin.from('task_logs').insert({
      user_id: userId,
      task_id: taskId,
      credits_awarded: task.base_credits,
      photo_url: photoUrl || null,
      notes: encodeLogNotes(logMetadata),
      completed_at: new Date().toISOString(),
    });

    if (logErr) return { success: false, error: logErr.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
