# Polyphonic Automata

An interactive Web Audio prototype for exploring spatial, polyphonic relationships through Conway's Game of Life.

[Live demo](https://yuhangchill.github.io/polyphonic-automata/)

The page runs as a small browser-based instrument: a cellular automata grid evolves in real time, and the viewer can click or drag directly on the matrix to add or remove cells while the system is running. The visual field is analyzed into audio nodes, then mapped to pitch, gain, filter movement, and stereo position.

## Concept

Polyphonic Automata uses Conway's Game of Life as a rule-based engine for exploring spatial audio relationships. The project is less about sonifying the Game of Life itself, and more about constructing a situation where multiple channels, voices, or speaker positions remain independent while still influencing one another through a shared evolving system.

The cellular grid becomes a field for chance, rule-following, and emergent pattern formation. In that sense, the work also touches a Fluxus-like interest in simple instructions producing unstable, living, and sometimes accidental outcomes. Instead of treating each white pixel as an individual sound event, the system builds a softened density field from the evolving grid and tracks larger blob-like formations as musical voices.

These voices can be read as provisional lifeforms: not fixed objects, but temporary formations that appear, move, merge, split, and disappear. Decay trails and density clustering give those formations enough continuity to become spatial audio agents without forcing them into a rigid visual definition.

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
