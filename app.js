// --- Seeded RNG (mulberry32 + string hash) ---
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededRng(seedStr) {
  const seedFn = xmur3(seedStr);
  return mulberry32(seedFn());
}
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Tiles / numbers ---
const TILE_TYPES = [
  { key: "wood",  label: "Orman",  color: "#2f7d32", img: "assets/wood.svg" },
  { key: "brick", label: "Tuğla",  color: "#b04b3a", img: "assets/brick.svg" },
  { key:  "sheep", label: "Koyun",  color: "#7ed957", img: "assets/sheep.svg" },
  { key: "wheat", label: "Buğday", color: "#e6c84e", img: "assets/wheat.svg" },
  { key: "ore",   label: "Maden",  color: "#6d7a8a", img: "assets/ore.svg" },
  { key: "desert",label: "Çöl",    color: "#d6c28f", img: "assets/desert.svg" },
];


function typeMeta(key) {
  return TILE_TYPES.find(t => t.key === key) ??  TILE_TYPES[0];
}

// Base Catan (19): 4 wood, 3 brick, 4 sheep, 4 wheat, 3 ore, 1 desert
function defaultTileBag() {
  return [
    ... Array(4).fill("wood"),
    ...Array(3).fill("brick"),
    ...Array(4).fill("sheep"),
    ...Array(4).fill("wheat"),
    ...Array(3).fill("ore"),
    ...Array(1).fill("desert"),
  ];
}

// Base game number tokens (desert hariç 18)
function defaultNumberBag() {
  return [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];
}

// Layout axial coords for rows:  3-4-5-4-3 (pointy-top)
function baseAxialCoords() {
  const rows = [
    { r: -2, qStart: 0,  len: 3 },
    { r: -1, qStart: -1, len: 4 },
    { r:  0, qStart: -2, len:  5 },
    { r:  1, qStart: -2, len: 4 },
    { r:  2, qStart: -2, len: 3 },
  ];
  const coords = [];
  for (const row of rows) {
    for (let i = 0; i < row.len; i++) coords.push({ q: row.qStart + i, r: row.r });
  }
  return coords;
}


// --- Hex helpers ---
function axialToKey(q, r) { return `${q},${r}`; }
function neighborsOf({q, r}) {
  const dirs = [
    {dq: 1, dr: 0},
    {dq: 1, dr: -1},
    {dq:  0, dr: -1},
    {dq:  -1, dr: 0},
    {dq: -1, dr: 1},
    {dq: 0, dr: 1},
  ];
  return dirs.map(d => ({ q: q + d.dq, r: r + d.dr }));
}

function buildNeighborMap(coords) {
  const coordSet = new Set(coords.map(c => axialToKey(c.q, c.r)));
  const neighMap = new Map();
  for (const c of coords) {
    const ns = neighborsOf(c).filter(n => coordSet.has(axialToKey(n.q, n.r)));
    neighMap.set(axialToKey(c.q, c.r), ns.map(n => axialToKey(n.q, n.r)));
  }
  return neighMap;
}

// --- Options / rules ---
function readOptions() {
  return {
    redCanTouch: document.getElementById("optRedTouch").checked,
    twoTwelveCanTouch: document.getElementById("optTwoTwelveTouch").checked,
    sameNumbersCanTouch: document.getElementById("optSameNumbersTouch").checked,
    sameResourceCanTouch: document.getElementById("optSameResourceTouch").checked,
    sameResourceSameNumber:  document.getElementById("optSameResourceSameNumber").checked,
  };
}

function applyPreset(preset) {
  const red = document.getElementById("optRedTouch");
  const two12 = document.getElementById("optTwoTwelveTouch");
  const sameNum = document.getElementById("optSameNumbersTouch");
  const sameRes = document.getElementById("optSameResourceTouch");
  const sameResSameNum = document.getElementById("optSameResourceSameNumber");

  if (preset === "classic") {
    red.checked = false;
    two12.checked = true;
    sameNum.checked = true;
    sameRes.checked = false;
    sameResSameNum.checked = false;
  }
}

// Generic constraint check
function violatesConstraintsAtPlacement({coordKey, tileKey, number}, placed, neighMap, options, allPlaced) {
  const neighs = neighMap.get(coordKey) || [];

  for (const nk of neighs) {
    const p = placed.get(nk);
    if (!p) continue;

    if (! options.sameResourceCanTouch) {
      if (p.tileKey === tileKey) return true;
    }

    if (number != null && p.number != null) {
      if (!options.sameNumbersCanTouch) {
        if (p.number === number) return true;
      }

      if (!options.redCanTouch) {
        const isRed = (n) => n === 6 || n === 8;
        if (isRed(p.number) && isRed(number)) return true;
      }

      if (!options.twoTwelveCanTouch) {
        const isTwoTwelvePair =
          (p.number === 2 && number === 12) || (p.number === 12 && number === 2);
        if (isTwoTwelvePair) return true;
      }
    }
  }

  if (! options.sameResourceSameNumber && number != null && tileKey !== "desert") {
    for (const other of allPlaced) {
      if (other.tileKey === tileKey && other.number === number) {
        return true;
      }
    }
  }

  return false;
}

// Assign tiles + numbers with constraints by retrying shuffles
function generateBoardWithRules(seedStr, options, maxAttempts = 15000) {
  const rng = seededRng(seedStr);
  const coords = baseAxialCoords();
  const neighMap = buildNeighborMap(coords);


  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tileKeys = shuffleInPlace(defaultTileBag().slice(), rng);
    const nums = shuffleInPlace(defaultNumberBag().slice(), rng);

    const placed = new Map();
    const allPlaced = [];
    let numIdx = 0;
    let ok = true;

    for (let i = 0; i < coords.length; i++) {
      const coordKey = axialToKey(coords[i].q, coords[i].r);
      const tileKey = tileKeys[i];

      const number = (tileKey === "desert") ? null : nums[numIdx++];

      if (violatesConstraintsAtPlacement({coordKey, tileKey, number}, placed, neighMap, options, allPlaced)) {
        ok = false;
        break;
      }

      const entry = { tileKey, number };
      placed.set(coordKey, entry);
      allPlaced.push({ coordKey, tileKey, number });
    }

    if (ok) {
      return coords.map((c, i) => {
        const p = placed.get(axialToKey(c.q, c.r));
        return { ...c, key: p.tileKey, number: p.number };
      });
    }
  }

  const fallbackRng = seededRng(seedStr + "|fallback");
  const tileKeys = shuffleInPlace(defaultTileBag().slice(), fallbackRng);
  const nums = shuffleInPlace(defaultNumberBag().slice(), fallbackRng);
  let numIdx = 0;
  return coords.map((c, i) => ({
    ...c,
    key: tileKeys[i],
    number: tileKeys[i] === "desert" ? null :  nums[numIdx++],
  }));
}

// --- Hex geometry (pointy top) ---
function axialToPixel({q, r}, size, origin) {
  const x = size * Math.sqrt(3) * (q + r/2) + origin.x;
  const y = size * 1.5 * r + origin.y;
  return { x, y };
}
function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return pts.map(p => p.join(",")).join(" ");
}

// --- DOM ---
const board = document.getElementById("board");
const seedInput = document.getElementById("seedInput");
const generateBtn = document.getElementById("generateBtn");
const randomSeedBtn = document.getElementById("randomSeedBtn");
const showNumbersEl = document.getElementById("showNumbers");
const legend = document.getElementById("legend");

const presetSelect = document.getElementById("presetSelect");
const optRedTouch = document.getElementById("optRedTouch");
const optTwoTwelveTouch = document.getElementById("optTwoTwelveTouch");
const optSameNumbersTouch = document.getElementById("optSameNumbersTouch");
const optSameResourceTouch = document.getElementById("optSameResourceTouch");
const optSameResourceSameNumber = document.getElementById("optSameResourceSameNumber");

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}
function svgEl(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function renderLegend() {
  legend.innerHTML = "";
  for (const t of TILE_TYPES) {
    const div = document.createElement("div");
    div.className = "legendItem";
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = t.color;
    const txt = document.createElement("div");
    txt.textContent = `${t.label} (${t.key})`;
    div.appendChild(sw);
    div.appendChild(txt);
    legend.appendChild(div);
  }
}


function draw(boardState) {
  clearSvg(board);

  const defs = svgEl("defs");

  const filter = svgEl("filter", { id: "shadow", x: "-20%", y:"-20%", width:"140%", height:"140%" });
  filter.appendChild(svgEl("feDropShadow", { dx:"0", dy:"4", stdDeviation:"6", "flood-color":"#000", "flood-opacity":"0.35" }));
  defs.appendChild(filter);

  board.appendChild(defs);

  const size = 110;
  const origin = { x: 550, y: 440 };

  const tiles = boardState;
  for (const tile of tiles) {
    const { x, y } = axialToPixel(tile, size, origin);
    const meta = typeMeta(tile.key);

    const g = svgEl("g");

    const poly = svgEl("polygon", {
      points: hexPoints(x, y, size),
      fill: meta.color,
      stroke: "rgba(255,255,255,.20)",
      "stroke-width":  "2",
      filter: "url(#shadow)"
    });

    const overlay = svgEl("polygon", {
      points: hexPoints(x, y, size-2),
      fill: "rgba(255,255,255,.06)",
      stroke: "none"
    });

    g.appendChild(poly);
    g.appendChild(overlay);

    const imgSize = 110;
    const img = svgEl("image", {
      href: meta.img + '?v=2.0',
      x: x - imgSize/2,
      y: y - imgSize/2 - 14,
      width: imgSize,
      height: imgSize,
      opacity: "0.96",
      preserveAspectRatio: "xMidYMid meet",
    });
    g.appendChild(img);

    if (showNumbersEl.checked && tile.number != null) {
      const isHot = (tile.number === 6 || tile.number === 8);

      const circle = svgEl("circle", {
        cx: x, cy: y + 48, r: 30,
        fill: "rgba(255,255,255,.86)",
        stroke: "rgba(0,0,0,.25)",
        "stroke-width":  "2.5"
      });

      const num = svgEl("text", {
        x, y: y + 58,
        "text-anchor": "middle",
        "font-size": "30",
        "font-weight": "800",
        fill: isHot ? "#c1121f" : "#111827"
      });
      num.textContent = tile.number;

      g.appendChild(circle);
      g.appendChild(num);
    }

    if (tile.key === "desert") {
      const robber = svgEl("text", {
        x, y: y + 58,
        "text-anchor": "middle",
        "font-size":  "18",
        "font-weight":  "800",
        fill: "rgba(17,24,39,.75)"
      });
      robber.textContent = "ROBBER";
      g.appendChild(robber);
    }

    board.appendChild(g);
  }
}

function currentSeed() {
  return seedInput.value.trim() || "catan";
}

function regenerate() {
  const seedStr = currentSeed();
  const options = readOptions();
  const state = generateBoardWithRules(seedStr, options);
  draw(state);

  const url = new URL(window.location.href);
  url.searchParams.set("seed", seedStr);
  url.searchParams.set("preset", presetSelect.value);
  url.searchParams.set("red", options.redCanTouch ?  "1" : "0");
  url.searchParams.set("t2", options.twoTwelveCanTouch ? "1" :  "0");
  url.searchParams.set("sn", options.sameNumbersCanTouch ? "1" : "0");
  url.searchParams.set("sr", options.sameResourceCanTouch ? "1" :  "0");
  url.searchParams.set("rsn", options.sameResourceSameNumber ? "1" : "0");
  history.replaceState(null, "", url.toString());
}

function randomSeed() {
  return String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9));
}

function loadFromUrl() {
  const url = new URL(window.location.href);
  const seed = url.searchParams.get("seed");
  const preset = url.searchParams.get("preset");

  if (seed) seedInput.value = seed;

  if (preset === "classic" || preset === "custom") presetSelect.value = preset;

  if (presetSelect.value === "classic") applyPreset("classic");

  const setIfPresent = (id, param) => {
    const v = url.searchParams.get(param);
    if (v === "1" || v === "0") document.getElementById(id).checked = (v === "1");
  };
  setIfPresent("optRedTouch", "red");
  setIfPresent("optTwoTwelveTouch", "t2");
  setIfPresent("optSameNumbersTouch", "sn");
  setIfPresent("optSameResourceTouch", "sr");
  setIfPresent("optSameResourceSameNumber", "rsn");
}

renderLegend();
loadFromUrl();
if (presetSelect.value === "classic") applyPreset("classic");
regenerate();

generateBtn.addEventListener("click", regenerate);
randomSeedBtn.addEventListener("click", () => { seedInput.value = randomSeed(); regenerate(); });
showNumbersEl.addEventListener("change", regenerate);

presetSelect.addEventListener("change", () => {
  if (presetSelect.value === "classic") applyPreset("classic");
  regenerate();
});

function onOptionChanged() {
  presetSelect.value = "custom";
  regenerate();
}
optRedTouch.addEventListener("change", onOptionChanged);
optTwoTwelveTouch.addEventListener("change", onOptionChanged);
optSameNumbersTouch.addEventListener("change", onOptionChanged);
optSameResourceTouch.addEventListener("change", onOptionChanged);
optSameResourceSameNumber.addEventListener("change", onOptionChanged);
