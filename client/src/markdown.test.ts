import { describe, expect, it } from 'vitest';
import { renderMarkdown, safeUrl } from './markdown.js';

describe('renderMarkdown', () => {
  it('renders basic formatting', () => {
    expect(renderMarkdown('Hello **bold** and *it* and `code`')).toBe(
      '<p>Hello <strong>bold</strong> and <em>it</em> and <code>code</code></p>',
    );
  });

  it('renders lists, headings and fences', () => {
    expect(renderMarkdown('# T\n- a\n- b\n\n1. x\n2. y')).toBe(
      '<h3>T</h3><ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>',
    );
    expect(renderMarkdown('```\n<b>x</b>\n```')).toBe(
      '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>',
    );
  });

  it('escapes raw html', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('only allows safe link protocols', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a');
    expect(renderMarkdown('[x](data:text/html,hi)')).not.toContain('<a');
    const ok = renderMarkdown('[docs](https://example.com/a?b=1&c=2)');
    expect(ok).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(ok).toContain('rel="noopener noreferrer"');
    expect(safeUrl('java\nscript:alert(1)')).toBeNull();
  });

  it('cannot break out of attributes or inject via placeholders', () => {
    const html = renderMarkdown('[x](https://a.com/"onmouseover="alert(1))');
    expect(html).not.toMatch(/\sonmouseover=/);
    expect(html).toContain('&quot;onmouseover=&quot;');
    expect(renderMarkdown('a\u00000\u0000 `c`')).toBe('<p>a0 <code>c</code></p>');
    expect(renderMarkdown('`<b>`')).toBe('<p><code>&lt;b&gt;</code></p>');
  });
});
