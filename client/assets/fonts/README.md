# Bundled fonts

rA Meetings loads **no** font from another server. The app must run entirely inside the customer's Microsoft 365 tenant (see `CLAUDE.md`), so the fonts ship in the SharePoint package and are served from the tenant's ClientSideAssets.

`tests/brand.test.ts` keeps this machine-checked: every `@font-face` file in `client/fonts.css` exists here, no file here is unused, and no font service address appears in the stylesheets.

## Origin

The files are copied from rA-app (`client/public/fonts/`), which took them from the Fontsource npm packages, version 5.3.0. They are deliberately not an npm dependency.

| Family           | Package                              | Files here                                          |
| ---------------- | ------------------------------------ | --------------------------------------------------- |
| IBM Plex Sans    | `@fontsource-variable/ibm-plex-sans` | variable, `wght` 100–700, latin + latin-ext, normal |
| IBM Plex Mono    | `@fontsource/ibm-plex-mono`          | 400 and 600, latin + latin-ext, normal              |
| Instrument Serif | `@fontsource/instrument-serif`       | 400, latin + latin-ext, normal                      |

All three are licensed under the **SIL Open Font License 1.1** — see `OFL-*.txt` in this directory. Unlike rA-app, rA Meetings uses no italics and no mono weights besides 400 and 600, so those files are left out to keep the package small.

## Updating

Copy the `.woff2` files from rA-app (or from the Fontsource tarball's `files/`) and update `client/fonts.css`. Take `unicode-range` and `font-weight` from Fontsource's CSS rather than typing them: a shortened range silently drops single characters to the system font.
