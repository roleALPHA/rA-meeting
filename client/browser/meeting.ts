import { z } from 'zod';
import { assert } from '../../shared/model';
import { graph, type BrowserHost } from './host';

/** The Teams meeting the side panel runs in, as Microsoft Graph describes its chat. */
export type MeetingInfo = {
  /** Stable reference roleALPHA keys the meeting's scenario on. */
  ref: string;
  chatId: string;
  title: string;
};

const chat = z.looseObject({
  id: z.string().min(1).max(500),
  topic: z.string().max(500).nullish(),
  chatType: z.string().max(50).nullish(),
});
const members = z.looseObject({
  value: z.array(z.looseObject({ email: z.string().max(320).nullish() })).max(1000),
  '@odata.nextLink': z.string().nullish(),
});
const email = z.email().max(320);

const chatPath = (chatId: string) => `/chats/${encodeURIComponent(chatId)}`;

/**
 * The meeting behind the Teams context, or null outside a meeting. A recurring series shares one chat, so the
 * reference is the chat; roleALPHA keeps one OPEN scenario per reference, and a submitted scenario makes room for the
 * next occurrence.
 */
export async function currentMeeting(host: BrowserHost): Promise<MeetingInfo | null> {
  const chatId = host.teams?.chatId;
  if (!chatId) return null;
  const found = chat.parse(await (await graph(host, `${chatPath(chatId)}?$select=id,topic,chatType`)).json());
  if (found.chatType && found.chatType !== 'meeting') return null;
  return { ref: `teams-chat:${found.id}`, chatId: found.id, title: found.topic?.trim() || '' };
}

/** E-mail addresses of everybody in the meeting chat: the invitees and whoever joined. */
export async function participants(host: BrowserHost, meeting: MeetingInfo): Promise<string[]> {
  const found = new Set<string>();
  let path: string | null = `${chatPath(meeting.chatId)}/members`;
  for (let page = 0; path && page < 10; page++) {
    const result = members.parse(await (await graph(host, path)).json());
    for (const member of result.value) {
      const address = email.safeParse(member.email?.trim().toLowerCase());
      if (address.success) found.add(address.data);
    }
    const next: string | null | undefined = result['@odata.nextLink'];
    path = next?.startsWith('https://graph.microsoft.com/v1.0/')
      ? next.slice('https://graph.microsoft.com/v1.0'.length)
      : null;
  }
  return [...found].slice(0, 500);
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Posts plain text, line by line, and optional links into the meeting chat as the signed-in user. */
export async function postToMeetingChat(
  host: BrowserHost,
  meeting: MeetingInfo,
  message: { text: string; link?: { label: string; url: string } | null },
) {
  const text = message.text.trim();
  assert(text.length > 0 && text.length <= 4000, 'error.meeting.chatMessageInvalid');
  const lines = text.split('\n').map(escape).join('<br>');
  let link = '';
  if (message.link) {
    const url = new URL(message.link.url);
    assert(url.protocol === 'https:', 'error.meeting.chatMessageInvalid');
    link = `<br><a href="${escape(url.href)}">${escape(message.link.label)}</a>`;
  }
  await graph(host, `${chatPath(meeting.chatId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: { contentType: 'html', content: `<p>${lines}${link}</p>` } }),
  });
}
