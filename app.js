let allWords = [];
let currentPuzzle = null;
let currentMode = 'arrowword'; // 'arrowword' (default) or 'standard'

async function init() {
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    allWords = await res.json();

    populateCategories();
    setupEventListeners();
    updateModeUI();
    buildNewPuzzle();
  } catch (err) {
    console.error('Failed to load words.json:', err);
    const gridEl = document.getElementById('puzzle-grid');
    if (gridEl) {
      gridEl.innerHTML =
        '<p style="color:red; padding:20px;">שגיאה בטעינת מאגר המילים (words.json). ודא שהקובץ קיים ותקין.</p>';
    }
  }
}

function populateCategories() {
  const categorySelect = document.getElementById('category-filter');
  if (!categorySelect) return;

  const categories = Array.from(new Set(allWords.map(w => w.category).filter(Boolean)));
  categorySelect.innerHTML = '<option value="">כל הקטגוריות</option>';
  for (const cat of categories) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  }
}

function setupEventListeners() {
  document.getElementById('btn-generate')?.addEventListener('click', () => buildNewPuzzle());
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('btn-check')?.addEventListener('click', () => checkAnswers());
  document.getElementById('btn-toggle-solution')?.addEventListener('click', () => toggleSolution());
  document.getElementById('category-filter')?.addEventListener('change', () => buildNewPuzzle());

  // Mode radio toggle
  document.querySelectorAll('input[name="puzzle-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setMode(e.target.value);
    });
  });
}

function setMode(mode) {
  currentMode = mode;
  updateModeUI();
  if (currentPuzzle) {
    renderPuzzle();
    renderClues();
    renderSolution();
  } else {
    buildNewPuzzle();
  }
}

function updateModeUI() {
  const container = document.querySelector('.crossword-container');
  if (container) {
    if (currentMode === 'arrowword') {
      container.classList.add('arrowword-mode');
      container.classList.remove('standard-mode');
    } else {
      container.classList.add('standard-mode');
      container.classList.remove('arrowword-mode');
    }
  }

  const btnGen = document.getElementById('btn-generate');
  if (btnGen) {
    btnGen.textContent = currentMode === 'arrowword' ? 'צור תשחץ חדש' : 'צור תשבץ חדש';
  }

  const solTitle = document.getElementById('solution-title');
  if (solTitle) {
    solTitle.textContent = currentMode === 'arrowword' ? 'פתרון התשחץ' : 'פתרון התשבץ';
  }

  const radio = document.querySelector(`input[name="puzzle-mode"][value="${currentMode}"]`);
  if (radio) radio.checked = true;
}

function buildNewPuzzle() {
  const catFilter = document.getElementById('category-filter')?.value;
  let pool = allWords;

  if (catFilter) {
    pool = allWords.filter(w => w.category === catFilter);
    if (pool.length < 10) pool = allWords; // Fallback if too few words in category
  }

  // Shuffle and sample
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const sample = shuffled.slice(0, 35);

  currentPuzzle = generateCrossword(sample, 15);
  if (!currentPuzzle || currentPuzzle.placedWords.length < 3) {
    currentPuzzle = generateCrossword(shuffled.slice(0, 40), 15);
  }

  renderPuzzle();
  renderClues();
  renderSolution();
}

/**
 * Arrowword Post-Processing
 * Calculates padding and injects clues into blocked cells preceding words.
 */
function prepareArrowwordPuzzle(puzzle) {
  if (!puzzle) return null;
  const { cols, rows, placedWords, matrix } = puzzle;

  // 1. Grid Padding:
  // In Hebrew RTL, Across words flow right-to-left. First letter is at (p.x, p.y).
  // Clue cell must be immediately to the right: (p.x - 1, p.y).
  // Down words flow top-to-bottom. First letter is at (p.x, p.y).
  // Clue cell must be immediately above: (p.x, p.y - 1).
  let padX = 0;
  let padY = 0;

  for (const p of placedWords) {
    if (p.orientation === 'across' && p.x - 1 < 0) {
      padX = 1;
    }
    if (p.orientation === 'down' && p.y - 1 < 0) {
      padY = 1;
    }
  }

  const newCols = cols + padX;
  const newRows = rows + padY;

  // Initialize new 2D matrix
  const newMatrix = Array.from({ length: newRows }, () => Array(newCols).fill(null));

  // Copy letter cells to shifted positions
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c]) {
        newMatrix[r + padY][c + padX] = {
          type: 'letter',
          char: matrix[r][c].char
        };
      }
    }
  }

  // Inject clues and detect dual-clue collisions
  for (const p of placedWords) {
    const wordX = p.x + padX;
    const wordY = p.y + padY;
    const clueX = p.orientation === 'across' ? wordX - 1 : wordX;
    const clueY = p.orientation === 'across' ? wordY : wordY - 1;

    let cell = newMatrix[clueY][clueX];
    if (!cell || cell.type !== 'clue') {
      cell = {
        type: 'clue',
        across: null,
        down: null
      };
      newMatrix[clueY][clueX] = cell;
    }

    if (p.orientation === 'across') {
      cell.across = p.clue;
    } else {
      cell.down = p.clue;
    }
  }

  return {
    cols: newCols,
    rows: newRows,
    matrix: newMatrix,
    padX,
    padY
  };
}

function createArrowwordClueElement(cellData) {
  const cellDiv = document.createElement('div');

  if (cellData.across && cellData.down) {
    // Collision / Double clue
    cellDiv.className = 'arrowword-cell double-clue';
    cellDiv.innerHTML = `
  <div class="clue-across">
    ${escapeHtml(cellData.across)}<br><span class="arrow">🡐</span>
  </div>
  <div class="clue-down">
    ${escapeHtml(cellData.down)}<br><span class="arrow">🡓</span>
  </div>
`;
  } else {
    // Single clue
    cellDiv.className = 'arrowword-cell';
    const isAcross = Boolean(cellData.across);
    const clueText = isAcross ? cellData.across : cellData.down;
    const arrow = isAcross ? '🡐' : '🡓';
    cellDiv.innerHTML = `
  <span>${escapeHtml(clueText)}</span>
  <span class="arrow">${arrow}</span>
`;
  }

  return cellDiv;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPuzzle() {
  const gridEl = document.getElementById('puzzle-grid');
  if (!gridEl || !currentPuzzle) return;

  if (currentMode === 'arrowword') {
    renderArrowwordPuzzle(gridEl);
  } else {
    renderStandardPuzzle(gridEl);
  }
}

function renderArrowwordPuzzle(gridEl) {
  const arrowData = prepareArrowwordPuzzle(currentPuzzle);
  if (!arrowData) return;

  const { cols, rows, matrix } = arrowData;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
  gridEl.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = matrix[r][c];

      if (!cellData) {
        // Blocked / empty cell
        const cellDiv = document.createElement('div');
        cellDiv.className = 'grid-cell blocked';
        gridEl.appendChild(cellDiv);
      } else if (cellData.type === 'clue') {
        const clueEl = createArrowwordClueElement(cellData);
        gridEl.appendChild(clueEl);
      } else if (cellData.type === 'letter') {
        const cellDiv = document.createElement('div');
        cellDiv.className = 'grid-cell';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 1;
        input.dataset.row = r;
        input.dataset.col = c;
        input.dataset.correct = cellData.char;

        input.addEventListener('input', (e) => handleCellInput(e, r, c));
        input.addEventListener('keydown', (e) => handleCellKeydown(e, r, c));

        cellDiv.appendChild(input);
        gridEl.appendChild(cellDiv);
      }
    }
  }
}

function renderStandardPuzzle(gridEl) {
  const { cols, rows, matrix } = currentPuzzle;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
  gridEl.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = matrix[r][c];
      const cellDiv = document.createElement('div');
      cellDiv.className = 'grid-cell';

      if (!cellData) {
        cellDiv.classList.add('blocked');
      } else {
        if (cellData.clueNumber) {
          const numSpan = document.createElement('span');
          numSpan.className = 'cell-number';
          numSpan.textContent = cellData.clueNumber;
          cellDiv.appendChild(numSpan);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 1;
        input.dataset.row = r;
        input.dataset.col = c;
        input.dataset.correct = cellData.char;

        input.addEventListener('input', (e) => handleCellInput(e, r, c));
        input.addEventListener('keydown', (e) => handleCellKeydown(e, r, c));

        cellDiv.appendChild(input);
      }
      gridEl.appendChild(cellDiv);
    }
  }
}

function handleCellInput(e, r, c) {
  const input = e.target;
  const val = input.value.trim();
  input.parentElement.classList.remove('cell-correct', 'cell-incorrect');

  if (val) {
    focusNextCell(r, c);
  }
}

function handleCellKeydown(e, r, c) {
  if (e.key === 'Backspace' && !e.target.value) {
    focusPrevCell(r, c);
  } else if (e.key === 'ArrowLeft') {
    // In RTL, ArrowLeft moves forward in the row
    const next = document.querySelector(`input[data-row="${r}"][data-col="${c + 1}"]`);
    if (next) next.focus();
  } else if (e.key === 'ArrowRight') {
    // In RTL, ArrowRight moves backward in the row
    const prev = document.querySelector(`input[data-row="${r}"][data-col="${c - 1}"]`);
    if (prev) prev.focus();
  } else if (e.key === 'ArrowDown') {
    const down = document.querySelector(`input[data-row="${r + 1}"][data-col="${c}"]`);
    if (down) down.focus();
  } else if (e.key === 'ArrowUp') {
    const up = document.querySelector(`input[data-row="${r - 1}"][data-col="${c}"]`);
    if (up) up.focus();
  }
}

function focusNextCell(r, c) {
  // In RTL, next cell in across word is c + 1, down word is r + 1
  const nextInput = document.querySelector(`input[data-row="${r}"][data-col="${c + 1}"]`) ||
                    document.querySelector(`input[data-row="${r + 1}"][data-col="${c}"]`);
  if (nextInput) nextInput.focus();
}

function focusPrevCell(r, c) {
  const prevInput = document.querySelector(`input[data-row="${r}"][data-col="${c - 1}"]`) ||
                    document.querySelector(`input[data-row="${r - 1}"][data-col="${c}"]`);
  if (prevInput) prevInput.focus();
}

function renderClues() {
  const cluesContainer = document.getElementById('clues-container');
  const acrossList = document.getElementById('clues-across');
  const downList = document.getElementById('clues-down');
  if (!cluesContainer || !currentPuzzle) return;

  // In Arrowword mode, external clues must be completely hidden
  if (currentMode === 'arrowword') {
    cluesContainer.classList.add('hidden');
    return;
  }

  cluesContainer.classList.remove('hidden');
  if (!acrossList || !downList) return;

  acrossList.innerHTML = '';
  downList.innerHTML = '';

  const across = currentPuzzle.placedWords
    .filter(w => w.orientation === 'across')
    .sort((a, b) => a.clueNumber - b.clueNumber);

  const down = currentPuzzle.placedWords
    .filter(w => w.orientation === 'down')
    .sort((a, b) => a.clueNumber - b.clueNumber);

  for (const item of across) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="clue-badge">${item.clueNumber}.</span> ${escapeHtml(item.clue)} <small style="color:#6b7280">(${item.word.length})</small>`;
    acrossList.appendChild(li);
  }

  for (const item of down) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="clue-badge">${item.clueNumber}.</span> ${escapeHtml(item.clue)} <small style="color:#6b7280">(${item.word.length})</small>`;
    downList.appendChild(li);
  }
}

function renderSolution() {
  const solGrid = document.getElementById('solution-grid');
  if (!solGrid || !currentPuzzle) return;

  if (currentMode === 'arrowword') {
    renderArrowwordSolution(solGrid);
  } else {
    renderStandardSolution(solGrid);
  }
}

function renderArrowwordSolution(solGrid) {
  const arrowData = prepareArrowwordPuzzle(currentPuzzle);
  if (!arrowData) return;

  const { cols, rows, matrix } = arrowData;
  solGrid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  solGrid.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
  solGrid.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = matrix[r][c];

      if (!cellData) {
        const cellDiv = document.createElement('div');
        cellDiv.className = 'grid-cell blocked';
        solGrid.appendChild(cellDiv);
      } else if (cellData.type === 'clue') {
        const clueEl = createArrowwordClueElement(cellData);
        solGrid.appendChild(clueEl);
      } else if (cellData.type === 'letter') {
        const cellDiv = document.createElement('div');
        cellDiv.className = 'grid-cell solved';
        const letterSpan = document.createElement('span');
        letterSpan.textContent = cellData.char;
        cellDiv.appendChild(letterSpan);
        solGrid.appendChild(cellDiv);
      }
    }
  }
}

function renderStandardSolution(solGrid) {
  const { cols, rows, matrix } = currentPuzzle;
  solGrid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  solGrid.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
  solGrid.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = matrix[r][c];
      const cellDiv = document.createElement('div');
      cellDiv.className = 'grid-cell';

      if (!cellData) {
        cellDiv.classList.add('blocked');
      } else {
        if (cellData.clueNumber) {
          const numSpan = document.createElement('span');
          numSpan.className = 'cell-number';
          numSpan.textContent = cellData.clueNumber;
          cellDiv.appendChild(numSpan);
        }
        cellDiv.classList.add('solved');
        const letterSpan = document.createElement('span');
        letterSpan.textContent = cellData.char;
        cellDiv.appendChild(letterSpan);
      }
      solGrid.appendChild(cellDiv);
    }
  }
}

function checkAnswers() {
  const inputs = document.querySelectorAll('#puzzle-grid input');
  inputs.forEach(input => {
    const val = input.value.trim();
    const correct = input.dataset.correct;
    const parent = input.parentElement;
    parent.classList.remove('cell-correct', 'cell-incorrect');

    if (val) {
      if (typeof normChar === 'function' && normChar(val) === normChar(correct)) {
        parent.classList.add('cell-correct');
      } else if (val === correct) {
        parent.classList.add('cell-correct');
      } else {
        parent.classList.add('cell-incorrect');
      }
    }
  });
}

function toggleSolution() {
  const solSection = document.getElementById('solution-view');
  const btn = document.getElementById('btn-toggle-solution');
  if (!solSection) return;

  const isHidden = solSection.classList.toggle('hidden');
  if (btn) {
    btn.textContent = isHidden ? 'הצג פתרון' : 'הסתר פתרון';
  }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
