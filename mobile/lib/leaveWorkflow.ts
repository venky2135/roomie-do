import { supabaseAdmin } from './supabase';
import { notifyLeaveRequested, notifyLeaveApproved } from './api';
import { toLocalDateString, normalizeDateString, calculateUserStreak } from './streakWorkflow';

export interface LeaveRequestMetadata {
  type: 'leave_request';
  duration: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  reason: string;
  requestedXp: number;
  comments?: string;
  approvals: string[]; // user IDs of housemates who approved
  approvedNames?: string[]; // usernames of housemates who approved
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
}

export interface LeaveRequestItem {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  duration: string;
  startDate?: string;
  endDate?: string;
  reason: string;
  requestedXp: number;
  comments: string;
  approvals: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  totalRoommatesNeeded: number;
}

/**
 * Helper to parse leave request notes. Returns null if not a leave request.
 */
export function parseLeaveMetadata(notesRaw: string | null | undefined): LeaveRequestMetadata | null {
  if (!notesRaw) return null;
  try {
    const parsed = JSON.parse(notesRaw);
    if (parsed && parsed.type === 'leave_request') {
      return {
        type: 'leave_request',
        duration: parsed.duration || 'Short Leave',
        startDate: normalizeDateString(parsed.startDate) || parsed.startDate,
        endDate: normalizeDateString(parsed.endDate) || parsed.endDate,
        reason: parsed.reason || '',
        requestedXp: Number(parsed.requestedXp) || 0,
        comments: parsed.comments || '',
        approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
        approvedNames: Array.isArray(parsed.approvedNames) ? parsed.approvedNames : [],
        status: parsed.status || 'pending',
        approvedAt: parsed.approvedAt,
      };
    }
  } catch {}
  return null;
}

/**
 * Find or create the dedicated Leave template for the house.
 */
export async function getOrCreateLeaveTemplate(houseId: string): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from('task_templates')
    .select('id')
    .eq('house_id', houseId)
    .eq('category', 'Leave')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('task_templates')
    .insert({
      house_id: houseId,
      name: 'Leave Request',
      icon: 'airplane',
      category: 'Leave',
      base_credits: 0,
      photo_required: false,
      is_active: false,
    })
    .select('id')
    .single();

  if (error || !created) {
    console.warn('Failed to create leave template:', error);
    return null;
  }

  return created.id;
}

/**
 * Submit a leave request.
 * Posts as a task_log so it reflects immediately in the Live Feed.
 */
export async function submitLeaveRequest(params: {
  userId: string;
  houseId: string;
  duration: string;
  startDate?: string;
  endDate?: string;
  reason: string;
  requestedXp: number;
  comments?: string;
}): Promise<{ success: boolean; logId?: string; error?: string }> {
  try {
    const templateId = await getOrCreateLeaveTemplate(params.houseId);
    if (!templateId) {
      return { success: false, error: 'Could not initialize leave template.' };
    }

    const leaveMeta: LeaveRequestMetadata = {
      type: 'leave_request',
      duration: params.duration.trim(),
      startDate: normalizeDateString(params.startDate) || params.startDate,
      endDate: normalizeDateString(params.endDate) || params.endDate,
      reason: params.reason.trim(),
      requestedXp: Math.max(0, Math.round(Number(params.requestedXp) || 0)),
      comments: (params.comments || '').trim(),
      approvals: [],
      approvedNames: [],
      status: 'pending',
    };

    const { data, error } = await supabaseAdmin
      .from('task_logs')
      .insert({
        user_id: params.userId,
        task_id: templateId,
        credits_awarded: leaveMeta.requestedXp,
        notes: JSON.stringify(leaveMeta),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to submit leave request.' };
    }

    notifyLeaveRequested({
      logId: data.id,
      duration: leaveMeta.duration,
      reason: leaveMeta.reason,
    }).catch((e) => console.warn('[Push] Leave requested notification failed:', e));

    return { success: true, logId: data.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit leave request.' };
  }
}

/**
 * Approve a leave request by a housemate.
 * If all other roommates have approved, the request is marked approved and XP is awarded.
 */
export async function approveLeaveRequest(params: {
  logId: string;
  approverUserId: string;
  approverUsername: string;
  houseId: string;
}): Promise<{ success: boolean; isFullyApproved?: boolean; error?: string }> {
  try {
    // 1. Fetch current log
    const { data: log, error: logErr } = await supabaseAdmin
      .from('task_logs')
      .select('*, profiles(id, xp, total_credits, username)')
      .eq('id', params.logId)
      .single();

    if (logErr || !log) {
      return { success: false, error: 'Leave request not found.' };
    }

    if (log.user_id === params.approverUserId) {
      return { success: false, error: 'You cannot approve your own leave request.' };
    }

    const currentMeta = parseLeaveMetadata(log.notes);
    if (!currentMeta) {
      return { success: false, error: 'Invalid leave request metadata.' };
    }

    if (currentMeta.status === 'approved') {
      return { success: false, error: 'This leave request is already fully approved.' };
    }

    // Check if already approved by this user
    if (currentMeta.approvals.includes(params.approverUserId)) {
      return { success: false, error: 'You have already approved this leave request.' };
    }

    // 2. Count total housemates to determine required approvals
    const { data: houseMembers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('house_id', params.houseId);

    const totalMembers = houseMembers?.length || 1;
    const requiredApprovals = Math.max(1, totalMembers - 1);

    const updatedApprovals = [...currentMeta.approvals, params.approverUserId];
    const updatedApprovedNames = [...(currentMeta.approvedNames || []), params.approverUsername];
    const isFullyApproved = updatedApprovals.length >= requiredApprovals;

    const updatedMeta: LeaveRequestMetadata = {
      ...currentMeta,
      approvals: updatedApprovals,
      approvedNames: updatedApprovedNames,
      status: isFullyApproved ? 'approved' : 'pending',
      approvedAt: isFullyApproved ? new Date().toISOString() : undefined,
    };

    // 3. Update task_log
    const { error: updateErr } = await supabaseAdmin
      .from('task_logs')
      .update({ notes: JSON.stringify(updatedMeta) })
      .eq('id', params.logId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 4. If fully approved, award the requested XP to requester's profile and recalculate streak
    if (isFullyApproved) {
      if (currentMeta.requestedXp > 0) {
        const requester = log.profiles;
        if (requester) {
          await supabaseAdmin
            .from('profiles')
            .update({
              xp: (requester.xp || 0) + currentMeta.requestedXp,
              total_credits: (requester.total_credits || 0) + currentMeta.requestedXp,
              last_active_at: new Date().toISOString(),
            })
            .eq('id', requester.id);
        }
      }
      // Leave preserves/freezes streak
      calculateUserStreak(log.user_id).catch(() => {});
    }

    notifyLeaveApproved({
      logId: params.logId,
      workerUserId: log.user_id,
      isFullyApproved,
      duration: currentMeta.duration,
    }).catch((e) => console.warn('[Push] Leave approved notification failed:', e));

    return { success: true, isFullyApproved };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to approve leave request.' };
  }
}

/**
 * Delete a leave request (by the requester).
 */
export async function deleteLeaveRequest(
  logId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('task_logs')
      .delete()
      .eq('id', logId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete leave request.' };
  }
}

/**
 * Check which users in the house have applied for leave (pending or approved)
 * for the current period or today.
 * Returns array of user IDs on leave.
 */
export async function fetchActiveLeaves(
  houseId: string,
  period: 'week' | 'month' | 'all' = 'week'
): Promise<string[]> {
  try {
    const { data: memberProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('house_id', houseId);

    const memberIds = memberProfiles?.map((m) => m.id) || [];
    if (memberIds.length === 0) return [];

    // Query recent logs of members
    const { data: logs } = await supabaseAdmin
      .from('task_logs')
      .select('id, user_id, notes, completed_at, task_templates(category)')
      .in('user_id', memberIds)
      .order('completed_at', { ascending: false })
      .limit(60);

    if (!logs) return [];

    const today = new Date();
    const todayStr = toLocalDateString(today);

    // Compute period start date string for ranking chart range
    let periodStartStr: string | null = null;
    if (period === 'week') {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      periodStartStr = toLocalDateString(d);
    } else if (period === 'month') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      periodStartStr = toLocalDateString(d);
    }

    const onLeaveUserIds = new Set<string>();

    for (const log of logs) {
      const meta = parseLeaveMetadata(log.notes);
      // Anyone who applied for leave (pending or approved, not rejected)
      if (meta && meta.status !== 'rejected') {
        const normStart = normalizeDateString(meta.startDate);
        const normEnd = normalizeDateString(meta.endDate);

        if (normStart && normEnd) {
          // Check if active today
          const isActiveToday = todayStr >= normStart && todayStr <= normEnd;

          // Check if overlaps with the selected ranking period
          let overlapsPeriod = false;
          if (period === 'all') {
            overlapsPeriod = isActiveToday || true;
          } else if (periodStartStr) {
            overlapsPeriod = normStart <= todayStr && normEnd >= periodStartStr;
          }

          if (isActiveToday || overlapsPeriod) {
            onLeaveUserIds.add(log.user_id);
          }
        } else if (normStart) {
          if (todayStr >= normStart) {
            onLeaveUserIds.add(log.user_id);
          }
        } else {
          // Fallback: check if submitted within last 7 days as active leave
          const completedTime = log.completed_at ? new Date(log.completed_at).getTime() : 0;
          const diffDays = (Date.now() - completedTime) / (1000 * 60 * 60 * 24);
          if (diffDays <= 7) {
            onLeaveUserIds.add(log.user_id);
          }
        }
      }
    }

    return Array.from(onLeaveUserIds);
  } catch (err) {
    console.warn('Error fetching active leaves:', err);
    return [];
  }
}
