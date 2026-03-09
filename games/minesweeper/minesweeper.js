// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Minesweeper 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

const gridEl = document.getElementById('grid');
const timerEl = document.getElementById('timer');
const mineCountEl = document.getElementById('mine-count');
const userBadge = document.getElementById('user-badge');

let rows, cols, minesTotal;
let board = [];
let gameActive = false;
let timer = 0;
let interval = null;
let minesFound = 0;
let revealedCells = 0;
let firstClick = true;
let popupCallback = null;
let popupSecondaryCallback = null;

// 팝업 함수들
function showPopup(options) {
  const overlay = document.getElementById('popup-overlay');
  const iconEl = document.getElementById('popup-icon');
  const titleEl = document.getElementById('popup-title');
  const messageEl = document.getElementById('popup-message');
  const scoreBox = document.getElementById('popup-score-box');
  const timeValue = document.getElementById('popup-time-value');
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
  btnEl.textContent = options.btnText || '🏠 홈으로';
  btnSecondaryEl.textContent = options.secondaryBtnText || '🔄 다시하기';

  // 버튼 스타일 설정
  btnEl.className = 'popup-btn' + (options.btnClass ? ' ' + options.btnClass : '');
  btnSecondaryEl.style.display = options.showSecondary !== false ? 'inline-block' : 'none';

  // 점수/시간 표시
  if (options.time !== undefined || options.currScore !== undefined) {
    scoreBox.style.display = 'block';

    if (options.time !== undefined) {
      timeValue.textContent = `${options.time}초`;
    }

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

  popupCallback = options.onClose || (() => location.href = "../../index.html");
  popupSecondaryCallback = options.onSecondary || (() => resetGame());
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

const config = {
  easy: { r: 8, c: 10, m: 10, baseScore: 500 },
  normal: { r: 12, c: 14, m: 30, baseScore: 2000 },
  hard: { r: 20, c: 24, m: 99, baseScore: 8000 }
};

// ===== Score Balancing =====
// easy 7초 = 6250을 기준점으로 고정하고 난이도는 baseScore 비율로 반영
const SCORE_CALIBRATION = { baseScore: 500, baseTime: 7, basePoints: 6250 };

// 시간 페널티 완화 지수(낮을수록 오래 걸려도 덜 깎임)
const SCORE_P = 0.59;

// 점수 계산 (timer는 초 단위)
function calcScore(diffKey, timeSec) {
  const cfg = config[diffKey];
  const t = Math.max(1, Number(timeSec) || 1);

  const raw =
    SCORE_CALIBRATION.basePoints *
    (cfg.baseScore / SCORE_CALIBRATION.baseScore) *
    Math.pow(SCORE_CALIBRATION.baseTime / t, SCORE_P);

  // 최소점수는 원하시는 값으로 (기존 10 유지)
  return Math.max(10, Math.round(raw));
}

window.onload = async () => {
  await waitForUser();
  updateUserBadge(userBadge);
  resetGame();
};

function resetGame() {
  const diff = document.getElementById('difficulty').value;
  rows = config[diff].r;
  cols = config[diff].c;
  minesTotal = config[diff].m;

  clearInterval(interval);
  timer = 0;
  timerEl.textContent = 0;
  minesFound = 0;
  revealedCells = 0;
  firstClick = true;
  gameActive = true;
  mineCountEl.textContent = minesTotal;

  // 어려움 모드일 때 클래스 추가
  if (diff === 'hard') {
    gridEl.classList.add('hard-mode');
  } else {
    gridEl.classList.remove('hard-mode');
  }

  initBoard();
}

function initBoard() {
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  gridEl.innerHTML = '';
  board = [];

  for (let r = 0; r < rows; r++) {
    board[r] = [];
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');

      // 마우스 우클릭
      cell.oncontextmenu = (e) => { e.preventDefault(); toggleFlag(r, c); };
      // 마우스 좌클릭
      cell.onclick = () => clickCell(r, c);
      // 마우스 휠클릭 (코드 기능)
      cell.onmousedown = (e) => { if (e.button === 1) { e.preventDefault(); chordCell(r, c); } };

      // 모바일 롱탭 구현
      let touchTimer;
      cell.ontouchstart = () => { touchTimer = setTimeout(() => toggleFlag(r, c), 500); };
      cell.ontouchend = () => clearTimeout(touchTimer);

      gridEl.appendChild(cell);
      board[r][c] = { mine: false, revealed: false, flagged: false, count: 0, el: cell };
    }
  }
}

// 코드 기능: 숫자 칸에서 주변 깃발 수가 맞으면 나머지 칸 자동 열기
function chordCell(r, c) {
  if (!gameActive || firstClick) return;
  const cell = board[r][c];

  // 열린 숫자 칸에서만 작동
  if (!cell.revealed || cell.count === 0) return;

  // 주변 깃발 개수 세기
  let flagCount = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (board[r + i]?.[c + j]?.flagged) flagCount++;
    }
  }

  // 깃발 수가 숫자와 일치하면 주변 칸 열기
  if (flagCount === cell.count) {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const neighbor = board[r + i]?.[c + j];
        if (neighbor && !neighbor.revealed && !neighbor.flagged) {
          if (neighbor.mine) {
            gameOver(false);
            return;
          }
          reveal(r + i, c + j);
        }
      }
    }
    // 승리 체크
    if (revealedCells === (rows * cols) - minesTotal) gameOver(true);
  }
}

function clickCell(r, c) {
  if (!gameActive || board[r][c].flagged || board[r][c].revealed) return;

  if (firstClick) {
    setupMines(r, c);
    startTimer();
    firstClick = false;
  }

  if (board[r][c].mine) {
    gameOver(false);
  } else {
    reveal(r, c);
    if (revealedCells === (rows * cols) - minesTotal) gameOver(true);
  }
}

function setupMines(exR, exC) {
  let placed = 0;
  while (placed < minesTotal) {
    let r = Math.floor(Math.random() * rows);
    let c = Math.floor(Math.random() * cols);
    // 첫 클릭 지점 주변 3x3은 지뢰 제외 (구글 방식)
    if (!board[r][c].mine && Math.abs(r - exR) > 1 && Math.abs(c - exC) > 1) {
      board[r][c].mine = true;
      placed++;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (board[r + i]?.[c + j]?.mine) count++;
        }
      }
      board[r][c].count = count;
    }
  }
}

function reveal(r, c) {
  const b = board[r][c];
  if (b.revealed || b.flagged) return;

  b.revealed = true;
  b.el.classList.add('revealed');
  revealedCells++;

  if (b.count > 0) {
    b.el.textContent = b.count;
    b.el.classList.add('n' + b.count);
  } else {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (board[r + i]?.[c + j]) reveal(r + i, c + j);
      }
    }
  }
}

function toggleFlag(r, c) {
  if (!gameActive || board[r][c].revealed) return;
  const b = board[r][c];
  b.flagged = !b.flagged;
  b.el.classList.toggle('flagged');
  minesFound += b.flagged ? 1 : -1;
  mineCountEl.textContent = minesTotal - minesFound;
}

function startTimer() {
  interval = setInterval(() => {
    timer++;
    timerEl.textContent = timer;
  }, 1000);
}

function gameOver(win) {
  gameActive = false;
  clearInterval(interval);

  if (win) {
    const diffKey = document.getElementById('difficulty').value;
    const diffName = document.getElementById('difficulty').options[document.getElementById('difficulty').selectedIndex].text;
    // 점수 계산(밸런스): easy 7초=6250 기준 + 시간 페널티 완화
    const score = calcScore(diffKey, timer);

    saveScore(score, timer, diffName);
  } else {
    board.forEach(row => row.forEach(cell => {
      if (cell.mine) cell.el.classList.add('mine');
    }));

    showPopup({
      icon: '💣',
      title: '게임 오버!',
      message: '지뢰를 밟았습니다!',
      time: timer,
      sub: '다시 도전해보세요!',
      btnClass: 'danger',
      btnText: '🏠 홈으로',
      secondaryBtnText: '🔄 다시하기',
      onSecondary: () => resetGame(),
      onClose: () => location.href = "../../index.html"
    });
  }
}

async function saveScore(score, time, diff) {
  // 저장 시 인증 상태 확인
  await waitForUser();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    showPopup({
      icon: '🎉',
      title: '승리!',
      message: '게스트는 점수 저장이 불가능합니다.',
      time: time,
      currScore: score,
      sub: '로그인하면 점수를 저장할 수 있습니다.',
      btnText: '🏠 홈으로',
      secondaryBtnText: '🔄 다시하기',
      onSecondary: () => resetGame(),
      onClose: () => location.href = "../../index.html"
    });
    return;
  }

  try {
    const ref = db.collection("minesweeper_scores").doc(user.uid);
    const doc = await ref.get();
    const prevScore = doc.exists ? Number(doc.data().score ?? 0) : 0;

    if (!doc.exists || score > prevScore) {
      await ref.set({
        uid: user.uid,
        userId: user.displayName || user.email || "회원",
        score: score,
        timeSeconds: time,
        difficulty: diff,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if (prevScore > 0) {
        showPopup({
          icon: '🏆',
          title: '새로운 최고 기록!',
          message: '축하합니다! 기록이 갱신되었습니다.',
          time: time,
          prevScore: prevScore,
          currScore: score,
          isNewRecord: true,
          btnText: '🏠 홈으로',
          secondaryBtnText: '🔄 다시하기',
          onSecondary: () => resetGame(),
          onClose: () => location.href = "../../index.html"
        });
      } else {
        showPopup({
          icon: '🎉',
          title: '승리!',
          message: '점수가 등록되었습니다!',
          time: time,
          currScore: score,
          isNewRecord: true,
          btnText: '🏠 홈으로',
          secondaryBtnText: '🔄 다시하기',
          onSecondary: () => resetGame(),
          onClose: () => location.href = "../../index.html"
        });
      }
    } else {
      showPopup({
        icon: '🎉',
        title: '승리!',
        message: '기존 기록이 더 높습니다.',
        time: time,
        prevScore: prevScore,
        currScore: score,
        isNewRecord: false,
        sub: '이전 최고 기록이 유지됩니다.',
        btnText: '🏠 홈으로',
        secondaryBtnText: '🔄 다시하기',
        onSecondary: () => resetGame(),
        onClose: () => location.href = "../../index.html"
      });
    }
  } catch (e) {
    console.error("점수 저장 실패", e);
    showPopup({
      icon: '❌',
      title: '저장 실패',
      message: '점수 저장에 실패했습니다.',
      time: time,
      currScore: score,
      sub: '네트워크 연결을 확인해주세요.',
      btnText: '🏠 홈으로',
      secondaryBtnText: '🔄 다시하기',
      onSecondary: () => resetGame(),
      onClose: () => location.href = "../../index.html"
    });
  }
}
