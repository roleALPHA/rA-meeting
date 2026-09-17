import { assert, type Segment } from './model.js';
export function parseTranscript(raw: string): Segment[] {
  assert(raw.length <= 1_000_000, 'error.meetings.transcriptTooLargeMax', 413);
  const source = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const segments: Segment[] = [];
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const clean = (s: string) => {
    // Remove cue tags until none are left, so a tag split by another tag cannot reassemble.
    let text = s;
    for (let previous = ''; previous !== text;) {
      previous = text;
      text = text.replace(/<[^<>]*>/g, '');
    }
    // One pass: "&amp;lt;" is the text "&lt;", not "<".
    return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name]).trim();
  };
  for (const block of source.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    // WebVTT cue timing line (`00:00:01.000 --> 00:00:03.500`).
    const idx = lines.findIndex(l => l.includes('-->'));
    if (idx < 0) continue;
    const times = lines[idx].match(/([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (!times) continue;
    const content = lines.slice(idx + 1).join(' ');
    const voice = content.match(/<v(?:\.[^ >]+)?\s+([^>]+)>/);
    const plain = clean(content);
    if (plain)
      segments.push({
        id: `s${segments.length + 1}`,
        start: times[1],
        end: times[2],
        speaker: voice?.[1] ?? '',
        text: plain,
      });
  }
  if (segments.length) return segments;
  for (const line of source.split('\n').filter(l => l.trim())) {
    const match = line.match(/^\[([\d:.]+)\s*-\s*([\d:.]+)\]\s*([^:]+):\s*(.+)$/);
    segments.push({
      id: `s${segments.length + 1}`,
      start: match?.[1] ?? '',
      end: match?.[2] ?? '',
      speaker: match?.[3] ?? '',
      text: match?.[4] ?? line.trim(),
    });
  }
  return segments;
}
