# Brand files

The roleALPHA logo after the rebranding of 10/2026: "ring in ring", the signet from which an α emerges. The rules are in the Figma styleguide "roleALPHA-Brand" (pp. 11–16); finished files are delivered from Directus Media (`roleALPHA › Brand › Logos`). The files here are copies, not the source.

`tests/brand.test.ts` checks that every file is vector outlines only (no `<text>`, no embedded image), that `client/BrandMark.tsx` and the app icon draw the same path as `rolealpha-icon.svg`, and that the web part manifests carry the app icon.

## Files

| File                     | Content                                     | Used for                                                                                   |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `rolealpha-icon.svg`     | Flat signet, Tiefgrün, tight square viewBox | Geometry master for the inline `BrandMark` in the sidebar (takes `currentColor` per theme) |
| `rolealpha-app-icon.svg` | Flat signet in Creme on a Tiefgrün tile     | Favicon of the local preview, `iconImageUrl` of both web parts (base64 in the manifests)   |

The sidebar shows the signet at 28–36 px. The styleguide allows the gradient signet only from 48 px, so the app uses the **flat** signet everywhere.

## Origin

Directus Media holds the signet only with its gradient (`rolealpha_signet_digital_*`), and its `creme_auf-tiefgruen` file is a 1400 × 520 banner, not a square tile. The flat signet therefore comes from rA-app (`client/public/brand/rolealpha-icon.svg`), which exported it from the Figma component "Kleine Größen". The geometry matches the Directus signet (`5ce29629-1db1-487f-8dc6-fc6d9240612f`, same aspect ratio). Once Directus provides a flat signet, take it from there.

The app icon follows rA-app's `rolealpha-app-icon.svg`: the flat signet at 62 % of the tile edge, centred. The viewBox of `rolealpha-icon.svg` is the measured bounding box of the path (105.912 × 107.622), widened to a square.

## Teams icons

`spfx/teams/<component-id>_color.png` (192 × 192) and `_outline.png` (32 × 32) are rendered from the same path:

- colour: the app icon full-bleed (no rounded corners, Teams rounds the tile itself), signet 62 % high, so it stays inside Teams' 120 px safe area;
- outline: the signet in white on transparent, with 2 units of padding.

To regenerate, open an HTML page containing the SVG at the target size in headless Chrome and take a screenshot with a transparent background:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --force-device-scale-factor=1 --default-background-color=00000000 --window-size=192,192 \
  --screenshot=color.png file:///path/to/teams-color.html
```

Copy the result to both component IDs.
