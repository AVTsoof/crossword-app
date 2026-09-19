let allWords = [];
let currentPuzzle = null;
let currentMode = 'arrowword'; // 'arrowword' (default) or 'standard'

function normalizeHebrew(str) {
  const finalToRegular = {
    'ך': 'כ',
    'ם': 'מ',
    'ן': 'נ',
    'ף': 'פ',
    'ץ': 'צ'
  };
  return str.replace(/[ךםןףץ]/g, char => finalToRegular[char] || char);
}

async function init() {
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const rawWords = await res.json();
    allWords = rawWords.map(item => ({
      ...item,
      word: normalizeHebrew(item.word),
      answer: normalizeHebrew(item.word)
    }));

    populateCategories();
    setupEventListeners();
    updateModeUI();
    buildNewPuzzle();
  } catch (err) {
    console.error('Failed to load words.json:', err);
    const gridEl = document.getElementById('puzzle-grid');
    if (gridEl) {
      gridEl.innerHTML =
        '<p style=\"color:#b91c1c; padding:20px; font-weight:bold;\">שגיאה בטעינת מאגר המילים (words.json). ודא שהקובץ קיים ותקין.</p>';
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
  document.getElementById('btn-print')?.addEventListener('click', () => generatePDF());
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
  if (currentMode === mode && currentPuzzle) return;
  currentMode = mode;
  updateModeUI();
  buildNewPuzzle();
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

  // Update subtitle
  const subtitle = document.getElementById('mode-subtitle');
  if (subtitle) {
    subtitle.textContent = currentMode === 'arrowword'
      ? 'תשחץ ישראלי • הגדרות וחצים בתוך משבצות הלוח'
      : 'תשבץ קלאסי • משבצות ממוספרות עם רשימת הגדרות בצד';
  }

  // Update button labels
  const btnGenText = document.getElementById('btn-generate-text');
  if (btnGenText) {
    btnGenText.textContent = currentMode === 'arrowword' ? 'צור תשחץ חדש' : 'צור תשבץ חדש';
  }

  // Update solution title
  const solTitle = document.getElementById('solution-title');
  if (solTitle) {
    solTitle.textContent = currentMode === 'arrowword' ? 'פתרון התשחץ' : 'פתרון התשבץ';
  }

  // Update clues container visibility
  const cluesContainer = document.getElementById('clues-container');
  if (cluesContainer) {
    if (currentMode === 'arrowword') {
      cluesContainer.classList.add('hidden');
    } else {
      cluesContainer.classList.remove('hidden');
    }
  }

  // Ensure radio checked state
  const radio = document.querySelector(`input[name="puzzle-mode"][value="${currentMode}"]`);
  if (radio) radio.checked = true;

  // Clear status banner
  setStatus('', '');
}

function setStatus(text, type = 'info') {
  const banner = document.getElementById('status-message');
  if (!banner) return;
  if (!text) {
    banner.className = 'status-banner hidden';
    banner.textContent = '';
  } else {
    banner.className = `status-banner ${type}`;
    banner.textContent = text;
  }
}

function buildNewPuzzle() {
  setStatus('', '');
  const catFilter = document.getElementById('category-filter')?.value;
  let pool = allWords;

  if (catFilter) {
    pool = allWords.filter(w => w.category === catFilter);
    if (pool.length < 8) pool = allWords;
  }

  // Shuffle pool
  const shuffled = [...pool].sort(() => 0.5 - Math.random());

  // Distinct word counts & densities for each mode
  if (currentMode === 'standard') {
    // Standard Crossword: 16 words, high intersections
    currentPuzzle = generateCrossword(shuffled.slice(0, 45), 16);
    if (!currentPuzzle || currentPuzzle.placedWords.length < 4) {
      currentPuzzle = generateCrossword(shuffled.slice(0, 55), 16);
    }
  } else {
    // Arrowword: 12 words, compact board to accommodate clue padding
    currentPuzzle = generateCrossword(shuffled.slice(0, 35), 12);
    if (!currentPuzzle || currentPuzzle.placedWords.length < 3) {
      currentPuzzle = generateCrossword(shuffled.slice(0, 45), 12);
    }
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
        <span>${escapeHtml(cellData.across)}</span>
        <span class="arrow">←</span>
      </div>
      <div class="clue-down">
        <span>${escapeHtml(cellData.down)}</span>
        <span class="arrow">↓</span>
      </div>
    `;
  } else {
    // Single clue
    cellDiv.className = 'arrowword-cell';
    const isAcross = Boolean(cellData.across);
    const clueText = isAcross ? cellData.across : cellData.down;
    const arrow = isAcross ? '←' : '↓';
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
  gridEl.style.setProperty('--cols', cols);
  gridEl.style.setProperty('--rows', rows);
  gridEl.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = matrix[r][c];

      if (!cellData) {
        // Blocked / empty cell with subtle hatch pattern
        const cellDiv = document.createElement('div');
        cellDiv.className = 'grid-cell arrowword-empty';
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
  gridEl.style.setProperty('--cols', cols);
  gridEl.style.setProperty('--rows', rows);
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
        if (cellData.acrossClue) input.dataset.acrossClue = cellData.acrossClue;
        if (cellData.downClue) input.dataset.downClue = cellData.downClue;

        input.addEventListener('input', (e) => handleCellInput(e, r, c));
        input.addEventListener('keydown', (e) => handleCellKeydown(e, r, c));
        input.addEventListener('focus', () => handleCellFocus(cellData));
        input.addEventListener('blur', () => handleCellBlur());

        cellDiv.appendChild(input);
      }
      gridEl.appendChild(cellDiv);
    }
  }
}

function handleCellFocus(cellData) {
  if (currentMode !== 'standard' || !cellData) return;

  // Clear previous clue highlights
  document.querySelectorAll('.clues-list li').forEach(el => el.classList.remove('clue-active'));

  if (cellData.acrossClue) {
    const acrossEl = document.getElementById(`clue-across-${cellData.acrossClue}`);
    if (acrossEl) {
      acrossEl.classList.add('clue-active');
      acrossEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  if (cellData.downClue) {
    const downEl = document.getElementById(`clue-down-${cellData.downClue}`);
    if (downEl) {
      downEl.classList.add('clue-active');
      downEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function handleCellBlur() {
  if (currentMode !== 'standard') return;
  document.querySelectorAll('.clues-list li').forEach(el => el.classList.remove('clue-active'));
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
    li.id = `clue-across-${item.clueNumber}`;
    li.innerHTML = `<span class="clue-badge">${item.clueNumber}.</span> <span>${escapeHtml(item.clue)}</span> <small style="color:#64748b">(${item.word.length})</small>`;
    li.addEventListener('click', () => {
      const cell = document.querySelector(`input[data-row="${item.y}"][data-col="${item.x}"]`);
      if (cell) cell.focus();
    });
    acrossList.appendChild(li);
  }

  for (const item of down) {
    const li = document.createElement('li');
    li.id = `clue-down-${item.clueNumber}`;
    li.innerHTML = `<span class="clue-badge">${item.clueNumber}.</span> <span>${escapeHtml(item.clue)}</span> <small style="color:#64748b">(${item.word.length})</small>`;
    li.addEventListener('click', () => {
      const cell = document.querySelector(`input[data-row="${item.y}"][data-col="${item.x}"]`);
      if (cell) cell.focus();
    });
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
  solGrid.style.setProperty('--cols', cols);
  solGrid.style.setProperty('--rows', rows);
  solGrid.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = matrix[r][c];

      if (!cellData) {
        const cellDiv = document.createElement('div');
        cellDiv.className = 'grid-cell arrowword-empty';
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
  solGrid.style.setProperty('--cols', cols);
  solGrid.style.setProperty('--rows', rows);
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
  if (inputs.length === 0) return;

  let filledCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  inputs.forEach(input => {
    const val = input.value.trim();
    const correct = input.dataset.correct;
    const parent = input.parentElement;
    parent.classList.remove('cell-correct', 'cell-incorrect');

    if (val) {
      filledCount++;
      const isMatch = typeof normChar === 'function'
        ? normChar(val) === normChar(correct)
        : val === correct;

      if (isMatch) {
        parent.classList.add('cell-correct');
        correctCount++;
      } else {
        parent.classList.add('cell-incorrect');
        incorrectCount++;
      }
    }
  });

  if (filledCount === 0) {
    setStatus('יש למלא אותיות בלוח לפני הבדיקה.', 'info');
  } else if (incorrectCount === 0 && correctCount === inputs.length) {
    setStatus('כל הכבוד! פתרת את כל התשבץ בהצלחה! 🎉', 'success');
  } else if (incorrectCount === 0) {
    setStatus(`מצוין! כל ${correctCount} האותיות שמילאת נכונות. המשך לפתור!`, 'info');
  } else {
    setStatus(`נמצאו ${incorrectCount} אותיות שגויות (מסומנות באדום). נסה שוב!`, 'error');
  }
}

function toggleSolution() {
  const solSection = document.getElementById('solution-view');
  const btnText = document.getElementById('btn-solution-text');
  if (!solSection) return;

  const isHidden = solSection.classList.toggle('hidden');
  if (btnText) {
    btnText.textContent = isHidden ? 'הצג פתרון' : 'הסתר פתרון';
  }
}

// Start app
document.addEventListener('DOMContentLoaded', init);

async function generatePDF() {
  const container = document.getElementById('pdf-export-container');
  if (!container) return;

  // 1. Add export styling
  container.classList.add('pdf-export-active');

  // 2. Configure html2pdf options
  const opt = {
    margin:       [10, 10, 10, 10], // Margins in mm (top, right, bottom, left)
    filename:     'tashhet-puzzle.pdf',
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  {
      scale: 2,           // Sharp text rendering
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'landscape' // Fits horizontal crosswords cleanly
    },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  try {
    // 3. Render and save PDF
    await html2pdf().set(opt).from(container).save();
  } catch (err) {
    console.error('PDF export failed:', err);
  } finally {
    // 4. Restore regular screen styling
    container.classList.remove('pdf-export-active');
  }
}
