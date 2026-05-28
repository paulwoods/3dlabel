# 3D Label Designer

A browser-based tool for designing and exporting 3D-printable labels. Configure dimensions, text, and colors interactively, then download print-ready files.

## Features

- Rounded-rectangle label plate with configurable dimensions and corner radius
- Raised 3D text with multiple font choices
- Live 3D preview with orbit controls (rotate, zoom, pan)
- Export to **STL** (single-body) or **3MF** (plate and text as separate parts for multi-filament printers)

## Usage

Open `index.html` directly in a browser — no build step or server required.

### Controls

| Action | Input |
|---|---|
| Rotate | Left-drag |
| Zoom | Scroll |
| Pan | Right-drag |

### Parameters

| Field | Description |
|---|---|
| Length / Width | Label plate size in mm |
| Corner Radius | Rounding on plate corners (0 = sharp) |
| Thickness | Plate depth in mm |
| Label Text | Text embossed on the plate |
| Font Style | Choose from 11 included typefaces |
| Size | Font size in mm |
| Raise | How far the text stands above the plate surface |
| Plate Color | Color of the label body |
| Text Color | Color of the raised text |

### Export formats

- **STL** — single merged mesh, works with any slicer
- **3MF** — plate and text exported as separate objects; assign different filaments in your slicer for multi-color prints

## Dependencies

Loaded from CDN — no installation needed:

- [Three.js](https://threejs.org/) r184 — 3D rendering and geometry
