import fontFaces from '../fonts.css?inline';

export type Theme = 'light' | 'dark' | 'contrast';

/** Teams reports `default`, `dark` or `contrast`; anything unknown falls back to light. */
export function teamsTheme(value: string | undefined): Theme {
  return value === 'dark' || value === 'contrast' ? value : 'light';
}

/**
 * The @font-face rules with each bundled file name replaced by the URL the host serves it from. A face whose file
 * the host did not provide is left out, so the browser falls back to the system font instead of requesting a
 * relative URL from the SharePoint page.
 */
export function fontFaceCss(urls: Record<string, string>): string {
  return (fontFaces.match(/@font-face\s*{[^}]*}/g) ?? [])
    .map(face => {
      const file = face.match(/url\('([^']+)'\)/)?.[1];
      const url = file && urls[file];
      return url ? face.replace(`url('${file}')`, `url(${JSON.stringify(url)})`) : '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Registers the brand fonts on the page, once.
 *
 * The one deliberate exception to "no document-wide CSS": browsers ignore @font-face inside a shadow root, and a
 * font registered on the document is visible inside it. The element contains @font-face rules only, no
 * selectors, and the "rA"-prefixed family names cannot collide with fonts the SharePoint page defines.
 */
export function installFonts(urls: Record<string, string> | undefined, doc: Document = document): void {
  if (!urls || doc.head.querySelector('style[data-ra-fonts]')) return;
  const css = fontFaceCss(urls);
  if (!css) return;
  const style = doc.createElement('style');
  style.dataset.raFonts = '';
  style.textContent = css;
  doc.head.append(style);
}
