import { expect, it } from 'vitest';
import { renderBasicMarkdown } from '../../src/lib/store/markdown';

it('renders paragraphs, line breaks, bold, italic and bullet lists', () => {
  expect(renderBasicMarkdown('One **bold** and *soft* line\nnext line\n\n- a\n- b')).toBe(
    '<p>One <strong>bold</strong> and <em>soft</em> line<br>next line</p><ul><li>a</li><li>b</li></ul>',
  );
});

it('escapes HTML so admin text cannot inject markup', () => {
  const out = renderBasicMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> "q" & \'s\'');
  expect(out).not.toMatch(/<script|<img/);
  expect(out).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt; &quot;q&quot; &amp; &#39;s&#39;</p>');
});

it('returns nothing for empty input', () => {
  expect(renderBasicMarkdown('  \n\n ')).toBe('');
});
