/* eslint-disable no-control-regex -- control chars are used as internal placeholders */
/**
 * Tiny, safe markdown -> HTML renderer for chat replies. Every piece of text is
 * HTML-escaped before any markup is added, raw HTML is never passed through,
 * and links are limited to http(s)/mailto. Supports headings, paragraphs,
 * bullet/numbered lists, blockquotes, fenced and inline code, bold, italic,
 * strikethrough and links.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns the URL if it is an allowed absolute link, otherwise null. */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/[\u0000-\u001f\u007f\s]/.test(url)) return null;
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Inline formatting on raw (unescaped) text. */
export function renderInline(src: string): string {
  // Pull out code spans first so their contents are not formatted.
  const codes: string[] = [];
  let s = src.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // Links: [text](url) before escaping so the url is checked in raw form.
  const links: string[] = [];
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const ok = safeUrl(url);
    if (!ok) return m;
    links.push(
      `<a href="${escapeHtml(ok)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`,
    );
    return `\u0001${links.length - 1}\u0001`;
  });
  s = escapeHtml(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  // Placeholders carry only digits, so restoring them cannot inject markup.
  return s
    .replace(/\u0001(\d+)\u0001/g, (_m, i: string) => links[Number(i)]!)
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]!);
}

export function renderMarkdown(src: string): string {
  // Control characters are used internally as placeholders; drop any from input.
  const lines = src.replace(/[\u0000\u0001]/g, '').split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  const isBlockStart = (l: string) =>
    /^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>\s?)/.test(l) || l.trim() === '';

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(h[1]!.length + 2, 6); // keep headings small inside the panel
      out.push(`<h${level}>${renderInline(h[2]!)}</h${level}>`);
      i++;
      continue;
    }
    const list = /^\s*(?:([-*+])|(\d+)[.)])\s+/.exec(line);
    if (list) {
      const ordered = !list[1];
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i]!);
        if (!m || !m[1] !== ordered) break;
        items.push(`<li>${renderInline(m[3]!)}</li>`);
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!))
        body.push(lines[i++]!.replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderInline(body.join(' '))}</blockquote>`);
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && !isBlockStart(lines[i]!)) para.push(lines[i++]!);
    out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
  }
  return out.join('');
}
