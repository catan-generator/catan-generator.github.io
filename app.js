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
    redCanTouch: !document.getElementById("optRedTouch").checked,        // Inverted: checked = cannot touch
    twoTwelveCanTouch: !document.getElementById("optTwoTwelveTouch").checked,
    sameNumbersCanTouch: !document.getElementById("optSameNumbersTouch").checked,
    sameResourceCanTouch: !document.getElementById("optSameResourceTouch").checked,
    sameResourceSameNumber: !document.getElementById("optSameResourceSameNumber").checked,
  };
}

function applyPreset(preset) {
  const red = document.getElementById("optRedTouch");
  const two12 = document.getElementById("optTwoTwelveTouch");
  const sameNum = document.getElementById("optSameNumbersTouch");
  const sameRes = document.getElementById("optSameResourceTouch");
  const sameResSameNum = document.getElementById("optSameResourceSameNumber");

  if (preset === "classic") {
    red.checked = true;         // Checked = 6 & 8 CANNOT touch
    two12.checked = true;       // Checked = 2 & 12 CANNOT touch
    sameNum.checked = true;     // Checked = Same numbers CANNOT touch
    sameRes.checked = true;     // Checked = Same resources CANNOT touch
    sameResSameNum.checked = true;
  }
}

// Generic constraint check
function violatesConstraintsAtPlacement({coordKey, tileKey, number}, placed, neighMap, options, allPlaced) {
  const neighs = neighMap.get(coordKey) || [];

  // Check neighbor constraints
  for (const nk of neighs) {
    const p = placed.get(nk);
    if (!p) continue;

    // Same resource cannot touch
    if (! options.sameResourceCanTouch) {
      if (p.tileKey === tileKey) {
        // console.log(`Blocked: ${tileKey} cannot touch ${p.tileKey}`);
        return true;
      }
    }

    if (number != null && p.number != null) {
      const isRed = (n) => n === 6 || n === 8;

      // Red numbers (6 and 8) can never touch each other
      if (isRed(p.number) && isRed(number)) {
        if (!options.redCanTouch) {
          return true;
        }
      }

      // Check if same numbers can touch
      if (!options.sameNumbersCanTouch) {
        if (p.number === number) return true;
      }

      // 2 and 12 cannot touch
      if (!options.twoTwelveCanTouch) {
        const isTwoTwelvePair =
          (p.number === 2 && number === 12) || (p.number === 12 && number === 2);
        if (isTwoTwelvePair) return true;
      }
    }
  }

  // Check global constraint: same resource cannot have same number anywhere on board
  if (! options.sameResourceSameNumber && number != null && tileKey !== "desert") {
    // Check all already placed tiles (in the placed Map, not allPlaced array)
    for (const [key, tile] of placed.entries()) {
      if (key === coordKey) continue; // Skip current position
      if (tile.tileKey === tileKey && tile.number === number) {
        return true;
      }
    }
  }

  return false;
}

// Board generation — delegated to the backtracking core in
// generator-core.js (loaded before this file). Every board satisfies
// every enabled rule by construction; the old shuffle-retry strategy and
// its rule-free "last resort" fallback are gone.
function generateBoardWithRules(seedStr, options) {
  return window.CatanGen.generate(seedStr, options);
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
const animateEl = document.getElementById("optAnimate");
const legend = document.getElementById("legend");

// Persisted "animate tiles" preference; off by default for anyone who
// has motion reduced at the OS level, regardless of the checkbox.
animateEl.checked = localStorage.getItem('catanAnimate') !== '0';
const prefersReducedMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const presetSelect = document.getElementById("presetSelect");
const optRedTouch = document.getElementById("optRedTouch");
const optTwoTwelveTouch = document.getElementById("optTwoTwelveTouch");
const optSameNumbersTouch = document.getElementById("optSameNumbersTouch");
const optSameResourceTouch = document.getElementById("optSameResourceTouch");
const optSameResourceSameNumber = document.getElementById("optSameResourceSameNumber");
const langSelect = document.getElementById("langSelect");

// --- Language System ---
const translations = {
  en: {
    seed: "Seed",
    newMap: "New Map",
    randomSeed: "Random Seed",
    animateTiles: "Animate Tiles",
    showNumbers: "Show Numbers",
    options: "Options",
    preset: "Preset",
    opt68: "6 & 8 Cannot Touch",
    opt212: "2 & 12 Cannot Touch",
    optSameNum: "Same Numbers Cannot Touch",
    optSameRes: "Same Resources Cannot Touch",
    optSameResSameNum: "Same Resource Cannot Have Same Number",
    classicDesc: "Original Catan rules - red numbers (6 & 8), extreme numbers (2 & 12), same numbers, and same resources cannot be adjacent. Recommended for balanced maps.",
    customDesc: "Manually control all rules. Automatically switches to Custom mode when any setting changes.",
    legend: "Legend",
    tagline: "Fair boards, every game night",
    aboutTitle: "What is this Catan board generator?",
    aboutBody: "This free online tool creates balanced, fair random Catan boards for the base game (3\u20134 players). A constraint-solving algorithm guarantees the placement rules you choose: 6 & 8 never adjacent, 2 & 12 apart, same numbers and same resources spread out. Share the seed to replay any map. Free, no ads, works offline.",
    faqTitle: "Frequently asked questions",
    faq1q: "Why should 6 and 8 not touch in Catan?",
    faq1a: "6 and 8 are rolled most often. Adjacent red numbers make one settlement spot overwhelmingly strong, so keeping them apart is the most common fairness rule.",
    faq2q: "What makes a Catan board \"balanced\"?",
    faq2a: "High-probability numbers and resource types are spread evenly so no starting corner dominates. This generator enforces that with hard rules instead of luck.",
    faq3q: "Can I replay the same map?",
    faq3a: "Yes \u2014 every map comes from a seed. Same seed + same rules = identical board on any device.",
    privacy: "Privacy Policy",
    footerNote: "Free & open \u2014 no ads, no tracking",
    wood: "Wood",
    brick: "Brick",
    sheep: "Sheep",
    wheat: "Wheat",
    ore: "Ore",
    desert: "Desert"
  },
  tr: {
    seed: "Seed",
    newMap: "Yeni Harita",
    randomSeed: "Rastgele Seed",
    animateTiles: "Karoları Canlandır",
    showNumbers: "Numaraları Göster",
    options: "Seçenekler",
    preset: "Preset",
    opt68: "6 ve 8 Yan Yana Gelemez",
    opt212: "2 ve 12 Yan Yana Gelemez",
    optSameNum: "Aynı Sayılar Yan Yana Gelemez",
    optSameRes: "Aynı Kaynaklar Yan Yana Gelemez",
    optSameResSameNum: "Aynı Kaynak Aynı Sayıya Sahip Olamaz",
    classicDesc: "Orijinal Catan kuralları - kırmızı sayılar (6 ve 8), uç sayılar (2 ve 12), aynı sayılar ve aynı kaynaklar yan yana gelemez. Dengeli haritalar için önerilir.",
    customDesc: "Tüm kuralları manuel kontrol et. Herhangi bir ayar değiştiğinde otomatik Custom moduna geçer.",
    legend: "Açıklama",
    tagline: "Her oyun gecesine adil tahta",
    aboutTitle: "Bu Catan harita oluşturucu nedir?",
    aboutBody: "Bu ücretsiz araç, temel oyun (3\u20134 oyuncu) için dengeli ve adil rastgele Catan tahtaları üretir. Kısıt çözücü algoritma seçtiğiniz kuralları garanti eder: 6 ve 8 asla yan yana gelmez, 2 ve 12 ayrık kalır, aynı sayılar ve aynı kaynaklar dağıtılır. Seed'i paylaşarak aynı haritayı tekrar açabilirsiniz. Ücretsiz, reklamsız, çevrimdışı çalışır.",
    faqTitle: "Sık sorulan sorular",
    faq1q: "Catan'da 6 ve 8 neden yan yana gelmemeli?",
    faq1a: "6 ve 8 en sık atılan sayılardır. Yan yana geldiklerinde tek bir yerleşim noktası aşırı güçlenir; bu yüzden ayrı tutmak en yaygın adalet kuralıdır.",
    faq2q: "Dengeli Catan tahtası ne demek?",
    faq2a: "Yüksek olasılıklı sayılar ve kaynak türleri eşit dağılır, hiçbir başlangıç köşesi baskın olmaz. Bu araç bunu şansa değil kurallara bağlar.",
    faq3q: "Aynı haritayı tekrar açabilir miyim?",
    faq3a: "Evet \u2014 her harita bir seed'den üretilir. Aynı seed + aynı kurallar = her cihazda birebir aynı tahta.",
    privacy: "Gizlilik Politikası",
    footerNote: "Ücretsiz \u2014 reklamsız, takipsiz",
    wood: "Orman",
    brick: "Tuğla",
    sheep: "Koyun",
    wheat: "Buğday",
    ore: "Maden",
    desert: "Çöl"
  }
};

let currentLang = 'en';

function setLanguage(lang) {
  currentLang = lang;

  // Keep the document's lang in sync with the selected language — CSS
  // text-transform:uppercase follows it for case-folding, and with a
  // stale lang="tr" left over, English text containing "i" (e.g.
  // "Options") uppercases using Turkish rules into "OPTİONS" (dotted
  // capital İ) instead of "OPTIONS".
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-lang]').forEach(el => {
    const key = el.getAttribute('data-lang');
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });

  // The legend's resource names were previously hardcoded Turkish and
  // never followed the language toggle at all — re-render it here.
  renderLegend();

  // Update placeholder
  const placeholder = lang === 'tr' ? 'örn: 12345 veya merhaba' : 'e.g. 12345 or hello';
  seedInput.placeholder = placeholder;

  localStorage.setItem('catanLang', lang);
}

// Load saved language
const savedLang = localStorage.getItem('catanLang') || 'en';
langSelect.value = savedLang;
setLanguage(savedLang);

langSelect.addEventListener('change', (e) => {
  setLanguage(e.target.value);
});

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
    const label = (translations[currentLang] && translations[currentLang][t.key]) || t.label;
    txt.textContent = `${label} (${t.key})`;
    div.appendChild(sw);
    div.appendChild(txt);
    legend.appendChild(div);
  }
}


// Harbors render as wooden dock platforms protruding from the coastal
// edge — flush base (hidden under the land tile painted after it),
// planked top, mooring posts, and a cream ratio badge. Geometry mirrors
// the mobile app's HarborLayer. Drawn BEFORE the land tiles so each
// tile's opaque polygon covers the pier's near-edge overlap seamlessly.
function drawHarbors(state, size, origin, animate, baseDelay) {
  const PIER_TOP = "#A9744A", PIER_SIDE = "#6B4527", PLANK_GAP = "rgba(38,22,10,0.55)";
  const POST = "#5A3A1F", BADGE_BG = "#F4E8D0", BADGE_TEXT = "#3E2E1C";

  for (const h of state.harbors) {
    const { x: cx, y: cy } = axialToPixel(state.tiles[h.cell], size, origin);
    const a = CatanGen.hexCornerUnit(h.edge);
    const b = CatanGen.hexCornerUnit(h.edge + 1);
    const ax = cx + a.x * size * 0.94, ay = cy + a.y * size * 0.94;
    const bx = cx + b.x * size * 0.94, by = cy + b.y * size * 0.94;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ml = Math.hypot(mx, my);
    const nx = mx / ml, ny = my / ml;
    let tx = bx - ax, ty = by - ay;
    const tl = Math.hypot(tx, ty);
    tx /= tl; ty /= tl;
    const outDist = ml * size + size * 0.68;
    const ox = cx + nx * outDist, oy = cy + ny * outDist;
    const halfOuter = tl * 0.36;
    const depth = size * 0.1;
    const oxA = ox + tx * halfOuter, oyA = oy + ty * halfOuter;
    const oxB = ox - tx * halfOuter, oyB = oy - ty * halfOuter;

    const g = svgEl("g");
    g.appendChild(svgEl("polygon", {
      points: `${ax},${ay + depth} ${bx},${by + depth} ${oxA},${oyA + depth} ${oxB},${oyB + depth}`,
      fill: PIER_SIDE,
    }));
    g.appendChild(svgEl("polygon", {
      points: `${ax},${ay} ${bx},${by} ${oxA},${oyA} ${oxB},${oyB}`,
      fill: PIER_TOP,
    }));
    [0.22, 0.42, 0.62, 0.82].forEach((f) => {
      g.appendChild(svgEl("line", {
        x1: bx + (oxA - bx) * f, y1: by + (oyA - by) * f,
        x2: ax + (oxB - ax) * f, y2: ay + (oyB - ay) * f,
        stroke: PLANK_GAP, "stroke-width": size * 0.035, "stroke-linecap": "round",
      }));
    });
    [[oxA - tx * size * 0.05, oyA - ty * size * 0.05], [oxB + tx * size * 0.05, oyB + ty * size * 0.05]]
      .forEach(([px, py]) => g.appendChild(svgEl("circle", { cx: px, cy: py, r: size * 0.075, fill: POST })));

    const ccx = cx + nx * (ml * size + size * 0.34);
    const ccy = cy + ny * (ml * size + size * 0.34);
    const badgeR = size * 0.26;
    g.appendChild(svgEl("circle", {
      cx: ccx, cy: ccy, r: badgeR, fill: BADGE_BG, stroke: PIER_SIDE, "stroke-width": size * 0.024,
    }));
    if (h.type !== "generic") {
      g.appendChild(svgEl("circle", { cx: ccx, cy: ccy - badgeR * 0.34, r: badgeR * 0.24, fill: typeMeta(h.type).color }));
    }
    const label = svgEl("text", {
      x: ccx, y: ccy + (h.type === "generic" ? badgeR * 0.2 : badgeR * 0.68),
      "text-anchor": "middle", "font-size": badgeR * 0.62, "font-weight": "800", fill: BADGE_TEXT,
    });
    label.textContent = h.type === "generic" ? "3:1" : "2:1";
    g.appendChild(label);

    board.appendChild(g);

    if (animate) {
      g.style.opacity = "0";
      g.style.transition = `opacity 420ms ease ${baseDelay}ms`;
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = "1"; }));
    }
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
  // Origin centered in the viewBox (1280x1060) with extra margin beyond
  // the land hexes so harbor piers (which protrude ~1.6x a hex radius)
  // never clip against the canvas edge.
  const origin = { x: 640, y: 530 };
  // Tiles genuinely scatter onto the board — random direction/tilt per
  // tile, staggered, settling with a spring-like ease. Respects the
  // "Animate Tiles" checkbox and the OS reduced-motion preference.
  const animate = animateEl.checked && !prefersReducedMotion;

  const tiles = boardState.tiles;
  drawHarbors(boardState, size, origin, animate, tiles.length * 55 + 250);
  tiles.forEach((tile, tileIndex) => {
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

    if (animate) {
      const dx = (Math.random() - 0.5) * 560;
      const dy = -240 - Math.random() * 160;
      const rot = (Math.random() - 0.5) * 70;
      const delay = tileIndex * 55;
      g.style.transformBox = "fill-box";
      g.style.transformOrigin = "center";
      g.style.opacity = "0";
      g.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.15)`;
      g.style.transition =
        `transform 620ms cubic-bezier(.17,.84,.44,1) ${delay}ms, ` +
        `opacity 260ms ease ${delay}ms`;
      // Double rAF: guarantees the browser has painted the initial
      // (off-screen) state before the transition to final values starts.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        g.style.opacity = "1";
        g.style.transform = "translate(0,0) rotate(0deg) scale(1)";
      }));
    }
  });
}

function currentSeed() {
  return seedInput.value.trim() || "catan";
}

function regenerate() {
  try {
    const seedStr = currentSeed();
    const options = readOptions();
    console.log('Options:', options);
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
  } catch (error) {
    console.error("Error in regenerate:", error);
    alert("Harita oluşturulurken hata: " + error.message);
  }
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

// "Yeni Harita" - generate new random board
generateBtn.addEventListener("click", () => {
  seedInput.value = randomSeed();
  regenerate();
});

// "Rastgele Seed" - also generate new random board (same as Yeni Harita)
randomSeedBtn.addEventListener("click", () => {
  seedInput.value = randomSeed();
  regenerate();
});

// Auto-regenerate when seed input changes manually
seedInput.addEventListener("input", regenerate);

showNumbersEl.addEventListener("change", regenerate);

animateEl.addEventListener("change", () => {
  localStorage.setItem('catanAnimate', animateEl.checked ? '1' : '0');
  regenerate();
});

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
