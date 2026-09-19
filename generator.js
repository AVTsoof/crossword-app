// Hebrew Final-to-Base normalization map
const HEBREW_FINAL_MAP = {
  'ך': 'כ',
  'ם': 'מ',
  'ן': 'נ',
  'ף': 'פ',
  'ץ': 'צ'
};

function normChar(ch) {
  return HEBREW_FINAL_MAP[ch] || ch;
}

/**
 * Crossword Layout Generator for Hebrew
 * Returns { grid, placedWords, cols, rows } or null
 */
function generateCrossword(wordList, maxWords = 15) {
  // Sort candidate words by length descending
  const candidates = [...wordList].sort((a, b) => b.word.length - a.word.length);
  if (candidates.length === 0) return null;

  // Grid map keyed by "x,y" => { char, acrossWord, downWord }
  let grid = new Map();
  let placed = [];

  function getCell(x, y) {
    return grid.get(`${x},${y}`) || null;
  }

  function setCell(x, y, data) {
    grid.set(`${x},${y}`, data);
  }

  // Place first word horizontally at (0, 0)
  const first = candidates[0];
  for (let i = 0; i < first.word.length; i++) {
    setCell(i, 0, {
      char: first.word[i],
      acrossWord: first,
      downWord: null
    });
  }
  placed.push({
    ...first,
    x: 0,
    y: 0,
    orientation: 'across'
  });

  // Try placing subsequent words
  for (let w = 1; w < candidates.length && placed.length < maxWords; w++) {
    const candidate = candidates[w];
    const wordStr = candidate.word;
    const len = wordStr.length;

    let bestPlacement = null;
    let maxIntersections = 0;
    let minBBoxArea = Infinity;

    // Scan all currently placed words to find intersection opportunities
    for (const p of placed) {
      const pStr = p.word;
      const targetOrientation = p.orientation === 'across' ? 'down' : 'across';

      for (let ci = 0; ci < len; ci++) {
        const cChar = normChar(wordStr[ci]);

        for (let pi = 0; pi < pStr.length; pi++) {
          const pChar = normChar(pStr[pi]);
          if (cChar !== pChar) continue;

          // Found potential intersection at placed word index pi and candidate index ci
          let startX, startY;
          if (targetOrientation === 'down') {
            // p is across, candidate is down
            startX = p.x + pi;
            startY = p.y - ci;
          } else {
            // p is down, candidate is across
            startX = p.x - ci;
            startY = p.y + pi;
          }

          // Check validity of candidate at (startX, startY, targetOrientation)
          const valid = checkPlacement(startX, startY, targetOrientation, wordStr);
          if (valid) {
            // Calculate score (more intersections, smaller bbox)
            const intersections = valid.intersections;
            const bbox = calculateNewBBox(startX, startY, targetOrientation, len);
            const area = (bbox.maxX - bbox.minX + 1) * (bbox.maxY - bbox.minY + 1);

            if (intersections > maxIntersections || (intersections === maxIntersections && area < minBBoxArea)) {
              maxIntersections = intersections;
              minBBoxArea = area;
              bestPlacement = {
                startX,
                startY,
                orientation: targetOrientation,
                intersections
              };
            }
          }
        }
      }
    }

    if (bestPlacement) {
      applyPlacement(candidate, bestPlacement.startX, bestPlacement.startY, bestPlacement.orientation);
    }
  }

  function checkPlacement(startX, startY, orientation, wordStr) {
    const len = wordStr.length;
    let intersections = 0;

    // Boundary check before start
    const beforeX = orientation === 'across' ? startX - 1 : startX;
    const beforeY = orientation === 'across' ? startY : startY - 1;
    if (getCell(beforeX, beforeY)) return null;

    // Boundary check after end
    const afterX = orientation === 'across' ? startX + len : startX;
    const afterY = orientation === 'across' ? startY : startY + len;
    if (getCell(afterX, afterY)) return null;

    for (let i = 0; i < len; i++) {
      const cx = orientation === 'across' ? startX + i : startX;
      const cy = orientation === 'across' ? startY : startY + i;
      const existing = getCell(cx, cy);

      if (existing) {
        // Can only intersect if orientation differs and characters match
        if (orientation === 'across' && existing.acrossWord) return null;
        if (orientation === 'down' && existing.downWord) return null;
        if (normChar(existing.char) !== normChar(wordStr[i])) return null;
        intersections++;
      } else {
        // Empty cell: parallel neighbors must be empty to avoid touching unintersected words
        if (orientation === 'across') {
          if (getCell(cx, cy - 1) || getCell(cx, cy + 1)) return null;
        } else {
          if (getCell(cx - 1, cy) || getCell(cx + 1, cy)) return null;
        }
      }
    }

    return intersections > 0 ? { intersections } : null;
  }

  function calculateNewBBox(startX, startY, orientation, len) {
    let minX = startX, maxX = orientation === 'across' ? startX + len - 1 : startX;
    let minY = startY, maxY = orientation === 'down' ? startY + len - 1 : startY;

    for (const p of placed) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.orientation === 'across' ? p.x + p.word.length - 1 : p.x);
      maxY = Math.max(maxY, p.orientation === 'down' ? p.y + p.word.length - 1 : p.y);
    }
    return { minX, maxX, minY, maxY };
  }

  function applyPlacement(candidate, startX, startY, orientation) {
    const wordStr = candidate.word;
    for (let i = 0; i < wordStr.length; i++) {
      const cx = orientation === 'across' ? startX + i : startX;
      const cy = orientation === 'across' ? startY : startY + i;
      const existing = getCell(cx, cy);

      if (existing) {
        if (orientation === 'across') existing.acrossWord = candidate;
        else existing.downWord = candidate;
      } else {
        setCell(cx, cy, {
          char: wordStr[i],
          acrossWord: orientation === 'across' ? candidate : null,
          downWord: orientation === 'down' ? candidate : null
        });
      }
    }

    placed.push({
      ...candidate,
      x: startX,
      y: startY,
      orientation
    });
  }

  // Normalize coordinates so minX = 0, minY = 0
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const [key] of grid) {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;

  // Offset all placed words
  for (const p of placed) {
    p.x -= minX;
    p.y -= minY;
  }

  // Assign standard crossword clue numbers (scan row-by-row, top-to-bottom, RTL)
  let clueCounter = 1;
  const clueAssignments = new Map(); // "x,y" => number

  // Sort starts by y ascending, then x ascending
  const startingPositions = [];
  for (const p of placed) {
    startingPositions.push({ x: p.x, y: p.y, word: p });
  }
  startingPositions.sort((a, b) => a.y - b.y || a.x - b.x);

  for (const pos of startingPositions) {
    const key = `${pos.x},${pos.y}`;
    if (!clueAssignments.has(key)) {
      clueAssignments.set(key, clueCounter++);
    }
    pos.word.clueNumber = clueAssignments.get(key);
  }

  // Build 2D matrix
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const [key, val] of grid) {
    const [x, y] = key.split(',').map(Number);
    const nx = x - minX;
    const ny = y - minY;
    matrix[ny][nx] = {
      char: val.char,
      clueNumber: clueAssignments.get(`${nx},${ny}`) || null
    };
  }

  return {
    cols,
    rows,
    placedWords: placed,
    matrix
  };
}

// Export for Node.js (tests) and Browser (window)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateCrossword, normChar };
} else {
  window.generateCrossword = generateCrossword;
}
