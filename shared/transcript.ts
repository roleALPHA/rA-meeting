import { assert, type Segment } from './model.js';
export function parseTranscript(raw: string): Segment[] {
  assert(raw.length <= 1_000_000, 'Transkript ist zu groß (max. 1 MB).', 413);
  const source = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const segments: Segment[] = [];
  const clean = (s: string) =>
    s
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  for (const block of source.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const idx = lines.findIndex(l => /-->/.test(l));
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
