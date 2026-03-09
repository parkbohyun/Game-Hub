// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Block Blast 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

// 사용자 뱃지/인증 헬퍼 준비
/**********************
 * Firebase init
 **********************/
const userBadge = document.getElementById("user-badge");

/**********************
 * Game constants
 **********************/
const GRID = 8;

// 점수 룰(서비스용으로 무난하게 세팅)
const SCORE_PLACE_PER_BLOCK = 2;       // 블럭 1칸 놓을 때
const SCORE_LINE_BONUS = 80;           // 한 줄(가로/세로) 삭제 보너스
const SCORE_CLEAR_CELL_BONUS = 3;      // 삭제된 칸당 추가
const SCORE_COMBO_STEP = 40;           // 연속 삭제(콤보)당 추가
const SCORE_PERFECT_BONUS = 450;       // 보드가 완전히 비면(Perfect)

// 색상 팔레트(블럭 색)
const PALETTE = [
  "#ff7675", "#74b9ff", "#55efc4", "#ffeaa7",
  "#a29bfe", "#fd79a8", "#fab1a0", "#81ecec",
  "#fdcb6e", "#00b894"
];

// Block Blast 스타일 조각들(가볍고 재밌는 난이도)
// 각 shape는 (x,y) 좌표 목록 (0,0 기준)
const SHAPES = [
  // 1~3 블럭
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [0, 1]],
  // 4 블럭
  [[0, 0], [1, 0], [0, 1], [1, 1]], // 2x2
  [[0, 0], [1, 0], [2, 0], [3, 0]], // 4 bar
  [[0, 0], [0, 1], [0, 2], [0, 3]], // 4 bar vertical
  [[0, 0], [1, 0], [2, 0], [0, 1]], // L
  [[0, 0], [1, 0], [2, 0], [2, 1]], // mirrored L
  [[0, 0], [0, 1], [1, 1], [2, 1]], // J-ish
  [[2, 0], [0, 1], [1, 1], [2, 1]], // mirrored
  // 5 블럭(조금 난이도 증가)
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], // 5 bar
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], // 5 bar vertical
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], // 3x2 chunk
  [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]], // T-like
  [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], // Z-ish
  [[2, 0], [0, 1], [1, 1], [2, 1], [0, 2]]  // alt
];

/**********************
 * State
 **********************/
const boardEl = document.getElementById("board");
const trayEl = document.getElementById("tray");
const scoreEl = document.getElementById("score");
const toastEl = document.getElementById("toast");
const modalEl = document.getElementById("modal");
const modalTitleEl = document.getElementById("modal-title");
const modalBodyEl = document.getElementById("modal-body");
const modalBody2El = document.getElementById("modal-body2");
const btnRestartEl = document.getElementById("btn-restart");
const btnNewEl = document.getElementById("btn-new");
const btnClearEl = document.getElementById("btn-clear");

const lbListEl = document.getElementById("lb-list");
const lbStatusEl = document.getElementById("lb-status");

let cells = []; // 2D cell div refs
let grid = [];  // 2D data: null or color string
let pieces = []; // 3 pieces
let selectedPieceIndex = -1;

let score = 0;
let combo = 0;
let gameEnded = false;

// Drag state
let dragging = false;
let dragPieceIndex = -1;
let floatingEl = null;

/**********************
 * Helpers
 **********************/
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1200);
}

function randInt(n) { return Math.floor(Math.random() * n); }

// 파티클 이펙트 생성
function createParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    const size = 4 + Math.random() * 6;
    particle.style.width = size + "px";
    particle.style.height = size + "px";
    particle.style.background = color;
    particle.style.left = x + "px";
    particle.style.top = y + "px";

    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
    const distance = 30 + Math.random() * 50;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 20; // 약간 위로

    particle.style.setProperty("--dx", dx + "px");
    particle.style.setProperty("--dy", dy + "px");

    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 600);
  }
}

// 스코어 팝업 생성
function createScorePopup(x, y, points) {
  const popup = document.createElement("div");
  popup.className = "score-popup";
  popup.textContent = "+" + points;
  popup.style.left = x + "px";
  popup.style.top = y + "px";
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}

// 보드 흔들림 효과
function shakeBoard() {
  boardEl.classList.remove("shake");
  void boardEl.offsetWidth; // reflow 트리거
  boardEl.classList.add("shake");
  setTimeout(() => boardEl.classList.remove("shake"), 400);
}

// 셀 중심 좌표 가져오기
function getCellCenter(x, y) {
  const cell = cells[y]?.[x];
  if (!cell) return null;
  const rect = cell.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function shapeBounds(shape) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of shape) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function normalizeShape(shape) {
  const b = shapeBounds(shape);
  return shape.map(([x, y]) => [x - b.minX, y - b.minY]);
}

function newPiece() {
  const raw = SHAPES[randInt(SHAPES.length)];
  const shape = normalizeShape(raw);
  const color = PALETTE[randInt(PALETTE.length)];
  return { shape, color, used: false };
}

function resetGame() {
  gameEnded = false;
  score = 0;
  combo = 0;
  selectedPieceIndex = -1;
  updateScore(0, true);

  grid = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => null));
  pieces = [newPiece(), newPiece(), newPiece()];

  renderAll();
  hideModal();
  showToast("새 게임 시작");
}

function hardClear() {
  if (!confirm("정말 초기화할까요? (점수/보드 리셋)")) return;
  resetGame();
}

function updateScore(delta, absolute = false) {
  if (absolute) score = delta;
  else score = Math.max(0, score + delta);
  scoreEl.textContent = score;
}

function renderBoard() {
  if (cells.length === 0) {
    boardEl.innerHTML = "";
    cells = Array.from({ length: GRID }, (_, y) => {
      return Array.from({ length: GRID }, (_, x) => {
        const d = document.createElement("div");
        d.className = "cell";
        d.dataset.x = String(x);
        d.dataset.y = String(y);
        boardEl.appendChild(d);
        return d;
      });
    });
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const el = cells[y][x];
      const v = grid[y][x];
      el.classList.remove("filled");
      el.style.background = "";
      if (v) {
        el.classList.add("filled");
        el.style.background = v;
      }
    }
  }
}

function renderTray() {
  trayEl.innerHTML = "";
  pieces.forEach((p, idx) => {
    const pieceEl = document.createElement("div");
    pieceEl.className = "piece";
    if (p.used) pieceEl.classList.add("used");
    if (idx === selectedPieceIndex && !p.used) pieceEl.classList.add("selected");
    pieceEl.dataset.idx = String(idx);

    const shape = p.shape;
    const b = shapeBounds(shape);
    const g = document.createElement("div");
    g.className = "piece-grid";
    g.style.gridTemplateColumns = `repeat(${b.w}, 18px)`;
    g.style.gridTemplateRows = `repeat(${b.h}, 18px)`;

    // 빈칸 포함한 렌더
    const set = new Set(shape.map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const block = document.createElement("div");
        block.className = "pblock";
        if (set.has(`${x},${y}`)) {
          block.style.background = p.color;
        } else {
          block.style.opacity = "0";
          block.style.boxShadow = "none";
        }
        g.appendChild(block);
      }
    }

    pieceEl.appendChild(g);
    trayEl.appendChild(pieceEl);
  });
}

function clearHints() {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      cells[y][x].classList.remove("hint", "invalid");
    }
  }
}

function hintPlacement(pieceIndex, anchorX, anchorY) {
  clearHints();
  const p = pieces[pieceIndex];
  if (!p || p.used) return;

  const ok = canPlace(p, anchorX, anchorY);
  for (const [dx, dy] of p.shape) {
    const x = anchorX + dx;
    const y = anchorY + dy;
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) {
      cells[y][x].classList.add(ok ? "hint" : "invalid");
    }
  }
}

function canPlace(piece, ax, ay) {
  for (const [dx, dy] of piece.shape) {
    const x = ax + dx, y = ay + dy;
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return false;
    if (grid[y][x]) return false;
  }
  return true;
}

function placePiece(pieceIndex, ax, ay) {
  const p = pieces[pieceIndex];
  if (!p || p.used) return false;
  if (!canPlace(p, ax, ay)) return false;

  // Place with animation
  for (const [dx, dy] of p.shape) {
    grid[ay + dy][ax + dx] = p.color;
  }

  // Score for placement
  updateScore(p.shape.length * SCORE_PLACE_PER_BLOCK);

  // 배치 애니메이션
  renderBoard();
  for (const [dx, dy] of p.shape) {
    const cell = cells[ay + dy]?.[ax + dx];
    if (cell) {
      cell.classList.add("placing");
      setTimeout(() => cell.classList.remove("placing"), 200);
    }
  }

  // Clear lines
  const cleared = clearLinesAndScore(ax, ay);

  // Perfect bonus
  if (isBoardEmpty()) {
    updateScore(SCORE_PERFECT_BONUS);
    showToast(`Perfect +${SCORE_PERFECT_BONUS}`);
    // 보드 중앙에 큰 파티클
    const boardRect = boardEl.getBoundingClientRect();
    createParticles(boardRect.left + boardRect.width / 2, boardRect.top + boardRect.height / 2, "#ffd700", 20);
  } else if (cleared.lines > 0) {
    showToast(`Line Clear x${cleared.lines}${combo > 0 ? ` (Combo ${combo})` : ""}`);
  }

  // Mark piece used
  p.used = true;
  selectedPieceIndex = -1;

  // If all used -> refill
  if (pieces.every(pp => pp.used)) {
    pieces = [newPiece(), newPiece(), newPiece()];
    showToast("새 블럭 세트!");
  }

  renderTray();
  clearHints();

  // Game over?
  if (isGameOver()) {
    endGame();
  }
  return true;
}

function isBoardEmpty() {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (grid[y][x]) return false;
    }
  }
  return true;
}

function clearLinesAndScore(placeX = 0, placeY = 0) {
  const fullRows = [];
  const fullCols = [];

  for (let y = 0; y < GRID; y++) {
    let full = true;
    for (let x = 0; x < GRID; x++) {
      if (!grid[y][x]) { full = false; break; }
    }
    if (full) fullRows.push(y);
  }

  for (let x = 0; x < GRID; x++) {
    let full = true;
    for (let y = 0; y < GRID; y++) {
      if (!grid[y][x]) { full = false; break; }
    }
    if (full) fullCols.push(x);
  }

  const lines = fullRows.length + fullCols.length;
  if (lines === 0) {
    combo = 0;
    return { lines: 0, cells: 0 };
  }

  combo += 1;

  const toClear = new Set();
  fullRows.forEach(y => {
    for (let x = 0; x < GRID; x++) toClear.add(`${x},${y}`);
  });
  fullCols.forEach(x => {
    for (let y = 0; y < GRID; y++) toClear.add(`${x},${y}`);
  });

  const clearedCells = toClear.size;

  // 클리어 애니메이션 + 파티클 + 보드 흔들림
  shakeBoard();

  // 먼저 클리어할 셀들의 색상을 저장하고, 그리드 데이터를 즉시 null로 설정
  const clearData = [];
  for (const key of toClear) {
    const [x, y] = key.split(",").map(Number);
    clearData.push({ x, y, color: grid[y][x] });
    grid[y][x] = null; // 즉시 그리드 데이터 클리어
  }

  // 애니메이션 시작 (색상은 유지하면서)
  let particleDelay = 0;
  for (const { x, y, color } of clearData) {
    const cell = cells[y]?.[x];

    if (cell) {
      // 애니메이션 동안 색상 유지
      cell.style.background = color;
      cell.classList.add("filled");
      cell.classList.add("clearing");

      // 파티클 생성 (약간의 딜레이로 연출)
      const capturedColor = color;
      const capturedX = x;
      const capturedY = y;
      setTimeout(() => {
        const center = getCellCenter(capturedX, capturedY);
        if (center && capturedColor) {
          createParticles(center.x, center.y, capturedColor, 6);
        }
      }, particleDelay);
      particleDelay += 15; // 순차적으로 터지는 느낌
    }
  }

  // 애니메이션 후 보드 다시 렌더 (셀 스타일 초기화)
  setTimeout(() => {
    for (const { x, y } of clearData) {
      const cell = cells[y]?.[x];
      if (cell) {
        cell.classList.remove("clearing", "filled");
        cell.style.background = "";
      }
    }
    renderBoard();
  }, 350);

  // Score
  const lineBonus = lines * SCORE_LINE_BONUS;
  const cellBonus = clearedCells * SCORE_CLEAR_CELL_BONUS;
  const comboBonus = combo * SCORE_COMBO_STEP;
  const totalBonus = lineBonus + cellBonus + comboBonus;

  updateScore(totalBonus);

  // 스코어 팝업 표시
  const boardRect = boardEl.getBoundingClientRect();
  createScorePopup(boardRect.left + boardRect.width / 2, boardRect.top + boardRect.height / 2, totalBonus);

  return { lines, cells: clearedCells };
}

function canFit(piece) {
  for (let ay = 0; ay < GRID; ay++) {
    for (let ax = 0; ax < GRID; ax++) {
      if (canPlace(piece, ax, ay)) return true;
    }
  }
  return false;
}

function isGameOver() {
  // 남은(used=false) 조각 중 하나라도 놓을 곳이 있으면 계속
  for (const p of pieces) {
    if (p.used) continue;
    if (canFit(p)) return false;
  }
  return true;
}

function renderAll() {
  renderBoard();
  renderTray();
  clearHints();
}

/**********************
 * Input handling (개선된 드래그 시스템)
 **********************/
let dragOffsetX = 0;
let dragOffsetY = 0;
let lastClientX = 0;
let lastClientY = 0;
let animationFrameId = null;

function getBoardAnchorFromClient(clientX, clientY) {
  const r = boardEl.getBoundingClientRect();
  // 플로팅 블럭 크기를 고려한 오프셋 조정
  const p = dragPieceIndex >= 0 ? pieces[dragPieceIndex] : null;
  let offsetAdjustX = 0;
  let offsetAdjustY = 0;

  if (p && floatingEl) {
    const b = shapeBounds(p.shape);
    const cellSize = r.width / GRID;
    // 블럭의 첫 번째 셀이 커서 위치에 오도록 조정
    offsetAdjustX = cellSize * 0.5;
    offsetAdjustY = cellSize * 0.5;
  }

  const rx = (clientX - r.left - offsetAdjustX) / r.width;
  const ry = (clientY - r.top - offsetAdjustY) / r.height;
  const ax = Math.floor(rx * GRID);
  const ay = Math.floor(ry * GRID);
  return { ax, ay, inside: rx >= -0.1 && rx < 1.1 && ry >= -0.1 && ry < 1.1 };
}

function updateFloatingPosition(clientX, clientY, immediate = false) {
  if (!floatingEl) return;

  const p = pieces[dragPieceIndex];
  if (!p) return;

  const b = shapeBounds(p.shape);
  const floatingWidth = b.w * 29; // 22px + 7px gap
  const floatingHeight = b.h * 29;

  // 블럭 중심이 커서를 따라가도록
  const targetX = clientX - floatingWidth / 2;
  const targetY = clientY - floatingHeight / 2 - 40; // 손가락 위로 올림

  if (immediate) {
    floatingEl.style.left = targetX + "px";
    floatingEl.style.top = targetY + "px";
  } else {
    // 부드러운 이동 (lerp)
    const currentX = parseFloat(floatingEl.style.left) || targetX;
    const currentY = parseFloat(floatingEl.style.top) || targetY;
    const newX = currentX + (targetX - currentX) * 0.3;
    const newY = currentY + (targetY - currentY) * 0.3;
    floatingEl.style.left = newX + "px";
    floatingEl.style.top = newY + "px";
  }

  // 보드 위인지 확인하고 스케일 조정
  const boardRect = boardEl.getBoundingClientRect();
  const isOverBoard = clientX >= boardRect.left - 20 &&
    clientX <= boardRect.right + 20 &&
    clientY >= boardRect.top - 60 &&
    clientY <= boardRect.bottom + 20;

  floatingEl.classList.toggle("over-board", isOverBoard);
  floatingEl.classList.toggle("outside-board", !isOverBoard);
}

function createFloatingFromPiece(pieceIndex) {
  const p = pieces[pieceIndex];
  const wrap = document.createElement("div");
  wrap.className = "floating outside-board";

  const shape = p.shape;
  const b = shapeBounds(shape);

  const g = document.createElement("div");
  g.className = "piece-grid";
  g.style.gridTemplateColumns = `repeat(${b.w}, 22px)`;
  g.style.gridTemplateRows = `repeat(${b.h}, 22px)`;
  g.style.gap = "7px";

  const set = new Set(shape.map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const block = document.createElement("div");
      block.className = "pblock";
      block.style.width = "22px";
      block.style.height = "22px";
      block.style.borderRadius = "7px";
      if (set.has(`${x},${y}`)) {
        block.style.background = p.color;
      } else {
        block.style.opacity = "0";
        block.style.boxShadow = "none";
      }
      g.appendChild(block);
    }
  }

  wrap.appendChild(g);
  document.body.appendChild(wrap);
  return wrap;
}

// 드래그 시작 (tray에서)
trayEl.addEventListener("pointerdown", (e) => {
  if (gameEnded) return;
  const pieceEl = e.target.closest(".piece");
  if (!pieceEl) return;

  const idx = Number(pieceEl.dataset.idx);
  const p = pieces[idx];
  if (!p || p.used) return;

  dragging = true;
  dragPieceIndex = idx;
  lastClientX = e.clientX;
  lastClientY = e.clientY;

  // select
  selectedPieceIndex = idx;
  pieceEl.classList.add("dragging");
  renderTray();

  floatingEl = createFloatingFromPiece(idx);
  updateFloatingPosition(e.clientX, e.clientY, true);

  // document 레벨에서 캡처하도록 설정
  e.preventDefault();
}, { passive: false });

// 드래그 이동 (document 레벨) - requestAnimationFrame 사용
function onPointerMove(e) {
  if (!dragging || dragPieceIndex < 0 || !floatingEl) return;

  lastClientX = e.clientX;
  lastClientY = e.clientY;

  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(() => {
      updateFloatingPosition(lastClientX, lastClientY);

      const { ax, ay, inside } = getBoardAnchorFromClient(lastClientX, lastClientY);
      if (inside) hintPlacement(dragPieceIndex, ax, ay);
      else clearHints();

      animationFrameId = null;
    });
  }
}

document.addEventListener("pointermove", onPointerMove, { passive: true });

// 드래그 종료 (document 레벨)
document.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  const idx = dragPieceIndex;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  const { ax, ay, inside } = getBoardAnchorFromClient(e.clientX, e.clientY);

  dragging = false;
  dragPieceIndex = -1;

  // 드래그 중인 피스 스타일 제거
  document.querySelectorAll(".piece.dragging").forEach(el => el.classList.remove("dragging"));

  if (floatingEl) {
    // 페이드 아웃 효과
    floatingEl.style.transition = "opacity 0.15s, transform 0.15s";
    floatingEl.style.opacity = "0";
    floatingEl.style.transform = "scale(0.8)";
    setTimeout(() => {
      if (floatingEl) floatingEl.remove();
      floatingEl = null;
    }, 150);
  }

  if (inside) {
    const ok = placePiece(idx, ax, ay);
    if (!ok) showToast("여기에 놓을 수 없습니다");
  } else {
    // 드래그 취소
    clearHints();
  }
});

/**********************
 * Modal
 **********************/
function showModal(title, body, body2 = "") {
  modalTitleEl.textContent = title;
  modalBodyEl.textContent = body;
  modalBody2El.textContent = body2;
  modalEl.classList.add("show");
}
function hideModal() {
  modalEl.classList.remove("show");
}

btnRestartEl.addEventListener("click", () => {
  resetGame();
});

btnNewEl.addEventListener("click", () => {
  resetGame();
});

btnClearEl.addEventListener("click", () => {
  hardClear();
});

// Firestore에서 displayName 가져오기
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

async function saveScore(finalScore) {
  // 점수 저장 직전에 인증 상태를 보장
  await waitForUser();
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    showModal(
      "게임 종료",
      `점수: ${finalScore}`,
      "게스트는 점수 등록이 불가능합니다. 홈에서 회원가입/로그인 후 기록하세요."
    );
    return;
  }

  // users 컬렉션에서 표시 이름 가져오기
  let displayId = await getDisplayNameFromFirestore();

  // 표시이름이 없으면 1회 입력 받아 저장
  if (!displayId) {
    const name = prompt("리더보드에 표시할 이름을 입력하세요(최대 20자):");
    if (name && name.trim() && name.trim().length <= 20) {
      displayId = name.trim();
      await user.updateProfile({ displayName: displayId });
      await db.collection("users").doc(user.uid).set({
        displayName: displayId,
        email: user.email || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      displayId = getDisplayIdForScore();
    }
  }

  try {
    const ref = db.collection("blockblast_scores").doc(user.uid);
    const prev = await ref.get();
    const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

    if (finalScore > prevScore) {
      await ref.set({
        uid: user.uid,
        userId: displayId,
        score: finalScore,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      showModal("게임 종료", `점수: ${finalScore}`, "최고 기록이 저장되었습니다!");
    } else {
      showModal("게임 종료", `점수: ${finalScore}`, `기존 최고 기록(${prevScore})이 더 높습니다.`);
    }
  } catch (e) {
    console.error("점수 저장 실패:", e);
    showModal("게임 종료", `점수: ${finalScore}`, "점수 저장에 실패했습니다. (Rules/권한을 확인하세요)");
  }
}

/**********************
 * Leaderboard
 **********************/
function startLeaderboard() {
  try {
    db.collection("blockblast_scores")
      .orderBy("score", "desc")
      .limit(10)
      .onSnapshot((snap) => {
        lbListEl.innerHTML = "";
        if (snap.empty) {
          lbStatusEl.textContent = "데이터 없음";
          const row = document.createElement("div");
          row.className = "lb-row";
          row.innerHTML = `<span class="lb-rank">-</span><span class="lb-name">아직 기록이 없습니다</span><span class="lb-score">0</span>`;
          lbListEl.appendChild(row);
          return;
        }
        lbStatusEl.textContent = "업데이트됨";
        let rank = 1;
        snap.forEach((doc) => {
          const d = doc.data();
          const row = document.createElement("div");
          row.className = "lb-row";
          row.innerHTML = `
        <span class="lb-rank">${rank}</span>
        <span class="lb-name">${escapeHtml(d.userId || "Member")}</span>
        <span class="lb-score">${Number(d.score || 0).toLocaleString()}</span>
      `;
          lbListEl.appendChild(row);
          rank++;
        });
      }, (err) => {
        console.error("리더보드 로드 실패:", err);
        lbStatusEl.textContent = "로드 실패";
      });
  } catch (e) {
    console.error(e);
    lbStatusEl.textContent = "로드 실패";
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

/**********************
 * End game
 **********************/
async function endGame() {
  if (gameEnded) return;
  gameEnded = true;
  clearHints();
  showToast("Game Over");

  // 저장 + 모달 표시
  await saveScore(score);
}

/**********************
 * Auth + boot
 * 공통 헬퍼를 사용해 인증을 끝낸 뒤 초기화
 **********************/
window.addEventListener("load", async () => {
  await waitForUser();
  updateUserBadge(userBadge);
  startLeaderboard();
  resetGame();
});
