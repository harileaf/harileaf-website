import { expect, it } from 'vitest';
import { renderBasicMarkdown } from '../../src/lib/store/markdown';

it('renders basic markdown and escapes HTML so admin text cannot inject markup', () => {
  expect(renderBasicMarkdown('One **bold** and *soft* line\nnext line\n\n- a\n- b')).toBe(
    '<p>One <strong>bold</strong> and <em>soft</em> line<br>next line</p><ul><li>a</li><li>b</li></ul>',
  );
  expect(renderBasicMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> "q" & \'s\'')).toBe(
    '<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt; &quot;q&quot; &amp; &#39;s&#39;</p>',
  );
});
