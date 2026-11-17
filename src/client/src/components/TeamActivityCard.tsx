/**
 * Team activity: when each agent works and how fast customers hear back,
 * from the messages they write and the ticket changes they make (server: lib/team-activity.ts).
 */

import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { tickets as ticketsApi } from '@/lib/api';
import type { TeamActivityAgent, TeamActivityReport } from '@/types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TeamActivityCardProps {
  startDate: string;
  endDate: string;
  /** Show only this user, with their days expanded */
  userId?: number;
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "13:05" -> "1:05 PM" */
function clock(hhmm: string | null): string {
  if (!hhmm) return '-';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const hours = (h: number | null) => (h == null ? '-' : `${h.toFixed(1)} h`);
const perDay = (n: number, days: number) => (days ? (n / days).toFixed(0) : '-');
const pct = (n: number | null) => (n == null ? '-' : `${n}%`);

/** Long waits read better in days */
function wait(h: number | null): string {
  if (h == null) return '-';
  return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
}

/** Over a day is flagged (icon + color), everything else stays in normal text */
const isSlow = (h: number | null) => h != null && h > 24;

function weekday(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
}

function DayRows({ agent }: { agent: TeamActivityAgent }) {
  return (
    <tr>
      <td colSpan={11} className="bg-muted/30 px-2 py-2 sm:px-6">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-3 font-medium">Day</th>
              <th className="py-1 pr-3 font-medium">First</th>
              <th className="py-1 pr-3 font-medium">Last</th>
              <th className="py-1 pr-3 font-medium text-right">Span</th>
              <th className="py-1 pr-3 font-medium text-right">Active</th>
              <th className="py-1 pr-3 font-medium text-right">Sessions</th>
              <th className="py-1 pr-3 font-medium text-right">Emails</th>
              <th className="py-1 pr-3 font-medium text-right">Notes</th>
              <th className="py-1 font-medium text-right">Changes</th>
            </tr>
          </thead>
          <tbody>
            {agent.days.map(d => (
              <tr key={d.date} className="border-t border-border/50">
                <td className="py-1 pr-3 whitespace-nowrap">{weekday(d.date)}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{clock(d.first)}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{clock(d.last)}</td>
                <td className="py-1 pr-3 text-right">{hours(d.span_hours)}</td>
                <td className="py-1 pr-3 text-right">{hours(d.active_hours)}</td>
                <td className="py-1 pr-3 text-right">{d.sessions}</td>
                <td className="py-1 pr-3 text-right">{d.emails}</td>
                <td className="py-1 pr-3 text-right">{d.notes}</td>
                <td className="py-1 text-right">{d.changes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function TeamActivityCard({ startDate, endDate, userId }: TeamActivityCardProps) {
  const [report, setReport] = useState<TeamActivityReport | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setError(false);
    ticketsApi.getTeamActivity(startDate, endDate, timeZone)
      .then(data => { if (!cancelled) setReport(data); })
      .catch(err => {
        console.error('Failed to load team activity:', err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const agents = (report?.agents ?? []).filter(a => userId === undefined || a.user_id === userId);

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Team activity</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        From the emails, notes and ticket changes each person makes in the inbox. Times in {timeZone}.
        Click a row for each day.
      </p>

      {error ? (
        <p className="text-sm text-muted-foreground">Couldn't load team activity.</p>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity in this period.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b">
                <th className="py-2 pr-3 font-medium">Agent</th>
                <th className="py-2 pr-3 font-medium text-right" title="Days with at least 3 actions">Days</th>
                <th className="py-2 pr-3 font-medium" title="Median first and last action of the day">Typical hours</th>
                <th className="py-2 pr-3 font-medium text-right" title="Median first-to-last action">Span</th>
                <th className="py-2 pr-3 font-medium text-right" title="Median time in working sessions: a 45+ minute gap starts a new session, each counts 15 minutes before its first action">Active</th>
                <th className="py-2 pr-3 font-medium text-right" title="Emails written per working day">Emails / day</th>
                <th className="py-2 pr-3 font-medium text-right" title="Internal notes per working day">Notes / day</th>
                <th className="py-2 pr-3 font-medium text-right" title="Tickets set to resolved">Resolved</th>
                <th className="py-2 pr-3 font-medium text-right" title="Median time from the customer's email until the reply was sent (a scheduled reply counts from its send time)">Customer waits</th>
                <th className="py-2 pr-3 font-medium text-right" title="Replies sent within 4 hours of the customer's email">Within 4 h</th>
                <th className="py-2 font-medium text-right" title="Emails scheduled to send later instead of right away">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => {
                const open = userId !== undefined || expanded.has(a.user_id);
                const Chevron = open ? ChevronDown : ChevronRight;
                return (
                  <Fragment key={a.user_id}>
                    <tr
                      className="border-b hover:bg-muted/40 cursor-pointer"
                      onClick={() => userId === undefined && toggle(a.user_id)}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap font-medium">
                        <Chevron className="inline h-4 w-4 mr-1 text-muted-foreground" />
                        {a.name}
                      </td>
                      <td className="py-2 pr-3 text-right">{a.active_days}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{clock(a.typical_start)} – {clock(a.typical_end)}</td>
                      <td className="py-2 pr-3 text-right">{hours(a.median_span_hours)}</td>
                      <td className="py-2 pr-3 text-right">{hours(a.median_active_hours)}</td>
                      <td className="py-2 pr-3 text-right">{perDay(a.emails, a.active_days)}</td>
                      <td className="py-2 pr-3 text-right">{perDay(a.notes, a.active_days)}</td>
                      <td className="py-2 pr-3 text-right">{a.resolved}</td>
                      <td
                        className={cn('py-2 pr-3 text-right whitespace-nowrap', isSlow(a.median_wait_hours) && 'text-red-700 dark:text-red-400 font-medium')}
                        title={a.median_write_hours != null ? `Reply written after ${wait(a.median_write_hours)} (median), ${a.replies} replies` : undefined}
                      >
                        {isSlow(a.median_wait_hours) && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-label="Over a day" />}
                        {wait(a.median_wait_hours)}
                      </td>
                      <td className="py-2 pr-3 text-right">{pct(a.replies_within_4h_pct)}</td>
                      <td className="py-2 text-right">{pct(a.scheduled_pct)}</td>
                    </tr>
                    {open && <DayRows agent={a} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Not counted: phone calls, reading tickets and work in other tools. Messages sent by automations through the API are excluded.
      </p>
    </Card>
  );
}
