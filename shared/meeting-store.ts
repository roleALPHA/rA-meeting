import { AppError, type Actor, type Meeting, type MeetingSummary, type Segment } from './model.js';
import { getMeeting, saveMeeting } from './domain.js';
import type { Repository } from './storage/repository.js';

/** Transcript records are immutable and identified by meeting and content hash. */
export type TranscriptRecord = { meetingId: string; hash: string; segments: Segment[] };
export const transcriptRecordId = (meetingId: string, hash: string) => `${meetingId}.${hash}`;

/** Hash of the transcript that is known to be stored as a separate record for this meeting object. */
const storedTranscript = new WeakMap<Meeting, string>();

/**
 * Loads a meeting with its transcript segments. Meetings saved before transcripts were split out
 * still carry the segments inline and are returned unchanged.
 */
export async function loadMeeting(store: Repository, actor: Actor, id: string, write = false): Promise<Meeting> {
  const m = await getMeeting(store, actor, id, write);
  if (!m.transcript.length && m.transcriptHash && m.transcriptSegments) {
    const record = await store.get<TranscriptRecord>(
      actor.tenantId,
      'transcript',
      transcriptRecordId(m.id, m.transcriptHash),
    );
    m.transcript = record.segments;
    storedTranscript.set(m, m.transcriptHash);
  }
  return m;
}

/**
 * Saves a meeting without its transcript segments. A new transcript is written as its own record
 * first, so the meeting never references a missing transcript. Legacy inline transcripts move to a
 * record on their next save.
 */
export async function storeMeeting(store: Repository, actor: Actor, m: Meeting): Promise<Meeting> {
  const hash = m.transcriptHash;
  if (m.transcript.length && hash && storedTranscript.get(m) !== hash) {
    const record: TranscriptRecord = { meetingId: m.id, hash, segments: m.transcript };
    try {
      await store.save(actor.tenantId, 'transcript', transcriptRecordId(m.id, hash), 1, record);
    } catch (error) {
      // Same meeting and hash means identical content was stored before.
      if (!(error instanceof AppError && error.status === 409)) throw error;
    }
    storedTranscript.set(m, hash);
  }
  const persisted: Meeting = { ...m, transcript: [], transcriptSegments: m.transcript.length };
  await saveMeeting(store, actor, persisted, m.revision);
  m.revision = persisted.revision;
  m.updatedAt = persisted.updatedAt;
  m.transcriptSegments = persisted.transcriptSegments;
  return m;
}

export function summarize({ transcript, ...meeting }: Meeting): MeetingSummary {
  return { ...meeting, transcriptSegments: meeting.transcriptSegments ?? transcript.length };
}
