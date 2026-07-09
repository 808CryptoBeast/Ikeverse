# Ikeverse — The Living Knowledge Globe

**Ikeverse** is an interactive 3D knowledge graph that maps ancestral wisdom traditions from around the world onto a rotating WebGL globe. It connects **55 civilizational traditions**, **113 historically grounded links**, and **65 named stars** (with Hawaiian moʻolelo and 8 cultural star-naming traditions) into a single explorable field — built from Hawaiʻi as part of the [Pikoverse](https://pikoverse.xyz/) ecosystem.

🔗 **Live site:** https://808cryptobeast.github.io/Ikeverse/

![Ikeverse — The Living Knowledge Globe](Ikeverse_org/assets/images/thelivingknowledge.png)

## What it is

Ikeverse ("Ka Ulana ʻIke — The Weaving of Knowledge") is a Three.js-powered 3D globe where each node is a culture — Kemet, Kanaka Maoli, Haudenosaunee, San, Sumer, Sakha, and dozens more — and each arc between nodes is a real, historically documented connection (trade routes, shared astronomy, governance parallels, diaspora networks). Click a culture to read its story, research links, and cross-cultural bridges to modern science and technology. Run the guided tour to be walked through featured traditions. Switch to the flat map view, scrub the historical timeline, or compare two cultures side by side.

**Core features**
- Interactive 3D WebGL globe (Three.js + OrbitControls) with force-directed connection arcs
- 55 culture nodes with region, era, symbol, tags, description, and curated open-access reading links
- 113 historically grounded cross-cultural connections
- Guided tour mode and a searchable/filterable culture index
- Flat map view alongside the 3D globe
- Historical timeline scrubber
- Culture comparison panel
- Touch-first mobile support (single-finger drag-to-rotate, tap-to-select, responsive layout)

## Tech stack

Static, dependency-free front end — no build step, no framework, no package manager required.

| Layer | Tech |
|---|---|
| 3D rendering | [Three.js](https://threejs.org/) r0.132.2 + `OrbitControls` |
| Animation | [GSAP](https://gsap.com/) |
| Map data | [D3](https://d3js.org/) v7 + [TopoJSON](https://github.com/topojson/topojson) |
| Everything else | Vanilla HTML / CSS / JS |

All third-party libraries load from CDN (see the `<script>` tags in `Ikeverse_org/cosmic-weave.html`) — there is nothing to `npm install`.

## Project structure

```
Ikeverse/
├── index.html                      # Landing page (hero, knowledge crawl, featured culture nodes)
├── LICENSE                         # MIT
└── Ikeverse_org/
    ├── cosmic-weave.html           # The 3D globe app — the core product
    ├── roadmap.html                # Public roadmap / journey page
    ├── whitepaper.html             # Project whitepaper
    ├── admin.html                  # Internal admin/content tooling
    ├── css/
    │   ├── style.css                # Shared site chrome (nav, drawer, footer)
    │   └── cosmic-weave.css         # Globe app styling
    ├── js/
    │   ├── cosmic-weave.js          # Globe engine: rendering, graph, UI, interactions
    │   └── cosmic-weave-mobile.js   # Mobile/touch-only patch layer (loaded after cosmic-weave.js)
    ├── docs/                        # Content data (JSON)
    │   ├── cultures.json            # 55 cultures + 113 links (source of truth for the graph)
    │   ├── stars.json               # 65 named stars with RA/Dec + naming traditions
    │   ├── culture-resources.json   # Reading links / citations per culture
    │   ├── culture-comparison.json  # Data backing the culture-compare panel
    │   ├── culture-enrichment.json  # Supplementary culture metadata
    │   ├── cultures-overrides.json  # Manual content overrides
    │   └── links_suggested.json     # Candidate connections pending review
    └── assets/images/               # Logos, backgrounds, media
```

## Running locally

No build step — serve the repo root with any static file server and open `index.html`:

```bash
# from the repo root
python -m http.server 8000
# then visit http://localhost:8000/
```

Or, since it's just static files, any equivalent (`npx serve`, VS Code Live Server, etc.) works too.

## Data model

`Ikeverse_org/docs/cultures.json` is the source of truth for the graph:

```json
{
  "cultures": [ /* 55 entries: id, name, coords [lon,lat], region, era, symbol, tags, desc, ... */ ],
  "links":    [ /* 113 entries: source, target, relationship */ ],
  "meta":     { "version": "2.0", "cultures": 55, "links": 64, "generated": "..." }
}
```

`stars.json` holds 65 named stars with real RA/Dec coordinates and naming traditions spanning Hawaiian, Arabic, Aboriginal Australian, and more. The remaining `docs/*.json` files layer on research citations, comparison data, and manual content overrides on top of the base culture records.

## Part of the Pikoverse ecosystem

Ikeverse is one platform within [**Pikoverse**](https://pikoverse.xyz/) — "a community-powered knowledge ecosystem built from Hawaiʻi, weaving Aloha, indigenous culture, history, blockchain education, and emerging technologies into one living platform." Pikoverse's own design system reserves a brand identity for Ikeverse (`--color-ikeverse: #9d50bb`, a purple in the same family as this site's `rgba(157,80,255)` accent), and links back here as `https://808cryptobeast.github.io/Ikeverse/`.

Sibling / related projects in the same ecosystem:

| Project | Relationship | Link |
|---|---|---|
| **Pikoverse** | Parent ecosystem hub | https://pikoverse.xyz/ |
| **IkeStar** | Sky-focused observatory layer — Hawaiian star formations, wayfinding, moʻolelo. Linked from the "Star Map" control in the globe app. | https://808cryptobeast.github.io/Ikestar/ |
| **AMP** | Marketplace / creative hub in the wider Pikoverse ecosystem | via pikoverse.xyz |
| **DigitalVerse** | Blockchain/Web3 education universe, positioned within the broader Ikeverse learning vision | via pikoverse.xyz |
| **NaluLF** | XRPL forensics tooling | via pikoverse.xyz |

**Notes for future cross-project work:**
- Shared tagline: *"Ka Ulana ʻIke — The Weaving of Knowledge"* is used verbatim on both Ikeverse and Pikoverse — keep it consistent if it's reused elsewhere.
- Ikeverse's brand accents are cyan (`rgba(0,247,255,.9)`), gold (`rgba(255,215,0,.88)`), and purple (`rgba(157,80,255,.85)`) — the purple is intentionally close to Pikoverse's reserved `--color-ikeverse` token.
- The stats quoted on the homepage (55 cultures / 113 connections / 65 stars) are pulled directly from `docs/cultures.json` and `docs/stars.json` — update the copy in `index.html` if those datasets grow.
- This repo has no build tooling and deploys as static files via GitHub Pages from `808CryptoBeast/Ikeverse` — any new sibling project linking here should point at `https://808cryptobeast.github.io/Ikeverse/`.

## License

[MIT](LICENSE) © 2025 Kaualoha
