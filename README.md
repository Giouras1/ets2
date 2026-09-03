# THIS IS VIBE CODED SITE USED CHATGPT-PLUS

# ETS2 DEF Forge v2

A dependency-free browser tool for focused Euro Truck Simulator 2 map-definition work.

## Pages

- `index.html` — full project builder for countries, cities, existing-company depot assignments, and ferry/port definitions.
- `single-def-builder.html` — simple one-definition-at-a-time builder. Pick the type, fill the form, copy the complete `SiiNunit` text, or export it as `.def` / `.sii`.

## Run

Open either HTML file directly in a modern browser. No server or internet connection is required.

You can also serve the directory locally:

```bash
python -m http.server 8080
```

## v2 fixes / changes

- Restored the required `styles.css` and `app.js` alongside `index.html`.
- Increased font sizes, contrast, spacing, form controls, preview text, and focus visibility.
- Added a clipboard fallback so Copy works more reliably when opened from `file://`.
- Corrected `iso_country_code` output to token syntax (unquoted, lowercase token form).
- Removed the incorrect `pos` output from `city_data`; city physical position comes from the Map Editor.
- Clarified the `trailer_standalone` control wording.
- Added the new single-definition builder requested for quick copy/paste use.

## Definition scope

1. Countries (`country_data`)
2. Cities (`city_data`)
3. Existing-company depot assignments (`company_def`)
4. Ferry/port terminals and one-way connections (`ferry_data`, `ferry_connection`)

## About `.def`

`.def` is **not** the normal ETS2 serialized-unit extension. ETS2 definition data normally uses `.sii` and `.sui`. The quick builder's `.def` export is only a convenient plain-text copy requested for this workflow. The page always shows the suggested actual `.sii` destination path as well.

## Important

ETS2 definition fields evolve. Use these tools for stable relationships and common fields, then compare version-specific attributes against the `def.scs` extracted from the exact ETS2 version you target.

The tools do **not** create map geometry, prefabs, models, buildings, cargo definitions, or custom `company_permanent` units.
