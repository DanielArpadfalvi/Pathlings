/** Supporters' published levels carry a leaf mark after the author name (§2). */
export const SUPPORTER_MARK = '❦';

export function supporterAuthor(author: string, supporter: boolean): string {
  const name = author.trim();
  if (!supporter || !name || name.endsWith(SUPPORTER_MARK)) return author;
  return `${name.slice(0, 22)} ${SUPPORTER_MARK}`;
}
