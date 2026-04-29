# Polyphonic Automata

An interactive Web Audio prototype for turning Conway's Game of Life into a spatial, polyphonic soundscape.

The page runs as a small browser-based instrument: a cellular automata grid evolves in real time, and the viewer can click or drag directly on the matrix to add or remove cells while the system is running. The visual field is analyzed into audio nodes, then mapped to pitch, gain, filter movement, and stereo position.

## Concept

Polyphonic Automata explores an interactive generative audio system based on cellular lifeforms. Instead of treating each white pixel as an individual sound event, the system builds a softened density field from the evolving grid and tracks larger blob-like formations as musical voices.

This helps address a central friction in sonifying Conway's Game of Life: many meaningful lifeforms are not cleanly connected shapes. A glider or oscillator may be visually perceived as one entity even when its cells are separated. The prototype therefore uses decay trails and density clustering to define more stable sonic objects.

## Features

- Real-time Conway's Game of Life simulation.
- Click and drag interaction directly on the grid.
- Three data views:
  - Raw Matrix: the current binary cell state.
  - Audio Release Tail: decaying cell history used for smoother audio releases.
  - Blob Clustering: detected density regions, centroids, and pan values.
- Web Audio synthesis with four smoothed voices.
- Spatial stereo mapping based on blob centroid position.
- Area, density, and vertical position mapped to gain, timbre, and pitch.

## Audio Mapping

- `x position -> stereo pan`
- `y position -> pitch`
- `blob area -> voice gain`
- `density energy -> low-pass filter movement`
- `release trail -> smooth voice fade-out`

The audio is intentionally smoothed so that lifeforms do not produce abrupt gain or pan jumps when they split, merge, or disappear.

## Run Locally

Open `index.html` directly in a modern browser.

For audio, click the `Audio` button after the page loads. Browsers require a user gesture before starting Web Audio.

## Files

- `index.html` - static page structure.
- `styles.css` - visual design for the prototype interface.
- `app.js` - automata simulation, blob tracking, rendering, and Web Audio synthesis.
