import { supabase } from '../supabaseClient';

export interface FairnessResult {
  score: number; // 0-100, 100 = perfectly fair
  memberBreakdown: {
    userId: string;
    username: string;
    avatarUrl: string;
    weeklyCredits: number;
    sharePercent: number;
  }[];
}

export const calculateFairnessScore = async (
  houseId: string
): Promise<FairnessResult> => {
  // Get all members
  const { data: members } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('house_id', houseId);

  if (!members || members.length === 0) {
    return { score: 100, memberBreakdown: [] };
  }

  // Get this week's task logs for the house
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const memberIds = members.map((m) => m.id);
  const { data: logs } = await supabase
    .from('task_logs')
    .select('user_id, credits_awarded')
    .in('user_id', memberIds)
    .gte('completed_at', weekAgo.toISOString());

  // Sum credits per member
  const creditMap: Record<string, number> = {};
  members.forEach((m) => (creditMap[m.id] = 0));
  logs?.forEach((l) => {
    creditMap[l.user_id] = (creditMap[l.user_id] ?? 0) + l.credits_awarded;
  });

  const totalCredits = Object.values(creditMap).reduce((a, b) => a + b, 0);
  const idealShare = totalCredits / members.length;

  // Gini-style fairness: deviation from ideal
  let totalDeviation = 0;
  const breakdown = members.map((m) => {
    const credits = creditMap[m.id] ?? 0;
    totalDeviation += Math.abs(credits - idealShare);
    return {
      userId: m.id,
      username: m.username,
      avatarUrl: m.avatar_url,
      weeklyCredits: credits,
      sharePercent: totalCredits > 0 ? Math.round((credits / totalCredits) * 100) : 0,
    };
  });

  // Score: 100 when perfect, drops with deviation
  const maxDeviation = idealShare * members.length;
  const score =
    maxDeviation > 0
      ? Math.max(0, Math.round(100 - (totalDeviation / maxDeviation) * 100))
      : 100;

  return { score, memberBreakdown: breakdown };
};

