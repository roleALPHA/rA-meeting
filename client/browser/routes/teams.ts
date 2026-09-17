import { event } from '../../../shared/domain';
import type { Meeting, TeamsRecordingResult } from '../../../shared/model';
import { loadSettings } from './settings';
import type { RouteContext } from './types';

type OnlineMeeting = { id: string; participants?: { organizer?: { identity?: { user?: { id?: string } } } } };

/** The Teams online meeting behind a join link, as visible to the signed-in user. */
export async function findOnlineMeeting({ read }: RouteContext, joinUrl: string): Promise<OnlineMeeting | null> {
  const filter = encodeURIComponent(`JoinWebUrl eq '${joinUrl.replaceAll("'", "''")}'`);
  const meetings = (await (await read(`/me/onlineMeetings?$filter=${filter}`)).json()) as { value: OnlineMeeting[] };
  return meetings.value.length === 1 ? meetings.value[0] : null;
}

/**
 * Applies the workspace's Teams recording setting to the linked online meeting. Only the organizer
 * can change meeting options; recurring series share one online meeting, so the option applies to
 * the whole series. Failures never block linking: the result is recorded on the meeting instead.
 */
export async function applyTeamsRecording(ctx: RouteContext, m: Meeting) {
  if (!m.calendar?.joinUrl) return;
  const { teamsRecording: mode } = await loadSettings(ctx);
  if (mode === 'off') return;
  let result: TeamsRecordingResult['result'];
  try {
    const online = await findOnlineMeeting(ctx, m.calendar.joinUrl);
    if (!online) result = 'not-found';
    else if (online.participants?.organizer?.identity?.user?.id !== ctx.actor.id) result = 'not-organizer';
    else {
      await ctx.read(`/me/onlineMeetings/${encodeURIComponent(online.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowTranscription: true, recordAutomatically: mode === 'record-and-transcribe' }),
      });
      result = 'applied';
    }
  } catch {
    result = 'failed';
  }
  m.calendar.teamsRecording = { mode, result, at: new Date().toISOString(), by: ctx.actor.id };
  const detail =
    result === 'applied'
      ? mode === 'record-and-transcribe'
        ? 'Teams: automatische Aufzeichnung und Transkription gesetzt.'
        : 'Teams: Transkription erlaubt.'
      : `Teams-Option nicht gesetzt (${result}).`;
  event(m, ctx.actor, 'teams.recording', detail);
}
