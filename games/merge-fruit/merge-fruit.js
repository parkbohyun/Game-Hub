// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Suika 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

// 테마 초기화 (깜빡임 방지를 위해 head에서 실행)
/*************************************************
 * 0) Firebase (당신 프로젝트 설정 그대로 사용)
 *************************************************/
const userBadge = document.getElementById("user-badge");

function safeName(s) { return (s && String(s).trim()) ? String(s).trim() : "Member"; }

/*************************************************
 * 커스텀 팝업 함수
 *************************************************/
function showPopup(options) {
    const overlay = document.getElementById('popupOverlay');
    const icon = document.getElementById('popupIcon');
    const title = document.getElementById('popupTitle');
    const message = document.getElementById('popupMessage');
    const scoreBox = document.getElementById('popupScoreBox');
    const sub = document.getElementById('popupSub');
    const buttons = document.getElementById('popupButtons');

    icon.textContent = options.icon || '🎉';
    title.textContent = options.title || '';
    message.innerHTML = options.message || '';
    scoreBox.innerHTML = options.scoreHtml || '';
    sub.innerHTML = options.sub || '';

    buttons.innerHTML = '';
    if (options.buttons && options.buttons.length > 0) {
        options.buttons.forEach(btn => {
            const b = document.createElement('button');
            b.className = 'popup-btn ' + (btn.class || '');
            b.textContent = btn.text;
            b.onclick = btn.onClick;
            buttons.appendChild(b);
        });
    }

    overlay.classList.add('show');
}

function closePopup() {
    document.getElementById('popupOverlay').classList.remove('show');
}

function closePopupSecondary() {
    closePopup();
}

window.onload = async () => {
    await waitForUser();
    updateUserBadge(userBadge);
};

/*************************************************
 * 1) Canvas & sizing
 *************************************************/
const container = document.getElementById('gameContainer');
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

let W = 420;
let H = 560;

function resizeCanvas() {
    // 고정 비율 기반으로: 모바일에서도 안정적인 물리
    const maxW = Math.min(460, window.innerWidth - 20);
    W = Math.max(320, Math.floor(maxW));
    H = Math.floor(W * (500 / 420));
    cv.width = W;
    cv.height = H;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

/*************************************************
 * 2) Game data (수박게임 과일 단계)
 *************************************************/
const FRUITS = [
    { name: "🍒", r: 14, color: "#ff4d4d", score: 10 },
    { name: "🍓", r: 18, color: "#ff2d6f", score: 20 },
    { name: "🍇", r: 22, color: "#9b59b6", score: 40 },
    { name: "🍊", r: 26, color: "#f39c12", score: 80 },
    { name: "🍎", r: 30, color: "#e74c3c", score: 160 },
    { name: "🍐", r: 34, color: "#2ecc71", score: 320 },
    { name: "🍑", r: 38, color: "#ff9ff3", score: 640 },
    { name: "🍍", r: 44, color: "#f1c40f", score: 1280 },
    { name: "🥥", r: 52, color: "#ecf0f1", score: 2560 },
    { name: "🍉", r: 62, color: "#1abc9c", score: 5120 }, // 최종 수박
];

function randomSpawnType() {
    // 초반은 작은 과일 위주(0~4) 가중치
    const pool = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5];
    return pool[Math.floor(Math.random() * pool.length)];
}

/*************************************************
 * 3) Physics
 *************************************************/
const GRAVITY = 1500;         // px/s^2
const AIR_DAMP = 0.999;       // 공기 감쇠
const RESTITUTION = 0.18;     // 반발
const FRICTION = 0.985;       // 바닥 마찰
const SUBSTEPS = 3;           // 안정성 (2 -> 3으로 증가)
const MERGE_SPEED_MAX = 800;  // 이 속도 이하로 부딪히면 합체 가능 (더 완화)

const WALL_PAD = 12;          // 컨테이너 내부 패딩(시각적 여유)
const TOP_SPAWN_Y = 70;       // 투하 높이
const LOSE_LINE_Y = 150;       // 이 선 위로 쌓이면 게임오버(안정 시)

let balls = [];
let score = 0;
let gameActive = true;
let paused = false;
let gameEnded = false;

const scoreEl = document.getElementById('scoreEl');
const nextEl = document.getElementById('nextEl');

let nextType = randomSpawnType();

function setScore(v) {
    score = v;
    scoreEl.textContent = String(score);
    localStorage.setItem("suika_last_score", String(score));
}
setScore(0);

function updateNextUI() {
    nextEl.textContent = FRUITS[nextType].name;
}
updateNextUI();

function makeBall(type, x, y) {
    const f = FRUITS[type];
    const m = f.r * f.r; // 질량 비례(면적)
    return {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
        type,
        x, y,
        vx: 0, vy: 0,
        r: f.r,
        m,
        color: f.color,
        bornAt: performance.now(),
        merged: false
    };
}

function clamp(val, a, b) { return Math.max(a, Math.min(b, val)); }

/*************************************************
 * 4) Input (마우스/터치)
 *************************************************/
let pointerX = W / 2;
let holding = true;          // “드롭 대기중”
let dropCooldown = 0;        // ms

function clientToCanvasX(clientX) {
    const rect = cv.getBoundingClientRect();
    const x = (clientX - rect.left) * (cv.width / rect.width);
    return x;
}

function onPointerMove(clientX) {
    pointerX = clientToCanvasX(clientX);
}

function tryDrop() {
    if (!gameActive || paused || gameEnded) return;
    const now = performance.now();
    if (now < dropCooldown) return;

    const type = nextType;
    const r = FRUITS[type].r;

    const x = clamp(pointerX, WALL_PAD + r, W - WALL_PAD - r);
    const y = TOP_SPAWN_Y;

    const b = makeBall(type, x, y);

    // 스폰 순간 벽/다른 공과 겹치면 약간 위로 올리고 재검사
    for (let k = 0; k < 6; k++) {
        if (!overlapsAny(b)) break;
        b.y -= 6;
    }

    // 그래도 겹치면 게임오버 처리(공간이 없다고 판단)
    if (overlapsAny(b) || b.y - b.r < 0) {
        endGame(false);
        return;
    }

    balls.push(b);
    playDrop();
    vibrate(12);

    // 다음 과일 준비
    nextType = randomSpawnType();
    updateNextUI();

    dropCooldown = now + 280; // 연타 방지
}

cv.addEventListener('mousemove', (e) => onPointerMove(e.clientX));
cv.addEventListener('touchstart', (e) => {
    if (e.changedTouches && e.changedTouches[0]) onPointerMove(e.changedTouches[0].clientX);
}, { passive: true });

cv.addEventListener('touchmove', (e) => {
    if (e.changedTouches && e.changedTouches[0]) onPointerMove(e.changedTouches[0].clientX);
}, { passive: true });

cv.addEventListener('mousedown', (e) => {
    onPointerMove(e.clientX);
    tryDrop();
});

cv.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches[0]) onPointerMove(e.changedTouches[0].clientX);
    tryDrop();
}, { passive: true });

/*************************************************
 * 5) Physics helpers
 *************************************************/
function overlapsAny(ball) {
    for (const other of balls) {
        const dx = ball.x - other.x;
        const dy = ball.y - other.y;
        const dist = Math.hypot(dx, dy);
        if (dist < ball.r + other.r - 1) return true;
    }
    return false;
}

function resolveWalls(b) {
    // left/right
    if (b.x - b.r < WALL_PAD) {
        b.x = WALL_PAD + b.r;
        if (b.vx < 0) b.vx = -b.vx * (0.6 + RESTITUTION);
    }
    if (b.x + b.r > W - WALL_PAD) {
        b.x = W - WALL_PAD - b.r;
        if (b.vx > 0) b.vx = -b.vx * (0.6 + RESTITUTION);
    }
    // floor
    if (b.y + b.r > H - WALL_PAD) {
        b.y = H - WALL_PAD - b.r;
        if (b.vy > 0) b.vy = -b.vy * (0.55 + RESTITUTION);
        b.vx *= FRICTION;
        if (Math.abs(b.vy) < 12) b.vy = 0;
    }
    // ceiling(안전)
    if (b.y - b.r < 0) {
        b.y = b.r;
        if (b.vy < 0) b.vy = -b.vy * (0.4 + RESTITUTION);
    }
}

function resolveBallCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.r + b.r;

    if (dist <= 0 || dist >= minDist) return false;

    const nx = dx / dist;
    const ny = dy / dist;

    // penetration resolution
    const penetration = (minDist - dist);
    const totalMass = a.m + b.m;
    const moveA = penetration * (b.m / totalMass);
    const moveB = penetration * (a.m / totalMass);

    a.x -= nx * moveA;
    a.y -= ny * moveA;
    b.x += nx * moveB;
    b.y += ny * moveB;

    // relative velocity along normal
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    // do not resolve if separating
    if (velAlongNormal > 0) return true;

    const e = RESTITUTION;
    const j = -(1 + e) * velAlongNormal / (1 / a.m + 1 / b.m);

    const impX = j * nx;
    const impY = j * ny;

    a.vx -= impX / a.m;
    a.vy -= impY / a.m;
    b.vx += impX / b.m;
    b.vy += impY / b.m;

    return true;
}

function canMerge(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.merged || b.merged) return false;
    if (a.type >= FRUITS.length - 1) return false; // 수박은 더이상 합체 없음

    // 충돌 속도가 너무 크면 합체 금지(튕김 우선) - 조건 완화
    const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    if (rel > MERGE_SPEED_MAX) return false;

    // 충분히 가까우면 합체 허용 (거리 조건 완화)
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.r + b.r;

    // 겹침이 충분하면 합체 (거리가 반지름 합의 105% 이하 - 더 관대하게)
    return dist <= minDist * 1.05;
}

function mergeBalls(a, b) {
    a.merged = true;
    b.merged = true;

    const newType = a.type + 1;
    const nx = (a.x + b.x) / 2;
    const ny = (a.y + b.y) / 2;

    const n = makeBall(newType, nx, ny);
    n.vx = (a.vx + b.vx) / 2;
    n.vy = (a.vy + b.vy) / 2;

    // 제거/추가
    balls = balls.filter(x => x !== a && x !== b);
    balls.push(n);

    playMerge(newType);
    vibrate(newType >= 7 ? [25, 20, 25] : 20);

    // 점수 추가
    const add = FRUITS[newType].score;
    setScore(score + add);
}

/*************************************************
 * 6) Game over / pause / restart
 *************************************************/
const overlay = document.getElementById('overlay');
const overTitle = document.getElementById('overTitle');
const overScore = document.getElementById('overScore');

function showOverlay(title) {
    overTitle.textContent = title;
    overScore.textContent = `Score: ${score}`;
    overlay.classList.add('show');
}

function hideOverlay() {
    overlay.classList.remove('show');
}

function endGame(win) {
    if (gameEnded) return;
    gameActive = false;
    gameEnded = true;
    paused = true;

    playGameOver();
    vibrate([80, 40, 120]);

    showOverlay("GAME OVER");
}

function resetGame() {
    balls = [];
    setScore(0);
    nextType = randomSpawnType();
    updateNextUI();
    gameActive = true;
    paused = false;
    gameEnded = false;
    hideOverlay();
}

document.getElementById('btnPause').addEventListener('click', () => {
    playClick();
    if (!gameActive && gameEnded) return;
    paused = !paused;
    document.getElementById('btnPause').textContent = paused ? "RESUME" : "PAUSE";
});

document.getElementById('btnRestart').addEventListener('click', () => resetGame());
document.getElementById('btnAgain').addEventListener('click', () => resetGame());
// document.getElementById('btnHome').addEventListener('click', () => location.href = "index.html?tab=suika");

/*************************************************
 * 7) Firestore save / leaderboard
 *************************************************/

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

    // 커스텀 팝업으로 이름 입력받기
    return new Promise((resolve) => {
        const overlay = document.getElementById('popupOverlay');
        const icon = document.getElementById('popupIcon');
        const title = document.getElementById('popupTitle');
        const message = document.getElementById('popupMessage');
        const scoreBox = document.getElementById('popupScoreBox');
        const sub = document.getElementById('popupSub');
        const buttons = document.getElementById('popupButtons');

        icon.textContent = '✏️';
        title.textContent = '닉네임 설정';
        message.innerHTML = '리더보드에 표시할 이름을 입력하세요';
        scoreBox.innerHTML = `<input type="text" id="nameInput" maxlength="20" placeholder="닉네임 (최대 20자)" style="
            width: 100%;
            padding: 12px;
            border: 2px solid var(--border);
            border-radius: 8px;
            font-size: 1rem;
            background: var(--card-bg);
            color: var(--text);
            box-sizing: border-box;
            margin-top: 5px;
        ">`;
        sub.innerHTML = '';
        buttons.innerHTML = '';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'popup-btn';
        confirmBtn.textContent = '확인';
        confirmBtn.onclick = async () => {
            const nameInput = document.getElementById('nameInput');
            const name = nameInput.value.trim();
            if (name && name.length <= 20) {
                displayId = name;
                try { await user.updateProfile({ displayName: displayId }); } catch (_) { }
                try {
                    await db.collection("users").doc(user.uid).set({
                        displayName: displayId,
                        email: user.email || null,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                } catch (e) {
                    console.error("users 저장 실패:", e);
                }
                closePopup();
                resolve(displayId);
            } else {
                closePopup();
                resolve(safeName(user.displayName || user.email || "Member"));
            }
        };
        buttons.appendChild(confirmBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'popup-btn secondary';
        cancelBtn.textContent = '건너뛰기';
        cancelBtn.onclick = () => {
            closePopup();
            resolve(safeName(user.displayName || user.email || "Member"));
        };
        buttons.appendChild(cancelBtn);

        overlay.classList.add('show');

        // 포커스 및 엔터키 지원
        setTimeout(() => {
            const inp = document.getElementById('nameInput');
            if (inp) {
                inp.focus();
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') confirmBtn.click();
                });
            }
        }, 100);
    });
}

async function saveScore(finalScore) {
    // 점수 저장 직전에 인증 상태를 확정
    await waitForUser();
    const user = auth.currentUser;

    if (!user || user.isAnonymous) {
        showPopup({
            icon: '⚠️',
            title: '점수 등록 불가',
            message: '게스트는 점수 등록이 불가능합니다.',
            sub: '홈에서 회원가입/로그인 후 기록하세요.',
            buttons: [
                { text: '🏠 홈으로', onClick: () => { location.href = "../../index.html"; } },
                { text: '닫기', class: 'secondary', onClick: closePopup }
            ]
        });
        return;
    }

    const displayId = await ensureDisplayName();

    try {
        const ref = db.collection("suika_scores").doc(user.uid);
        const prev = await ref.get();
        const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

        if (finalScore > prevScore) {
            await ref.set({
                uid: user.uid,
                userId: displayId,
                score: finalScore,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const isNewRecord = prevScore >= 0;
            showPopup({
                icon: '🎉',
                title: isNewRecord ? '신기록!' : '점수 등록 완료!',
                scoreHtml: `
                    <div class="popup-score-row">
                        <span class="label">현재 점수</span>
                        <span class="value highlight">${finalScore.toLocaleString()}</span>
                    </div>
                    ${prevScore >= 0 ? `
                    <div class="popup-score-row">
                        <span class="label">이전 기록</span>
                        <span class="value">${prevScore.toLocaleString()}</span>
                    </div>` : ''}
                `,
                buttons: [
                    { text: '🔄 다시하기', onClick: () => { closePopup(); resetGame(); } },
                    { text: '🏠 홈으로', class: 'secondary', onClick: () => { location.href = "../../index.html?tab=suika"; } }
                ]
            });
        } else {
            showPopup({
                icon: '📊',
                title: '기존 기록이 더 높습니다',
                scoreHtml: `
                    <div class="popup-score-row">
                        <span class="label">현재 점수</span>
                        <span class="value">${finalScore.toLocaleString()}</span>
                    </div>
                    <div class="popup-score-row">
                        <span class="label">최고 기록</span>
                        <span class="value highlight">${prevScore.toLocaleString()}</span>
                    </div>
                `,
                buttons: [
                    { text: '🔄 다시하기', onClick: () => { closePopup(); resetGame(); } },
                    { text: '🏠 홈으로', class: 'secondary', onClick: () => { location.href = "../../index.html?tab=suika"; } }
                ]
            });
        }
    } catch (e) {
        console.error("점수 저장 실패:", e);
        showPopup({
            icon: '❌',
            title: '저장 실패',
            message: '점수 저장에 실패했습니다.',
            sub: 'Firestore Rules / 로그인 상태를 확인하세요.',
            buttons: [
                { text: '닫기', onClick: closePopup }
            ]
        });
    }
}

document.getElementById('btnSave').addEventListener('click', async () => {
    await saveScore(score);
    // 저장 후 리더보드 자동 반영(onSnapshot)
});

function loadLeaderboard() {
    const scoreListEl = document.getElementById('scoreList');
    db.collection('suika_scores')
        .orderBy('score', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push(doc.data()));

            if (list.length === 0) {
                scoreListEl.innerHTML = `<div class="muted">No records yet.</div>`;
                return;
            }

            scoreListEl.innerHTML = list.map((it, idx) => {
                const name = safeName(it.userId || it.displayName || it.email || "Member");
                return `
  <div class="score-row">
    <span><span class="rank">${idx + 1}</span>${name}</span>
    <strong>${Number(it.score ?? 0)}</strong>
  </div>
`;
            }).join('');
        }, err => {
            console.error("리더보드 로드 실패:", err);
            document.getElementById('scoreList').innerHTML = `<div class="muted">리더보드 로드 실패</div>`;
        });
}
loadLeaderboard();

/*************************************************
 * 8) Main loop
 *************************************************/
let last = performance.now();

function step(dt) {
    // 물리 안정성 위해 substep
    const sub = SUBSTEPS;
    const sdt = dt / sub;

    for (let k = 0; k < sub; k++) {
        // integrate
        for (const b of balls) {
            b.vy += GRAVITY * sdt;
            b.vx *= AIR_DAMP;
            b.vy *= AIR_DAMP;

            b.x += b.vx * sdt;
            b.y += b.vy * sdt;

            resolveWalls(b);
        }

        // collisions + merges
        // O(n^2) (게임 특성상 개체 수가 제한적이라 충분)
        let merged = false;
        for (let i = 0; i < balls.length && !merged; i++) {
            for (let j = i + 1; j < balls.length && !merged; j++) {
                const a = balls[i];
                const b = balls[j];
                if (!a || !b) continue;

                const collided = resolveBallCollision(a, b);

                // 충돌 여부와 관계없이 가까운 같은 과일은 합체 검사
                if (canMerge(a, b)) {
                    mergeBalls(a, b);
                    merged = true;
                    // merge 후 배열 변경되므로 루프 안전하게 탈출(다음 프레임에 처리)
                    break;
                }
            }
        }
        if (merged) break; // substep 루프도 탈출
    }
}

function checkLose() {
    // 공이 충분히 오래 존재하고(튀는 중 제외), lose line 위로 올라오면 종료
    const now = performance.now();
    for (const b of balls) {
        const stable = (Math.abs(b.vy) < 35 && Math.abs(b.vx) < 35);
        const oldEnough = (now - b.bornAt) > 900;
        if (oldEnough && stable && (b.y - b.r) < LOSE_LINE_Y) {
            endGame(false);
            return;
        }
    }
}

function render() {
    ctx.clearRect(0, 0, W, H);

    // background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // container border inner visual
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 2;
    ctx.strokeRect(WALL_PAD, WALL_PAD, W - WALL_PAD * 2, H - WALL_PAD * 2);

    // lose line
    ctx.strokeStyle = "rgba(255,77,77,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WALL_PAD, LOSE_LINE_Y);
    ctx.lineTo(W - WALL_PAD, LOSE_LINE_Y);
    ctx.stroke();

    // ghost preview line at top
    if (gameActive && !paused && !gameEnded) {
        const r = FRUITS[nextType].r;
        const x = clamp(pointerX, WALL_PAD + r, W - WALL_PAD - r);
        const y = TOP_SPAWN_Y;

        ctx.globalAlpha = 0.35;
        drawFruit(nextType, x, y);
        ctx.globalAlpha = 1;
    }

    // balls
    for (const b of balls) {
        drawFruit(b.type, b.x, b.y);
    }
}

function drawFruit(type, x, y) {
    const f = FRUITS[type];

    // circle
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(x, y, f.r, 0, Math.PI * 2);
    ctx.fill();

    // glossy highlight
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.arc(x - f.r * 0.25, y - f.r * 0.25, f.r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // emoji label
    ctx.font = `${Math.max(12, Math.floor(f.r * 1.1))}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00000066";
    ctx.fillText(f.name, x + 1, y + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(f.name, x, y);
}

function loop(now) {
    const rawDt = (now - last) / 1000;
    last = now;

    if (!paused && gameActive) {
        const dt = Math.min(0.018, Math.max(0.001, rawDt)); // clamp
        step(dt);
        checkLose();
    }

    render();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/*************************************************
 * SFX / VIBE
 *************************************************/
let SFX_ENABLED = (localStorage.getItem("suika_sfx") ?? "true") === "true";
let VIBE_ENABLED = (localStorage.getItem("suika_vibe") ?? "true") === "true";

const btnSfx = document.getElementById("btnSfx");
const btnVibe = document.getElementById("btnVibe");

function syncToggles() {
    if (btnSfx) {
        btnSfx.textContent = `효과음: ${SFX_ENABLED ? "ON" : "OFF"}`;
        btnSfx.classList.toggle("off", !SFX_ENABLED);
    }
    if (btnVibe) {
        btnVibe.textContent = `진동: ${VIBE_ENABLED ? "ON" : "OFF"}`;
        btnVibe.classList.toggle("off", !VIBE_ENABLED);
    }
}
syncToggles();

if (btnSfx) {
    btnSfx.addEventListener("click", () => {
        SFX_ENABLED = !SFX_ENABLED;
        localStorage.setItem("suika_sfx", String(SFX_ENABLED));
        ensureAudio(); // 켜는 순간 언락 시도
        playClick();
        syncToggles();
    });
}
if (btnVibe) {
    btnVibe.addEventListener("click", () => {
        VIBE_ENABLED = !VIBE_ENABLED;
        localStorage.setItem("suika_vibe", String(VIBE_ENABLED));
        vibrate(20);
        syncToggles();
    });
}

// --- WebAudio (톤 생성) ---
let audioCtx = null;

function ensureAudio() {
    if (!SFX_ENABLED) return;
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => { });
    }
}

// 첫 사용자 제스처에서 오디오 언락(필수)
window.addEventListener("pointerdown", () => ensureAudio(), { once: true });

function tone(freq, durMs, type = "sine", gain = 0.06) {
    if (!SFX_ENABLED) return;
    ensureAudio();
    if (!audioCtx) return;

    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    // 클릭/팝 느낌: 아주 짧은 ADSR
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (durMs / 1000));

    osc.connect(g);
    g.connect(audioCtx.destination);

    osc.start(t0);
    osc.stop(t0 + (durMs / 1000) + 0.02);
}

function playClick() {
    tone(500, 35, "square", 0.035);
}
function playDrop() {
    tone(220, 45, "triangle", 0.05);
}
function playMerge(level) {
    // level(0~9)에 따라 피치 상승
    const base = 280 + (level * 35);
    tone(base, 70, "triangle", 0.07);
    tone(base * 1.5, 50, "sine", 0.03);
}
function playGameOver() {
    // 짧은 하강 멜로디
    tone(392, 120, "sine", 0.06);
    setTimeout(() => tone(330, 140, "sine", 0.06), 110);
    setTimeout(() => tone(262, 180, "sine", 0.06), 240);
}

// --- Vibration ---
function vibrate(pattern) {
    if (!VIBE_ENABLED) return;
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}
