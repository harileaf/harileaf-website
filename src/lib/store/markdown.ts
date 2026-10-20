/**
 * A deliberately tiny Markdown subset for admin-entered product text:
 * paragraphs, line breaks, **bold**, *italic* and "- " bullet lists. HTML is
 * escaped first, so nothing an admin types can inject markup or scripts.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');

export function renderBasicMarkdown(md: string): string {
  const blocks = md.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter((b) => b.trim());
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

/**
 * Articles (Keystatic, written by the team): the same subset plus "## " / "### "
 * headings and [links](/path) — only site paths or https URLs, never other
 * schemes. A URL may hold one level of parentheses (…/Rice_(grain)).
 */
export function renderArticleMarkdown(md: string): string {
  const link = (html: string) =>
    html.replace(/\[([^\]]+)\]\(((?:\/(?!\/)|https:\/\/)(?:[^\s()]|\([^\s()]*\))*)\)/g, (_m, text: string, href: string) => `<a href="${href}">${text}</a>`);
  const blocks = md.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter((b) => b.trim());
  return blocks
    .map((block) => {
      const h = /^(#{2,3})\s+(.+)$/.exec(block.trim());
      if (h && !block.trim().includes('\n')) return `<h${h[1].length}>${link(inline(h[2]))}</h${h[1].length}>`;
      return link(renderBasicMarkdown(block));
    })
    .join('');
}
