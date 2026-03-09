// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Sudoku 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

const userBadge = document.getElementById("user-badge");
// 테마 초기화 (깜빡임 방지를 위해 head에서 실행)
let solution = [], cellData = [];
let startTime, timerInterval, mistakeCount = 0;
let selectedCell = null, memoMode = false, isGameRunning = false;
let popupCallback = null;
let popupSecondaryCallback = null;

// 팝업 함수들
function showPopup(options) {
  const overlay = document.getElementById('popup-overlay');
  const iconEl = document.getElementById('popup-icon');
  const titleEl = document.getElementById('popup-title');
  const messageEl = document.getElementById('popup-message');
  const scoreBox = document.getElementById('popup-score-box');
  const prevScoreRow = document.getElementById('popup-prev-score');
  const currScoreRow = document.getElementById('popup-curr-score');
  const prevValue = document.getElementById('popup-prev-value');
  const currValue = document.getElementById('popup-curr-value');
  const subEl = document.getElementById('popup-sub');
  const btnEl = document.getElementById('popup-btn');
  const btnSecondaryEl = document.getElementById('popup-btn-secondary');

  iconEl.textContent = options.icon || '📢';
  titleEl.textContent = options.title || '알림';
  messageEl.textContent = options.message || '';
  subEl.textContent = options.sub || '';
  btnEl.textContent = options.btnText || '확인';

  // 두 번째 버튼 (다시하기 등)
  if (options.secondaryBtnText) {
    btnSecondaryEl.style.display = 'inline-block';
    btnSecondaryEl.textContent = options.secondaryBtnText;
    popupSecondaryCallback = options.onSecondary || null;
  } else {
    btnSecondaryEl.style.display = 'none';
    popupSecondaryCallback = null;
  }

  // 점수 표시
  if (options.prevScore !== undefined || options.currScore !== undefined) {
    scoreBox.style.display = 'block';

    if (options.prevScore !== undefined && options.prevScore > 0) {
      prevScoreRow.style.display = 'flex';
      prevValue.textContent = `${options.prevScore}점`;
    } else {
      prevScoreRow.style.display = 'none';
    }

    if (options.currScore !== undefined) {
      currScoreRow.style.display = 'flex';
      currValue.textContent = `${options.currScore}점`;
      currValue.className = 'value ' + (options.isNewRecord ? 'new-record' : 'highlight');
    } else {
      currScoreRow.style.display = 'none';
    }
  } else {
    scoreBox.style.display = 'none';
  }

  popupCallback = options.onClose || null;
  overlay.classList.add('show');
}

function closePopup() {
  const overlay = document.getElementById('popup-overlay');
  overlay.classList.remove('show');
  if (popupCallback) {
    setTimeout(() => {
      popupCallback();
      popupCallback = null;
    }, 250);
  }
}

function closePopupSecondary() {
  const overlay = document.getElementById('popup-overlay');
  overlay.classList.remove('show');
  if (popupSecondaryCallback) {
    setTimeout(() => {
      popupSecondaryCallback();
      popupSecondaryCallback = null;
    }, 250);
  }
}

window.onload = async () => {
  await waitForUser();
  updateUserBadge(userBadge);
};

function goLogin() {
  location.href = "../../index.html";
}

function startGame() {
  isGameRunning = true;
  document.getElementById('status-bar').classList.add('active');
  document.getElementById('num-pad').classList.add('active');

  const diff = parseInt(document.getElementById('difficulty').value, 10);
  const board = generateSudoku();
  const grid = document.getElementById('sudoku-grid');
  grid.innerHTML = "";
  mistakeCount = 0;
  selectedCell = null;
  document.getElementById('mistake-display').innerText = "실수: 0";
  cellData = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({ memos: new Set() })));

  let removed = 0;
  while (removed < diff) {
    let r = Math.floor(Math.random() * 9), c = Math.floor(Math.random() * 9);
    if (board[r][c] !== "") { board[r][c] = ""; removed++; }
  }

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r; cell.dataset.col = c;
      if (board[r][c] !== "") {
        cell.innerText = board[r][c];
        cell.classList.add('fixed');
        cell.onclick = function () { selectCell(this); };
      } else {
        cell.innerHTML = `<div class="memo-grid"></div><span class="val-span"></span>`;
        cell.onclick = function () { selectCell(this); };
      }
      grid.appendChild(cell);
    }
  }
  updateNumPadStatus();
  startTimer();
}

function selectCell(cell) {
  if (!isGameRunning) return;

  // 기존 선택 및 하이라이트 제거
  if (selectedCell) selectedCell.classList.remove('selected');
  clearHighlights();

  selectedCell = cell;
  selectedCell.classList.add('selected');

  // 하이라이트 적용
  applyHighlights(cell);
}

function clearHighlights() {
  document.querySelectorAll('.cell').forEach(c => {
    c.classList.remove('highlight-line', 'highlight-same');
  });
}

function applyHighlights(cell) {
  const row = parseInt(cell.dataset.row, 10);
  const col = parseInt(cell.dataset.col, 10);
  const cells = document.querySelectorAll('.cell');

  // 선택된 셀의 숫자 가져오기
  let selectedNum = null;
  if (cell.classList.contains('fixed')) {
    selectedNum = cell.innerText;
  } else {
    const valSpan = cell.querySelector('.val-span');
    if (valSpan && valSpan.innerText) {
      selectedNum = valSpan.innerText;
    }
  }

  cells.forEach((c, idx) => {
    const r = Math.floor(idx / 9);
    const cCol = idx % 9;

    // 상/하/좌/우(같은 행/열)만 하이라이트
    const sameRow = r === row;
    const sameCol = cCol === col;

    if (sameRow || sameCol) {
      c.classList.add('highlight-line');
    }

    // 동일 숫자 하이라이트는 그대로 유지
    if (selectedNum) {
      let cellNum = null;
      if (c.classList.contains('fixed')) {
        cellNum = c.innerText;
      } else {
        const vs = c.querySelector('.val-span');
        if (vs && vs.innerText) cellNum = vs.innerText;
      }

      if (cellNum === selectedNum) {
        c.classList.add('highlight-same');
      }
    }
  });
}

function handleInput(num) {
  if (!selectedCell || selectedCell.classList.contains('fixed')) return;

  // 1~9 입력인데 남은 개수가 0이면(키보드 포함) 막기
  if (num >= 1 && num <= 9 && !memoMode) {
    if (!canPlaceNumber(num)) return;
  }

  const r = selectedCell.dataset.row, c = selectedCell.dataset.col;
  const valSpan = selectedCell.querySelector('.val-span');
  const memoGrid = selectedCell.querySelector('.memo-grid');

  if (num === 0) {
    valSpan.innerText = "";
    valSpan.className = "val-span";
    cellData[r][c].memos.clear();
    updateMemoDisplay(selectedCell, r, c);

    updateNumPadStatus();   // ✅ 지우개 후 갱신
    return;
  }

  if (memoMode) {
    if (valSpan.innerText !== "") return;
    const memos = cellData[r][c].memos;
    if (memos.has(num)) memos.delete(num); else memos.add(num);
    updateMemoDisplay(selectedCell, r, c);

    // 메모는 실제 입력이 아니라서 남은 개수에 영향 없음(갱신 불필요)
  } else {
    memoGrid.style.display = 'none';
    valSpan.innerText = num;

    if (num == solution[r][c]) {
      valSpan.className = "val-span input-correct";
      updateNumPadStatus(); // ✅ 입력 후 갱신
      checkWin();
    } else {
      valSpan.className = "val-span input-wrong";
      mistakeCount++;
      document.getElementById('mistake-display').innerText = `실수: ${mistakeCount}`;

      updateNumPadStatus(); // ✅ 오답도 '보드에 입력된 숫자'이므로 갱신
    }
  }
}

function updateMemoDisplay(cell, r, c) {
  const memoGrid = cell.querySelector('.memo-grid');
  const valSpan = cell.querySelector('.val-span');
  if (valSpan.innerText === "") {
    memoGrid.style.display = 'grid';
    memoGrid.innerHTML = "";
    const memos = cellData[r][c].memos;
    for (let i = 1; i <= 9; i++) {
      const div = document.createElement('div');
      div.className = 'memo-num';
      div.innerText = memos.has(i) ? i : "";
      memoGrid.appendChild(div);
    }
  }
}

function toggleMemo() {
  memoMode = !memoMode;
  const btn = document.getElementById('memo-toggle');
  btn.innerText = memoMode ? "메모 ON" : "메모 OFF";
  btn.classList.toggle('memo-active', memoMode);
}

function getCurrentPlacedCounts() {
  const counts = Array(10).fill(0);
  document.querySelectorAll('.cell').forEach(cell => {
    let v = "";
    if (cell.classList.contains('fixed')) {
      v = (cell.innerText || "").trim();
    } else {
      const vs = cell.querySelector('.val-span');
      v = (vs ? vs.innerText : "").trim();
    }
    const n = parseInt(v, 10);
    if (n >= 1 && n <= 9) counts[n]++;
  });
  return counts;
}

function updateNumPadStatus() {
  const counts = getCurrentPlacedCounts();

  for (let n = 1; n <= 9; n++) {
    const btn = document.querySelector(`.num-btn[data-num="${n}"]`);
    if (!btn) continue;

    // 스도쿠 완성 해답에서는 각 숫자가 정확히 9개 존재
    const remaining = Math.max(0, 9 - counts[n]);

    const sub = btn.querySelector('.num-sub');
    if (sub) sub.textContent = remaining;

    if (remaining === 0) btn.classList.add('done');
    else btn.classList.remove('done');
  }
}

function canPlaceNumber(num) {
  // 키보드로도 9개 초과 입력을 막기 위한 가드(선택 셀에 같은 숫자면 허용/무시)
  if (!selectedCell) return true;

  let current = "";
  if (selectedCell.classList.contains('fixed')) return false;

  const vs = selectedCell.querySelector('.val-span');
  current = (vs ? vs.innerText : "").trim();

  if (String(num) === current) return true; // 같은 숫자 재입력은 변화 없음

  const counts = getCurrentPlacedCounts();
  const remaining = 9 - counts[num];
  return remaining > 0;
}

// 키보드 입력 지원 (PC 사용자용)
document.addEventListener('keydown', function (e) {
  if (!isGameRunning) return;

  // 팝업이 열려있으면 키보드 입력 무시
  const popupOverlay = document.getElementById('popup-overlay');
  if (popupOverlay && popupOverlay.classList.contains('show')) return;

  const key = e.key;

  // 숫자 1-9 입력
  if (key >= '1' && key <= '9') {
    e.preventDefault();
    handleInput(parseInt(key, 10));
    return;
  }

  // 0, Delete, Backspace로 지우기
  if (key === '0' || key === 'Delete' || key === 'Backspace') {
    e.preventDefault();
    handleInput(0);
    return;
  }

  // M 키로 메모 모드 토글
  if (key === 'm' || key === 'M') {
    e.preventDefault();
    toggleMemo();
    return;
  }

  // 방향키로 셀 이동
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    e.preventDefault();
    moveSelection(key);
    return;
  }
});

// 방향키로 셀 이동
function moveSelection(direction) {
  if (!selectedCell) {
    // 선택된 셀이 없으면 첫 번째 빈 셀 선택
    const firstCell = document.querySelector('.cell:not(.fixed)');
    if (firstCell) selectCell(firstCell);
    return;
  }

  let row = parseInt(selectedCell.dataset.row, 10);
  let col = parseInt(selectedCell.dataset.col, 10);

  switch (direction) {
    case 'ArrowUp': row = Math.max(0, row - 1); break;
    case 'ArrowDown': row = Math.min(8, row + 1); break;
    case 'ArrowLeft': col = Math.max(0, col - 1); break;
    case 'ArrowRight': col = Math.min(8, col + 1); break;
  }

  const cells = document.querySelectorAll('.cell');
  const targetCell = cells[row * 9 + col];
  if (targetCell) selectCell(targetCell);
}

function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('timer').innerText = `시간: ${m}:${s}`;
  }, 1000);
}

function generateSudoku() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillBoard(board);
  solution = board.map(row => [...row]);
  return board;
}

function fillBoard(board) {
  for (let i = 0; i < 81; i++) {
    let r = Math.floor(i / 9), c = i % 9;
    if (board[r][c] === 0) {
      let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
      for (let n of nums) {
        if (isValid(board, r, c, n)) {
          board[r][c] = n;
          if (fillBoard(board)) return true;
          board[r][c] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

function isValid(board, r, c, n) {
  for (let i = 0; i < 9; i++) if (board[r][i] === n || board[i][c] === n) return false;
  let sr = Math.floor(r / 3) * 3, sc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[sr + i][sc + j] === n) return false;
  return true;
}

function checkWin() {
  const cells = document.querySelectorAll('.cell:not(.fixed)');
  const emptyNeeded = cells.length;
  const correctCount = document.querySelectorAll('.val-span.input-correct').length;

  if (correctCount === emptyNeeded) {
    clearInterval(timerInterval);
    isGameRunning = false;

    const timeStr = document.getElementById('timer').innerText.split(': ')[1];
    const diffTxt = document.getElementById('difficulty').options[document.getElementById('difficulty').selectedIndex].text;

    showPopup({
      icon: '🎉',
      title: '축하합니다!',
      message: `${timeStr} 만에 클리어하셨습니다!`,
      sub: '점수를 저장하는 중...',
      btnText: '확인',
      onClose: () => saveScoreAndRedirect(timeStr, mistakeCount, diffTxt)
    });
  }
}

async function getDisplayNameFromFirestore() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  try {
    const doc = await db.collection("users").doc(user.uid).get();
    if (doc.exists && doc.data().displayName) {
      return doc.data().displayName;
    }
  } catch (e) {
    console.error("Firestore에서 displayName 가져오기 실패:", e);
  }
  return user.displayName || user.email || "Member";
}

async function saveScoreAndRedirect(time, mistakes, diff) {
  // 저장 전에 인증 상태를 확정
  await waitForUser();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    showPopup({
      icon: '👤',
      title: '게스트 계정',
      message: '게스트는 점수 등록이 불가능합니다.',
      sub: '점수 등록을 원하시면 홈에서 회원가입/로그인하세요.',
      secondaryBtnText: '🔄 다시하기',
      btnText: '🏠 홈으로',
      onSecondary: () => startGame(),
      onClose: () => location.href = "../../index.html"
    });
    return;
  }

  const t = time.split(':');
  const seconds = parseInt(t[0], 10) * 60 + parseInt(t[1], 10);

  let diffMultiplier = 1;
  if (diff === '보통') diffMultiplier = 1.5;
  else if (diff === '어려움') diffMultiplier = 2;

  const score = Math.max(0, Math.round((1000 - seconds - (mistakes * 10)) * diffMultiplier));

  // Firestore users 컬렉션에서 displayName 가져오기
  const displayId = await getDisplayNameFromFirestore();

  try {
    // 사용자당 1개 문서: best score만 유지(클라에서 비교)
    const ref = db.collection("sudoku_scores").doc(user.uid);
    const prev = await ref.get();
    const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

    if (score > prevScore) {
      await ref.set({
        uid: user.uid,
        userId: displayId,
        timeText: time,
        timeSeconds: seconds,
        mistakes: mistakes,
        score: score,
        difficulty: diff,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if (prevScore > 0) {
        showPopup({
          icon: '🏆',
          title: '새로운 최고 기록!',
          message: '축하합니다! 기록이 갱신되었습니다.',
          prevScore: prevScore,
          currScore: score,
          isNewRecord: true,
          secondaryBtnText: '🔄 다시하기',
          btnText: '🏠 홈으로',
          onSecondary: () => startGame(),
          onClose: () => location.href = "../../index.html"
        });
      } else {
        showPopup({
          icon: '✅',
          title: '점수 등록 완료',
          message: '점수가 성공적으로 등록되었습니다!',
          currScore: score,
          isNewRecord: true,
          secondaryBtnText: '🔄 다시하기',
          btnText: '🏠 홈으로',
          onSecondary: () => startGame(),
          onClose: () => location.href = "../../index.html"
        });
      }
    } else {
      showPopup({
        icon: '📊',
        title: '기록 비교',
        message: '기존 기록이 더 좋습니다.',
        prevScore: prevScore,
        currScore: score,
        isNewRecord: false,
        sub: '이전 최고 기록이 유지됩니다.',
        secondaryBtnText: '🔄 다시하기',
        btnText: '🏠 홈으로',
        onSecondary: () => startGame(),
        onClose: () => location.href = "../../index.html"
      });
    }
  } catch (e) {
    console.error("저장 실패: ", e);
    showPopup({
      icon: '❌',
      title: '저장 실패',
      message: '점수 저장에 실패했습니다.',
      sub: '네트워크 연결을 확인해주세요.',
      secondaryBtnText: '🔄 다시하기',
      btnText: '🏠 홈으로',
      onSecondary: () => startGame(),
      onClose: () => location.href = "../../index.html"
    });
  }
}
