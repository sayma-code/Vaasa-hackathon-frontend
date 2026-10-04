# Automatic product tagging in a digital twin: website

**Live demo:** https://YOUR-USERNAME.github.io/YOUR-FRONTEND-REPO/

A 3D digital twin of a scanned switchgear room in which every ABB Relion 615 relay was found and
tagged automatically. Clicking a tag opens the asset's details and documentation.

- **Overview**: the room as a coloured point cloud, with a tag on each relay.
- **Walk inside**: the scan photos as a look-around panorama, with the tags pinned to the relays.
- **Photo detector** (local demo only): submit a photo and the trained detector marks the product in it.

The tags and the data in `data/` are produced by the algorithm in the separate backend repository:
YOUR-BACKEND-REPO-ADDRESS

## One site, two ways to run it

The site checks whether the backend's demo server is reachable and adapts:

| | Online (GitHub Pages) or any static server | Local demo with the backend server |
|---|---|---|
| 3D twin and walk inside | Yes | Yes |
| Documentation | Shown from ABB's library | Shown from the server's local copies, works offline |
| Photo detector | Hidden | Available |

## Running it locally

As a static site, from this folder:

```
python -m http.server 8766
```

Then open http://localhost:8766. For the full demo, place the backend repository beside this folder
and run its `start_demo.bat`.

## Files

| Path | Content |
|---|---|
| `index.html`, `app.js` | The 3D twin and walk-inside view |
| `detect.html`, `detect.js` | The photo detector page |
| `docviewer.js` | The in-page document viewer |
| `data/` | Point cloud, scan photos, tags and asset close-ups, built by the backend |
| `lib/` | three.js |

## Sources

- Scan: provided by the hackathon organisers.
- Documentation: public ABB 615 series documents.
- 3D rendering: three.js.
"# Vaasa-hackathon-frontend" 
