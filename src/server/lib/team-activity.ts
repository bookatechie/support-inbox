/**
 * Team activity: when each agent works, judged from what they do in the app.
 *
 * Every message an agent writes and every manual ticket change they make is a timestamped
 * action. Actions are grouped per agent per working day (a day starts at DAY_START_HOUR local
 * time, so a session running past midnight stays on the day it began). Within a day, a gap of
 * more than SESSION_GAP_MINUTES starts a new session; each session counts its first-to-last
 * time plus SESSION_PAD_MINUTES for the work before its first action.
 *
 * This measures time spent acting in the inbox, not hours worked: reading, phone calls and
 * work in other tools between actions leave no trace here.
 */

import { teamActivityQueries, DEFAULT_ADMIN_USER_ID, userQueries } from './database-pg.js';
import { getOurAddresses } from './ticket.js';

const DAY_START_HOUR = 4;
const SESSION_GAP_MINUTES = 45;
const SESSION_PAD_MINUTES = 15;
/** A day with fewer actions is a quick check-in, not a working day */
const MIN_ACTIONS_PER_DAY = 3;
const FAST_REPLY_HOURS = 4;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface TeamActivityDay {
  date: string;          // YYYY-MM-DD, local working day
  first: string;         // HH:MM local
  last: string;          // HH:MM local
  span_hours: number;
  active_hours: number;
  sessions: number;
  emails: number;
  notes: number;
  changes: number;
}

export interface TeamActivityAgent {
  user_id: number;
  name: string;
  active_days: number;
  typical_start: string | null;   // median first action, HH:MM local
  typical_end: string | null;     // median last action, HH:MM local
  median_span_hours: number | null;
  median_active_hours: number | null;
  emails: number;
  notes: number;
  status_changes: number;
  resolved: number;
  replies: number;
  /** Customer email -> agent reply written */
  median_write_hours: number | null;
  /** Customer email -> agent reply actually sent (scheduled sends count from their send time) */
  median_wait_hours: number | null;
  replies_within_4h_pct: number | null;
  scheduled_pct: number | null;
  days: TeamActivityDay[];
}

export interface TeamActivityReport {
  timezone: string;
  agents: TeamActivityAgent[];
}

interface Action {
  at: number;
  kind: 'email' | 'note' | 'change';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/** Local wall-clock parts for an instant in the given IANA time zone */
function localParts(fmt: Intl.DateTimeFormat, at: number): { date: string; minutes: number } {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(at)).map(p => [p.type, p.value]));
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

const hhmm = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Throws RangeError for an unknown zone */
export function assertTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat('en-US', { timeZone });
}

export async function getTeamActivity(startDate: string, endDate: string, timeZone: string): Promise<TeamActivityReport> {
  const ours = [...await getOurAddresses()];
  const [messages, changes, users] = await Promise.all([
    teamActivityQueries.getAuthoredMessages(startDate, endDate, ours, DEFAULT_ADMIN_USER_ID),
    teamActivityQueries.getManualChanges(startDate, endDate, DEFAULT_ADMIN_USER_ID),
    userQueries.getAll(),
  ]);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  const actionsByUser = new Map<number, Action[]>();
  const push = (userId: number, action: Action) => {
    const list = actionsByUser.get(userId);
    if (list) list.push(action); else actionsByUser.set(userId, [action]);
  };
  for (const m of messages) push(m.user_id, { at: Number(m.at), kind: m.type === 'note' ? 'note' : 'email' });
  for (const c of changes) push(c.user_id, { at: Number(c.at), kind: 'change' });

  const agents: TeamActivityAgent[] = [];
  for (const [userId, actions] of actionsByUser) {
    actions.sort((a, b) => a.at - b.at);

    // Group by local working day (shifted so the day starts at DAY_START_HOUR)
    const byDay = new Map<string, Action[]>();
    for (const a of actions) {
      const { date } = localParts(fmt, a.at - DAY_START_HOUR * HOUR_MS);
      const list = byDay.get(date);
      if (list) list.push(a); else byDay.set(date, [a]);
    }

    const days: TeamActivityDay[] = [];
    for (const [date, dayActions] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
      let sessions = 1;
      let active = 0;
      let sessionStart = dayActions[0].at;
      let prev = dayActions[0].at;
      for (const a of dayActions.slice(1)) {
        if (a.at - prev > SESSION_GAP_MINUTES * MINUTE_MS) {
          active += prev - sessionStart + SESSION_PAD_MINUTES * MINUTE_MS;
          sessionStart = a.at;
          sessions++;
        }
        prev = a.at;
      }
      active += prev - sessionStart + SESSION_PAD_MINUTES * MINUTE_MS;

      const first = dayActions[0].at;
      const last = dayActions[dayActions.length - 1].at;
      days.push({
        date,
        first: hhmm(localParts(fmt, first).minutes),
        last: hhmm(localParts(fmt, last).minutes),
        span_hours: round1((last - first) / HOUR_MS)!,
        active_hours: round1(active / HOUR_MS)!,
        sessions,
        emails: dayActions.filter(a => a.kind === 'email').length,
        notes: dayActions.filter(a => a.kind === 'note').length,
        changes: dayActions.filter(a => a.kind === 'change').length,
      });
    }

    // Typical hours use working days only, measured from the day start so a session that
    // runs past midnight doesn't wrap around the median
    const workDays = days.filter(d => d.emails + d.notes + d.changes >= MIN_ACTIONS_PER_DAY);
    const fromDayStart = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return (((h - DAY_START_HOUR) * 60 + m) + 1440) % 1440;
    };
    const startMed = median(workDays.map(d => fromDayStart(d.first)));
    const endMed = median(workDays.map(d => fromDayStart(d.last)));

    const userMessages = messages.filter(m => m.user_id === userId);
    const emails = userMessages.filter(m => m.type === 'email');
    const replies = emails.filter(m => m.customer_at != null);
    const waits = replies.map(m => (Number(m.delivered_at) - Number(m.customer_at)) / HOUR_MS);
    const writes = replies.map(m => (Number(m.at) - Number(m.customer_at)) / HOUR_MS);
    const userChanges = changes.filter(c => c.user_id === userId);

    agents.push({
      user_id: userId,
      name: users.find(u => u.id === userId)?.name ?? `User ${userId}`,
      active_days: workDays.length,
      typical_start: startMed == null ? null : hhmm(startMed + DAY_START_HOUR * 60),
      typical_end: endMed == null ? null : hhmm(endMed + DAY_START_HOUR * 60),
      median_span_hours: round1(median(workDays.map(d => d.span_hours))),
      median_active_hours: round1(median(workDays.map(d => d.active_hours))),
      emails: emails.length,
      notes: userMessages.length - emails.length,
      status_changes: userChanges.filter(c => c.field_name === 'status').length,
      resolved: userChanges.filter(c => c.field_name === 'status' && c.new_value === 'resolved').length,
      replies: replies.length,
      median_write_hours: round1(median(writes)),
      median_wait_hours: round1(median(waits)),
      replies_within_4h_pct: waits.length ? Math.round(100 * waits.filter(w => w <= FAST_REPLY_HOURS).length / waits.length) : null,
      scheduled_pct: emails.length ? Math.round(100 * emails.filter(m => m.scheduled).length / emails.length) : null,
      days,
    });
  }

  agents.sort((a, b) => b.active_days - a.active_days || (b.median_active_hours ?? 0) - (a.median_active_hours ?? 0));
  return { timezone: timeZone, agents };
}
