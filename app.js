let allWords = [];
let currentPuzzle = null;

async function init() {
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    allWords = await res.json();

    populateCategories();
    setupEventListeners();
    buildNewPuzzle();
  } catch (err) {
    console.error('Failed to load words.json:', err);
    document.getElementById('puzzle-view').innerHTML =
      '<p style="color:red; padding:20px;">שגיאה בטעינת מאגר המילים (words.json). ודא שהקובץ קיים ותקין.</p>';
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

function renderPuzzle() {
  const gridEl = document.getElementById('puzzle-grid');
  if (!gridEl || !currentPuzzle) return;

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
    // Focus next cell in current word
    focusNextCell(r, c);
  }
}

function handleCellKeydown(e, r, c) {
  if (e.key === 'Backspace' && !e.target.value) {
    focusPrevCell(r, c);
  }
}

function focusNextCell(r, c) {
  // Try right-to-left next cell in row, then column down
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
  const acrossList = document.getElementById('clues-across');
  const downList = document.getElementById('clues-down');
  if (!acrossList || !downList || !currentPuzzle) return;

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
    li.innerHTML = `<span class="clue-badge">${item.clueNumber}.</span> ${item.clue} <small style="color:#6b7280">(${item.word.length})</small>`;
    acrossList.appendChild(li);
  }

  for (const item of down) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="clue-badge">${item.clueNumber}.</span> ${item.clue} <small style="color:#6b7280">(${item.word.length})</small>`;
    downList.appendChild(li);
  }
}

function renderSolution() {
  const solGrid = document.getElementById('solution-grid');
  if (!solGrid || !currentPuzzle) return;

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
