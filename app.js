(() => {
  const COLS = 60;
  const ROWS = 40;
  const CELLS = COLS * ROWS;
  const VOICE_COUNT = 4;
  const MIN_BLOB_AREA = 4;
  const BLOB_COLORS = ["#ff3366", "#33ccff", "#ffcc00", "#00ff66"];

  const CONFIG = {
    rate: 10,
    blurRadius: 2,
    threshold: 0.22,
    decay: 0.88,
    gain: 0.36,
    wrapEdges: true,
  };

  const canvas = document.querySelector("#lifeCanvas");
  const ctx = canvas.getContext("2d");
  const runToggle = document.querySelector("#runToggle");
  const stepButton = document.querySelector("#stepButton");
  const clearButton = document.querySelector("#clear");
  const randomizeButton = document.querySelector("#randomize");
  const audioToggle = document.querySelector("#audioToggle");
  const generationReadout = document.querySelector("#generationReadout");
  const blobReadout = document.querySelector("#blobReadout");
  const viewRadios = document.querySelectorAll('input[name="viewMode"]');

  let grid = new Uint8Array(CELLS);
  let nextGrid = new Uint8Array(CELLS);
  const trail = new Float32Array(CELLS);
  const density = new Float32Array(CELLS);
  const mask = new Uint8Array(CELLS);
  const visited = new Uint8Array(CELLS);
  const stack = new Int32Array(CELLS);

  let blobs = [];
  let viewMode = "raw";
  let running = true;
  let drawing = false;
  let drawValue = 1;
  let frameCount = 0;
  let lastStep = 0;
  let canvasWidth = 600;
  let canvasHeight = 400;

  const tracks = Array.from({ length: VOICE_COUNT }, (_, index) => ({
    index,
    x: (index + 0.5) / VOICE_COUNT,
    y: 0.5,
    area: 0,
    energy: 0,
    targetGain: 0,
    gain: 0,
    targetPan: 0,
    pan: 0,
    freq: 110 + index * 38,
    active: false,
    box: null,
  }));

  let audio = null;
  let audioEnabled = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function idx(x, y) {
    return y * COLS + x;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = rect.width || 600;
    canvasHeight = rect.height || canvasWidth * (ROWS / COLS);
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetTracks(immediate = false) {
    for (const track of tracks) {
      track.targetGain = 0;
      track.active = false;
      track.box = null;
      if (immediate) track.gain = 0;
    }
  }

  function clearGrid() {
    grid.fill(0);
    nextGrid.fill(0);
    trail.fill(0);
    density.fill(0);
    mask.fill(0);
    blobs = [];
    frameCount = 0;
    resetTracks(true);
    updateReadouts();
  }

  function addPattern(originX, originY, pattern) {
    for (let y = 0; y < pattern.length; y += 1) {
      for (let x = 0; x < pattern[y].length; x += 1) {
        if (pattern[y][x] !== "1") continue;
        const px = (originX + x + COLS) % COLS;
        const py = (originY + y + ROWS) % ROWS;
        grid[idx(px, py)] = 1;
        trail[idx(px, py)] = 1;
      }
    }
  }

  function addGlider(x, y) {
    addPattern(x, y, ["010", "001", "111"]);
  }

  function addOscillator(x, y) {
    addPattern(x, y, ["111"]);
  }

  function seedStructuredLife() {
    addGlider(5 + Math.floor(Math.random() * 8), 5);
    addGlider(35, 7 + Math.floor(Math.random() * 9));
    addGlider(16, 27);
    addOscillator(42, 25);
    addOscillator(10, 18);
  }

  function randomizeGrid() {
    clearGrid();
    for (let i = 0; i < CELLS; i += 1) {
      const alive = Math.random() > 0.86 ? 1 : 0;
      grid[i] = alive;
      trail[i] = alive;
    }
    seedStructuredLife();
    detectBlobs();
    assignTracks();
    updateReadouts();
  }

  function countNeighbors(x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        let nx = x + dx;
        let ny = y + dy;
        if (CONFIG.wrapEdges) {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
          continue;
        }
        count += grid[idx(nx, ny)];
      }
    }
    return count;
  }

  function stepAutomata() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = idx(x, y);
        const neighbors = countNeighbors(x, y);
        const alive = grid[i] === 1;
        nextGrid[i] = alive
          ? neighbors === 2 || neighbors === 3
            ? 1
            : 0
          : neighbors === 3
            ? 1
            : 0;
      }
    }

    const previous = grid;
    grid = nextGrid;
    nextGrid = previous;

    for (let i = 0; i < CELLS; i += 1) {
      trail[i] = grid[i] ? 1 : trail[i] * CONFIG.decay;
      if (trail[i] < 0.01) trail[i] = 0;
    }

    frameCount += 1;
    detectBlobs();
    assignTracks();
    updateReadouts();
  }

  function buildDensityField() {
    const radius = CONFIG.blurRadius;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        let sum = 0;
        let weightTotal = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
            const weight = radius + 1 - Math.max(Math.abs(dx), Math.abs(dy));
            sum += trail[idx(nx, ny)] * weight;
            weightTotal += weight;
          }
        }
        const i = idx(x, y);
        density[i] = weightTotal ? sum / weightTotal : 0;
        mask[i] = density[i] >= CONFIG.threshold ? 1 : 0;
      }
    }
  }

  function detectBlobs() {
    buildDensityField();
    visited.fill(0);
    const found = [];

    for (let start = 0; start < CELLS; start += 1) {
      if (!mask[start] || visited[start]) continue;

      let stackLength = 0;
      let area = 0;
      let mass = 0;
      let xSum = 0;
      let ySum = 0;
      let minX = COLS;
      let minY = ROWS;
      let maxX = 0;
      let maxY = 0;

      stack[stackLength] = start;
      stackLength += 1;
      visited[start] = 1;

      while (stackLength > 0) {
        stackLength -= 1;
        const current = stack[stackLength];
        const x = current % COLS;
        const y = Math.floor(current / COLS);
        const weight = density[current];

        area += 1;
        mass += weight;
        xSum += x * weight;
        ySum += y * weight;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          const ni = idx(nx, ny);
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack[stackLength] = ni;
          stackLength += 1;
        }
      }

      if (area >= MIN_BLOB_AREA && mass > 0) {
        found.push({
          area,
          mass,
          energy: clamp(mass / Math.max(area, 1), 0, 1),
          x: clamp(xSum / mass / (COLS - 1), 0, 1),
          y: clamp(ySum / mass / (ROWS - 1), 0, 1),
          box: { minX, minY, maxX, maxY },
        });
      }
    }

    blobs = found.sort((a, b) => b.mass - a.mass).slice(0, 12);
  }

  function gainFromBlob(blob) {
    return clamp(0.04 + Math.sqrt(blob.mass) * 0.11 + blob.area / 520, 0, 0.76);
  }

  function pitchFromBlob(blob, voiceIndex) {
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    const row = clamp(Math.round((1 - blob.y) * (scale.length - 1)), 0, scale.length - 1);
    const base = 96 * Math.pow(2, voiceIndex / 12);
    return base * Math.pow(2, scale[row] / 12);
  }

  function setTrackFromBlob(track, blob) {
    track.x = lerp(track.x, blob.x, 0.42);
    track.y = lerp(track.y, blob.y, 0.42);
    track.area = lerp(track.area, blob.area, 0.32);
    track.energy = lerp(track.energy, blob.energy, 0.32);
    track.freq = lerp(track.freq, pitchFromBlob(blob, track.index), 0.25);
    track.targetGain = gainFromBlob(blob);
    track.targetPan = blob.x * 2 - 1;
    track.active = true;
    track.box = blob.box;
  }

  function assignTracks() {
    const assignedBlobs = new Set();
    const assignedTracks = new Set();
    const candidates = [];

    tracks.forEach((track, trackIndex) => {
      if (!track.active && track.gain < 0.03) return;
      blobs.forEach((blob, blobIndex) => {
        const distance = Math.hypot(blob.x - track.x, blob.y - track.y);
        candidates.push({ trackIndex, blobIndex, score: distance });
      });
    });

    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates) {
      if (candidate.score > 0.3) continue;
      if (assignedBlobs.has(candidate.blobIndex) || assignedTracks.has(candidate.trackIndex)) {
        continue;
      }
      setTrackFromBlob(tracks[candidate.trackIndex], blobs[candidate.blobIndex]);
      assignedBlobs.add(candidate.blobIndex);
      assignedTracks.add(candidate.trackIndex);
    }

    for (let blobIndex = 0; blobIndex < blobs.length; blobIndex += 1) {
      if (assignedBlobs.has(blobIndex)) continue;
      const freeTrack = tracks
        .filter((track) => !assignedTracks.has(track.index))
        .sort((a, b) => a.gain - b.gain)[0];
      if (!freeTrack) break;
      setTrackFromBlob(freeTrack, blobs[blobIndex]);
      assignedBlobs.add(blobIndex);
      assignedTracks.add(freeTrack.index);
    }

    for (const track of tracks) {
      if (assignedTracks.has(track.index)) continue;
      track.targetGain = 0;
      track.active = false;
      track.box = null;
    }
  }

  function smoothTracks() {
    for (const track of tracks) {
      const gainEase = track.targetGain > track.gain ? 0.18 : 0.05;
      track.gain = lerp(track.gain, track.targetGain, gainEase);
      track.pan = lerp(track.pan, track.targetPan, 0.12);
      if (track.gain < 0.002 && !track.active) track.gain = 0;
    }
  }

  function createAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const delayWet = context.createGain();

    master.gain.value = 0;
    compressor.threshold.value = -20;
    compressor.knee.value = 16;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
    delay.delayTime.value = 0.18;
    feedback.gain.value = 0.2;
    delayWet.gain.value = 0.085;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(master);
    master.connect(compressor);
    compressor.connect(context.destination);

    const voices = tracks.map((track) => {
      const oscA = context.createOscillator();
      const oscB = context.createOscillator();
      const oscBGain = context.createGain();
      const filter = context.createBiquadFilter();
      const voiceGain = context.createGain();
      const panner = context.createStereoPanner();

      oscA.type = "sine";
      oscB.type = "triangle";
      oscA.frequency.value = track.freq;
      oscB.frequency.value = track.freq * 2.01;
      oscBGain.gain.value = 0.16;
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.8;
      voiceGain.gain.value = 0;
      panner.pan.value = 0;

      oscA.connect(filter);
      oscB.connect(oscBGain);
      oscBGain.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(master);
      panner.connect(delay);
      oscA.start();
      oscB.start();

      return { oscA, oscB, filter, voiceGain, panner };
    });

    audio = { context, master, voices };
  }

  async function toggleAudio() {
    if (!audio) createAudio();
    if (audio.context.state === "suspended") {
      await audio.context.resume();
    }
    audioEnabled = !audioEnabled;
    audioToggle.classList.toggle("is-on", audioEnabled);
    audioToggle.textContent = audioEnabled ? "Audio On" : "Audio";
  }

  function updateAudio() {
    if (!audio) return;
    const now = audio.context.currentTime;
    audio.master.gain.setTargetAtTime(audioEnabled ? CONFIG.gain : 0, now, 0.06);

    tracks.forEach((track, index) => {
      const voice = audio.voices[index];
      const frequency = clamp(track.freq, 55, 1100);
      const filter = clamp(360 + track.energy * 3200 + track.area * 9, 280, 5200);
      voice.oscA.frequency.setTargetAtTime(frequency, now, 0.08);
      voice.oscB.frequency.setTargetAtTime(frequency * 2.01, now, 0.08);
      voice.filter.frequency.setTargetAtTime(filter, now, 0.12);
      voice.panner.pan.setTargetAtTime(clamp(track.pan, -1, 1), now, 0.14);
      voice.voiceGain.gain.setTargetAtTime(track.gain * 0.22, now, 0.16);
    });
  }

  function drawGridLines(cellW, cellH) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 5) {
      const px = Math.round(x * cellW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y += 5) {
      const py = Math.round(y * cellH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvasWidth, py);
      ctx.stroke();
    }
  }

  function drawCells(cellW, cellH, gap) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = idx(x, y);
        const cellX = x * cellW + gap;
        const cellY = y * cellH + gap;
        const width = Math.max(0.75, cellW - gap * 2);
        const height = Math.max(0.75, cellH - gap * 2);

        if (viewMode === "raw") {
          if (!grid[i]) continue;
          ctx.fillStyle = "#eeeeee";
          ctx.fillRect(cellX, cellY, width, height);
          continue;
        }

        if (viewMode === "tail") {
          if (trail[i] <= 0) continue;
          ctx.fillStyle = `rgba(0, 255, 150, ${trail[i]})`;
          ctx.fillRect(cellX, cellY, width, height);
          continue;
        }

        if (density[i] > CONFIG.threshold * 0.45) {
          const alpha = clamp((density[i] - CONFIG.threshold * 0.28) * 1.35, 0.04, 0.42);
          ctx.fillStyle = `rgba(51, 204, 255, ${alpha})`;
          ctx.fillRect(cellX, cellY, width, height);
        }
        if (trail[i] > 0) {
          ctx.fillStyle = grid[i]
            ? `rgba(238, 238, 238, ${0.7 + trail[i] * 0.3})`
            : `rgba(100, 100, 100, ${trail[i] * 0.45})`;
          ctx.fillRect(cellX, cellY, width, height);
        }
      }
    }
  }

  function drawBlobOverlays(cellW, cellH) {
    if (viewMode !== "blob") return;

    tracks.forEach((track, index) => {
      if (track.gain <= 0.01) return;
      const color = BLOB_COLORS[index % BLOB_COLORS.length];
      const x = track.x * (COLS - 1) * cellW + cellW / 2;
      const y = track.y * (ROWS - 1) * cellH + cellH / 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = clamp(0.32 + track.gain, 0.32, 0.92);

      if (track.box) {
        const boxX = track.box.minX * cellW;
        const boxY = track.box.minY * cellH;
        const boxW = (track.box.maxX - track.box.minX + 1) * cellW;
        const boxH = (track.box.maxY - track.box.minY + 1) * cellH;
        ctx.strokeRect(boxX - 2, boxY - 2, boxW + 3, boxH + 3);
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        const pan = (track.pan >= 0 ? "+" : "") + track.pan.toFixed(2);
        ctx.fillText(`ID:${index} PAN:${pan}`, boxX, Math.max(10, boxY - 7));
      }

      ctx.beginPath();
      ctx.arc(x, y, 4 + track.gain * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const cellW = canvasWidth / COLS;
    const cellH = canvasHeight / ROWS;
    const gap = Math.max(0.35, Math.min(cellW, cellH) * 0.08);

    drawCells(cellW, cellH, gap);
    drawBlobOverlays(cellW, cellH);
    drawGridLines(cellW, cellH);
  }

  function updateReadouts() {
    const activeNodes = tracks.filter((track) => track.gain > 0.02 || track.targetGain > 0).length;
    generationReadout.textContent = `Frame: ${frameCount}`;
    blobReadout.textContent = `Active Audio Nodes: ${activeNodes} / Blobs: ${blobs.length}`;
  }

  function paintAt(clientX, clientY, value) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * COLS);
    const y = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const i = idx(nx, ny);
        grid[i] = value;
        trail[i] = value ? 1 : trail[i] * 0.25;
      }
    }

    detectBlobs();
    assignTracks();
    updateReadouts();
  }

  function tick(time) {
    const interval = 1000 / CONFIG.rate;
    if (running && time - lastStep >= interval) {
      stepAutomata();
      lastStep = time;
    }

    smoothTracks();
    updateAudio();
    updateReadouts();
    draw();
    requestAnimationFrame(tick);
  }

  function bindEvents() {
    audioToggle.addEventListener("click", toggleAudio);

    runToggle.addEventListener("click", () => {
      running = !running;
      runToggle.textContent = running ? "Pause" : "Play";
    });

    stepButton.addEventListener("click", () => {
      running = false;
      runToggle.textContent = "Play";
      stepAutomata();
      draw();
    });

    clearButton.addEventListener("click", () => {
      clearGrid();
      draw();
    });

    randomizeButton.addEventListener("click", () => {
      randomizeGrid();
      draw();
    });

    viewRadios.forEach((radio) => {
      radio.addEventListener("change", (event) => {
        viewMode = event.target.value;
        draw();
      });
    });

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLS);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS);
      const safeX = clamp(x, 0, COLS - 1);
      const safeY = clamp(y, 0, ROWS - 1);
      drawValue = grid[idx(safeX, safeY)] ? 0 : 1;
      paintAt(event.clientX, event.clientY, drawValue);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      paintAt(event.clientX, event.clientY, drawValue);
    });

    canvas.addEventListener("pointerup", (event) => {
      drawing = false;
      canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointercancel", () => {
      drawing = false;
    });

    window.addEventListener("resize", () => {
      resizeCanvas();
      draw();
    });
  }

  bindEvents();
  resizeCanvas();
  randomizeGrid();
  requestAnimationFrame(tick);
})();
