import { t as tr, language } from './i18n';
import { useState } from 'react';
import type { CalendarEntry, Meeting } from '../shared/model';
import { useApi } from './api-context';
export function CalendarLink({
  meeting: m,
  editable,
  enabled,
  actorId,
  run,
  update,
}: {
  meeting: Meeting;
  editable: boolean;
  enabled: boolean;
  actorId: string;
  run: (fn: () => Promise<void>) => void;
  update: (m: Meeting) => void;
}) {
  const { request } = useApi();
  const [show, setShow] = useState(false);
  const organizer = actorId;
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const link = (entry: CalendarEntry) =>
    run(async () => {
      update(
        await request<Meeting>(`/meetings/${m.id}/calendar-link`, {
          revision: m.revision,
          eventId: entry.eventId,
        }),
      );
      setShow(false);
    });
  const safeLink = (url: string | null) => (url && new URL(url).protocol === 'https:' ? url : undefined);
  return (
    <section className="calendar-link">
      <div className="row wrap">
        <span className="small muted">
          {m.calendar
            ? `${m.calendar.cancelled ? tr('calendar.cancelled') : ''}${new Date(m.calendar.start).toLocaleString(language())} – ${new Date(m.calendar.end).toLocaleTimeString(language(), { hour: '2-digit', minute: '2-digit' })}${m.calendar.occurrence ? tr('calendar.seriesOccurrence') : ''}`
            : tr('calendar.calendarEventLinkedYet')}
        </span>
        {m.calendar?.joinUrl && !m.calendar.cancelled && (
          <a className="button" href={safeLink(m.calendar.joinUrl)} target="_blank" rel="noreferrer">
            {tr('calendar.joinTeams')}
          </a>
        )}
        {m.calendar?.webUrl && (
          <a className="button" href={safeLink(m.calendar.webUrl)} target="_blank" rel="noreferrer">
            {tr('calendar.openOutlook')}
          </a>
        )}
        {editable && m.status !== 'completed' && (
          <button
            className="button"
            disabled={!enabled}
            onClick={() => (m.calendar ? link(m.calendar) : setShow(!show))}
          >
            {m.calendar ? tr('calendar.syncEvent') : tr('calendar.linkCalendar')}
          </button>
        )}
      </div>
      {show && (
        <div className="result-card">
          <h3>{tr('calendar.selectExistingEvent')}</h3>
          <p>{tr('calendar.invitationsSentCalendarData')}</p>
          <button
            className="button"
            disabled={!organizer}
            onClick={() =>
              run(async () => {
                const result = await request<{ entries: CalendarEntry[]; truncated: boolean }>(
                  `/calendar?organizerId=${encodeURIComponent(organizer)}`,
                );
                setEntries(result.entries);
                setTruncated(result.truncated);
                setLoaded(true);
              })
            }
          >
            {tr('calendar.loadEvents')}
          </button>
          {truncated && <p className="notice">{tr('calendar.onlyFirst200Events')}</p>}
          {loaded && !entries.length && <p>{tr('calendar.eventsFoundPeriod')}</p>}
          {entries.map(e => (
            <div className="meeting-row" key={e.eventId}>
              <div className="meeting-title">
                <strong>{e.title}</strong>
                <span>{new Date(e.start).toLocaleString(language())}</span>
              </div>
              <button className="button" onClick={() => link(e)}>
                {tr('calendar.connect')}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
