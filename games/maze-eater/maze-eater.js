// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Pacman 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

// 테마 초기화 (깜빡임 방지를 위해 head에서 실행)
/********************
 * 1) Firebase init
 ********************/
const userBadge = document.getElementById("user-badge");

function safeName(s) {
  return (s && String(s).trim()) ? String(s).trim() : "Member";
}

window.onload = async () => {
  await waitForUser();
  updateUserBadge(userBadge);
};

/********************
 * 2) Game constants
 ********************/
const canvas = document.getElementById('pacmanCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 20;
const FPS = 60;
const FRAME_TIME = 1000 / FPS;

// 0: pellet, 1: wall, 2: empty
const ORIGINAL_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 0, 1, 1, 1, 2, 1, 2, 1, 1, 1, 0, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 2, 1, 1, 2, 1, 1, 2, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

// 맵 복사 (원본 보존)
let MAP = ORIGINAL_MAP.map(row => [...row]);

canvas.width = MAP[0].length * TILE_SIZE;
canvas.height = MAP.length * TILE_SIZE;

let score = 0;
let gameActive = true;
let animationId = null;
let lastFrameTime = 0;

const scoreEl = document.getElementById('currentScore');

/********************
 * 3) Entities
 ********************/
function centerOfCell(col, row) {
  return { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE };
}

function getCell(px, py) {
  return {
    col: Math.floor(px / TILE_SIZE),
    row: Math.floor(py / TILE_SIZE)
  };
}

const pacman = {
  x: 0,
  y: 0,
  radius: 8,
  speed: 2.5,
  dir: { x: 0, y: 0 },
  nextDir: { x: 0, y: 0 },
  bufferedDir: null, // 방향 버퍼링
  mouth: 0,
  mouthSpeed: 0.15,
  mouthDir: 1
};

function initPacman() {
  const start = centerOfCell(1, 1);
  pacman.x = start.x;
  pacman.y = start.y;
  pacman.dir = { x: 0, y: 0 };
  pacman.nextDir = { x: 0, y: 0 };
  pacman.bufferedDir = null;
}

// 유령 초기화
let ghosts = [];

function initGhosts() {
  ghosts = [
    { ...centerOfCell(9, 8), color: '#FF0000', dir: { x: 1, y: 0 }, speed: 1.8, radius: 8, lastTurnCell: null },
    { ...centerOfCell(9, 9), color: '#FFB8FF', dir: { x: -1, y: 0 }, speed: 1.7, radius: 8, lastTurnCell: null }
  ];
}

/********************
 * 4) Collision / movement helpers (개선됨)
 ********************/
function isWall(col, row) {
  if (row < 0 || row >= MAP.length || col < 0 || col >= MAP[0].length) return true;
  return MAP[row][col] === 1;
}

function isWallAtPixel(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  return isWall(col, row);
}

// 특정 방향으로 이동 가능한지 타일 단위로 체크
function canMoveTile(col, row, dx, dy) {
  return !isWall(col + dx, row + dy);
}

// 픽셀 단위 충돌 체크 (더 정밀)
function canMovePixel(entity, dx, dy, speed) {
  const nx = entity.x + dx * speed;
  const ny = entity.y + dy * speed;
  const r = entity.radius - 1; // 약간의 여유

  // 4 코너 + 중심 체크
  const pts = [
    { x: nx - r, y: ny - r },
    { x: nx + r, y: ny - r },
    { x: nx - r, y: ny + r },
    { x: nx + r, y: ny + r },
    { x: nx, y: ny }
  ];

  return !pts.some(p => isWallAtPixel(p.x, p.y));
}

// 타일 중심과의 거리
function distToCenter(entity) {
  const cell = getCell(entity.x, entity.y);
  const center = centerOfCell(cell.col, cell.row);
  return {
    dx: center.x - entity.x,
    dy: center.y - entity.y,
    dist: Math.hypot(center.x - entity.x, center.y - entity.y)
  };
}

// 타일 중심 근처인지 (더 엄격한 체크)
function atCellCenter(entity, tolerance = 3) {
  const info = distToCenter(entity);
  return info.dist <= tolerance;
}

// 타일 중심으로 스냅
function snapToCenter(entity) {
  const cell = getCell(entity.x, entity.y);
  const center = centerOfCell(cell.col, cell.row);
  entity.x = center.x;
  entity.y = center.y;
}

// 이동 가능한 방향 목록
function availableDirs(entity) {
  const cell = getCell(entity.x, entity.y);
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  return dirs.filter(d => canMoveTile(cell.col, cell.row, d.x, d.y));
}

/********************
 * 5) Game loop update (대폭 개선)
 ********************/
function updatePacman(deltaTime) {
  const cell = getCell(pacman.x, pacman.y);
  const centerInfo = distToCenter(pacman);
  const atCenter = atCellCenter(pacman, 2);

  // 버퍼된 방향이 있으면 시도
  if (pacman.bufferedDir) {
    if (canMoveTile(cell.col, cell.row, pacman.bufferedDir.x, pacman.bufferedDir.y)) {
      if (atCenter ||
        (pacman.bufferedDir.x !== 0 && pacman.dir.x !== 0) ||
        (pacman.bufferedDir.y !== 0 && pacman.dir.y !== 0)) {
        pacman.nextDir = { ...pacman.bufferedDir };
        pacman.bufferedDir = null;
      }
    }
  }

  // 방향 전환 로직
  if (pacman.nextDir.x !== 0 || pacman.nextDir.y !== 0) {
    const wantsTurn = (pacman.nextDir.x !== pacman.dir.x || pacman.nextDir.y !== pacman.dir.y);

    if (wantsTurn) {
      // 90도 회전인 경우 타일 중심에서만 전환
      const is90Turn = (pacman.nextDir.x !== 0 && pacman.dir.y !== 0) ||
        (pacman.nextDir.y !== 0 && pacman.dir.x !== 0);

      if (is90Turn) {
        if (atCenter && canMoveTile(cell.col, cell.row, pacman.nextDir.x, pacman.nextDir.y)) {
          snapToCenter(pacman);
          pacman.dir = { ...pacman.nextDir };
        }
      } else {
        // 역방향이나 같은 축 이동은 즉시 가능
        if (canMoveTile(cell.col, cell.row, pacman.nextDir.x, pacman.nextDir.y)) {
          pacman.dir = { ...pacman.nextDir };
        }
      }
    }
  }

  // 실제 이동
  if (pacman.dir.x !== 0 || pacman.dir.y !== 0) {
    const moveSpeed = pacman.speed * (deltaTime / 16.67); // 60fps 기준 정규화

    if (canMovePixel(pacman, pacman.dir.x, pacman.dir.y, moveSpeed)) {
      pacman.x += pacman.dir.x * moveSpeed;
      pacman.y += pacman.dir.y * moveSpeed;
    } else {
      // 벽에 막히면 가능한 만큼만 이동 후 중심으로 스냅
      const nextCell = getCell(
        pacman.x + pacman.dir.x * TILE_SIZE,
        pacman.y + pacman.dir.y * TILE_SIZE
      );
      if (isWall(nextCell.col, nextCell.row)) {
        // 현재 타일 중심으로 부드럽게 이동
        if (centerInfo.dist > 1) {
          const snapSpeed = Math.min(moveSpeed, centerInfo.dist);
          pacman.x += (centerInfo.dx / centerInfo.dist) * snapSpeed * 0.5;
          pacman.y += (centerInfo.dy / centerInfo.dist) * snapSpeed * 0.5;
        }
      }
    }
  }

  // 음식 먹기 (펠릿)
  const currentCell = getCell(pacman.x, pacman.y);
  if (currentCell.row >= 0 && currentCell.row < MAP.length &&
    currentCell.col >= 0 && currentCell.col < MAP[0].length) {
    if (MAP[currentCell.row][currentCell.col] === 0) {
      MAP[currentCell.row][currentCell.col] = 2;
      score += 10;
      scoreEl.innerText = score;
    }
  }

  // 입 애니메이션
  pacman.mouth += pacman.mouthSpeed * pacman.mouthDir;
  if (pacman.mouth >= 0.25) {
    pacman.mouth = 0.25;
    pacman.mouthDir = -1;
  } else if (pacman.mouth <= 0) {
    pacman.mouth = 0;
    pacman.mouthDir = 1;
  }
}

function updateGhosts(deltaTime) {
  const speedMultiplier = deltaTime / 16.67;

  ghosts.forEach(g => {
    const cell = getCell(g.x, g.y);
    const cellKey = `${cell.col},${cell.row}`;
    const atCenter = atCellCenter(g, 2);

    // 새로운 타일에 도착했을 때만 방향 결정
    if (atCenter && g.lastTurnCell !== cellKey) {
      g.lastTurnCell = cellKey;
      snapToCenter(g);

      const dirs = availableDirs(g);

      // 역방향 제외 (막다른 길이 아니면)
      const reverse = { x: -g.dir.x, y: -g.dir.y };
      let candidates = dirs.filter(d => !(d.x === reverse.x && d.y === reverse.y));
      if (candidates.length === 0) candidates = dirs;

      if (candidates.length > 0) {
        // 70% 확률로 팩맨 쪽으로
        if (Math.random() < 0.7) {
          let best = candidates[0];
          let bestDist = Infinity;
          candidates.forEach(d => {
            const nx = g.x + d.x * TILE_SIZE;
            const ny = g.y + d.y * TILE_SIZE;
            const dist = Math.hypot(pacman.x - nx, pacman.y - ny);
            if (dist < bestDist) {
              bestDist = dist;
              best = d;
            }
          });
          g.dir = best;
        } else {
          g.dir = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }
    }

    // 실제 이동
    const moveSpeed = g.speed * speedMultiplier;
    if (canMovePixel(g, g.dir.x, g.dir.y, moveSpeed)) {
      g.x += g.dir.x * moveSpeed;
      g.y += g.dir.y * moveSpeed;
    } else {
      // 막히면 중심으로 스냅하고 다른 방향 선택
      snapToCenter(g);
      g.lastTurnCell = null; // 다시 방향 결정 허용
    }

    // 충돌 감지 (더 관대한 판정)
    const dist = Math.hypot(pacman.x - g.x, pacman.y - g.y);
    if (dist < (pacman.radius + g.radius - 3)) {
      gameOver(false);
    }
  });
}

function update(deltaTime) {
  if (!gameActive) return;

  updatePacman(deltaTime);
  updateGhosts(deltaTime);

  // 모든 음식 다 먹었는지
  const remaining = MAP.some(row => row.includes(0));
  if (!remaining) gameOver(true);
}

/********************
 * 6) Render
 ********************/
function draw() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 맵
  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[y].length; x++) {
      if (MAP[y][x] === 1) {
        ctx.fillStyle = '#1e3799';
        ctx.fillRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      } else if (MAP[y][x] === 0) {
        ctx.fillStyle = "#ffbe76";
        ctx.beginPath();
        ctx.arc(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 팩맨
  ctx.fillStyle = 'yellow';
  ctx.beginPath();

  let angle = 0;
  if (pacman.dir.x !== 0 || pacman.dir.y !== 0) {
    angle = Math.atan2(pacman.dir.y, pacman.dir.x);
  }

  ctx.moveTo(pacman.x, pacman.y);
  ctx.arc(
    pacman.x, pacman.y, pacman.radius,
    angle + pacman.mouth * Math.PI,
    angle + (2 - pacman.mouth) * Math.PI
  );
  ctx.closePath();
  ctx.fill();

  // 유령
  ghosts.forEach(g => {
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.radius, Math.PI, 0);
    ctx.lineTo(g.x + g.radius, g.y + g.radius);

    // 물결 모양 하단
    const waveCount = 3;
    const waveWidth = (g.radius * 2) / waveCount;
    for (let i = 0; i < waveCount; i++) {
      const wx = g.x + g.radius - (i + 1) * waveWidth;
      const wy = g.y + g.radius - (i % 2 === 0 ? 3 : 0);
      ctx.lineTo(wx + waveWidth / 2, wy);
      ctx.lineTo(wx, g.y + g.radius);
    }

    ctx.closePath();
    ctx.fill();

    // 유령 눈
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(g.x - 3, g.y - 2, 3, 0, Math.PI * 2);
    ctx.arc(g.x + 3, g.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#333';
    const eyeOffsetX = g.dir.x * 1.5;
    const eyeOffsetY = g.dir.y * 1.5;
    ctx.beginPath();
    ctx.arc(g.x - 3 + eyeOffsetX, g.y - 2 + eyeOffsetY, 1.5, 0, Math.PI * 2);
    ctx.arc(g.x + 3 + eyeOffsetX, g.y - 2 + eyeOffsetY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 메인 게임 루프 (고정 프레임레이트)
function gameLoop(currentTime) {
  if (!gameActive) return;

  const deltaTime = currentTime - lastFrameTime;

  if (deltaTime >= FRAME_TIME) {
    lastFrameTime = currentTime - (deltaTime % FRAME_TIME);
    update(Math.min(deltaTime, FRAME_TIME * 2)); // 최대 2프레임 점프
    draw();
  }

  animationId = requestAnimationFrame(gameLoop);
}

/********************
    * 7) Score save / leaderboard
    ********************/
async function getDisplayNameFromFirestore() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  try {
    const doc = await db.collection("users").doc(user.uid).get();
    if (doc.exists && doc.data().displayName) return doc.data().displayName;
  } catch (e) {
    console.error("Firestore displayName 조회 실패:", e);
  }
  return user.displayName || user.email || "Member";
}

async function ensureDisplayName() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  let displayId = await getDisplayNameFromFirestore();
  if (displayId) return displayId;

  const name = prompt("리더보드에 표시할 이름을 입력하세요(최대 20자):");
  if (name && name.trim() && name.trim().length <= 20) {
    displayId = name.trim();
    try {
      await user.updateProfile({ displayName: displayId });
    } catch (_) { }
    try {
      await db.collection("users").doc(user.uid).set({
        displayName: displayId,
        email: user.email || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("users 저장 실패:", e);
    }
    return displayId;
  }

  return safeName(user.displayName || user.email || "Member");
}

async function saveScore(finalScore) {
  // 점수 저장 시 인증 상태를 보강
  await waitForUser();
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    alert("게스트는 점수 등록이 불가능합니다. 홈에서 회원가입/로그인 후 기록하세요.");
    return;
  }

  const displayId = await ensureDisplayName();

  try {
    const ref = db.collection("pacman_scores").doc(user.uid);
    const prev = await ref.get();
    const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

    if (finalScore > prevScore) {
      await ref.set({
        uid: user.uid,
        userId: displayId,
        score: finalScore,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      alert("점수가 등록되었습니다!");
    } else {
      // alert("기존 기록이 더 높습니다.");
    }
  } catch (e) {
    console.error("점수 저장 실패:", e);
    alert("점수 저장에 실패했습니다.");
  }
}

async function gameOver(win = false) {
  if (!gameActive) return;
  gameActive = false;
  if (animationId) cancelAnimationFrame(animationId);

  const msg = win ? "🎉 VICTORY! Great Job!" : "💀 GAME OVER";
  document.getElementById('modalTitle').textContent = msg;
  document.getElementById('modalScore').textContent = `Your Score: ${score}`;
  document.getElementById('gameOverModal').classList.add('show');

  await saveScore(score);
}

function restartGame() {
  document.getElementById('gameOverModal').classList.remove('show');
  startGame();
}

function goHome() {
  location.href = "../../index.html?tab=pacman";
}

function loadLeaderboard() {
  const scoreListEl = document.getElementById('scoreList');
  if (!scoreListEl) return;

  db.collection('pacman_scores')
    .orderBy('score', 'desc')
    .limit(10)
    .onSnapshot(snapshot => {
      const list = [];
      snapshot.forEach(doc => list.push(doc.data()));

      if (list.length === 0) {
        scoreListEl.innerHTML = `<div class="muted">No records yet.</div>`;
        return;
      }

      const html = list.map((item, idx) => {
        const name = safeName(item.userId || item.displayName || item.email || "Member");
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
        return `
      <div class="score-row">
        <span><span class="rank">${medal || (idx + 1)}</span>${name}</span>
        <strong>${Number(item.score ?? 0)}</strong>
      </div>
    `;
      }).join('');
      scoreListEl.innerHTML = html;
    }, err => {
      console.error("리더보드 로드 실패:", err);
      scoreListEl.innerHTML = `<div class="muted">리더보드 로드 실패</div>`;
    });
}

/********************
 * 8) Input (개선됨)
 ********************/
function handleControl(dir) {
  const dirMap = {
    'up': { x: 0, y: -1 },
    'down': { x: 0, y: 1 },
    'left': { x: -1, y: 0 },
    'right': { x: 1, y: 0 }
  };

  if (dirMap[dir]) {
    pacman.nextDir = { ...dirMap[dir] };
    pacman.bufferedDir = { ...dirMap[dir] }; // 버퍼링
  }
}

// 키보드 입력
window.addEventListener('keydown', e => {
  const keyMap = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'w': 'up',
    'W': 'up',
    's': 'down',
    'S': 'down',
    'a': 'left',
    'A': 'left',
    'd': 'right',
    'D': 'right'
  };

  if (keyMap[e.key]) {
    e.preventDefault();
    handleControl(keyMap[e.key]);
  }
});

// 터치/스와이프 지원
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (Math.max(absDx, absDy) > 20) { // 최소 스와이프 거리
    if (absDx > absDy) {
      handleControl(dx > 0 ? 'right' : 'left');
    } else {
      handleControl(dy > 0 ? 'down' : 'up');
    }
  }
}, { passive: false });

/********************
 * 9) Start
 ********************/
function startGame() {
  MAP = ORIGINAL_MAP.map(row => [...row]);
  score = 0;
  scoreEl.innerText = '0';
  gameActive = true;

  initPacman();
  initGhosts();
  loadLeaderboard();

  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

startGame();
