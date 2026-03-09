// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Dino 게임 로직과 UI만 담당한다.
/*
 * Copyright 2014 The Chromium Authors
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 * (Pixel assets and game logic structure inspired by Chromium T-Rex Runner)
 */
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

// =========================
// Firebase 초기화
// =========================
const userBadge = document.getElementById("user-badge");
const guestNote = document.getElementById("guestNote");

// =========================
// UI 요소
// =========================
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlayCard = document.getElementById("overlayCard");
const overlayTitle = document.getElementById("overlayTitle");
const overlayDesc = document.getElementById("overlayDesc");
const hudOverlay = document.getElementById("hudOverlay");
const saveHint = document.getElementById("saveHint");
const btnStart = document.getElementById("btnStart");
const btnReset = document.getElementById("btnReset");
const leaderList = document.getElementById("leaderList");

// =========================
// 캔버스
// =========================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    const frame = document.getElementById("canvasFrame");
    const rect = frame.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.width * (5 / 16));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

// =========================
// 게임 상수 (크롬 다이노 스타일)
// =========================
const GROUND_HEIGHT = 12;
const DINO_WIDTH = 44;
const DINO_HEIGHT = 46;       // 23줄 * 2 = 46
const DINO_DUCK_HEIGHT = 30;  // 15줄 * 2 = 30

// 물리 (더 느리고 자연스럽게)
const GRAVITY = 1600;           // 중력 (낮춤)
const JUMP_VELOCITY = -500;     // 점프 속도 (낮춤)
const INITIAL_SPEED = 4;        // 초기 속도 (많이 낮춤)
const MAX_SPEED = 13;           // 최대 속도 (낮춤)
const ACCELERATION = 0.001;     // 가속도 (많이 낮춤)

// =========================
// 게임 상태
// =========================
const STATE = { READY: "READY", PLAYING: "PLAYING", OVER: "OVER" };
let gameState = STATE.READY;
let score = 0;
let bestLocal = Number(localStorage.getItem("dinoBestLocal") || "0");
let bestRemote = 0;
let lastTs = 0;
let speed = INITIAL_SPEED;
let groundX = 0;
let frameCount = 0;

// 공룡 객체
const dino = {
    x: 50,
    y: 0,           // 바닥 기준으로 계산됨
    width: DINO_WIDTH,
    height: DINO_HEIGHT,
    vy: 0,
    onGround: true,
    ducking: false,
    legFrame: 0,    // 다리 애니메이션
    blinkTimer: 0
};

let obstacles = [];
let clouds = [];
let spawnTimer = 0;
let nextSpawnTime = 1.5;

// =========================
// 다이노 픽셀 아트 (크롬 스타일)
// =========================
const DINO_SPRITE = {
    stand: [
        // 프레임 1
        [
            "                XXXXXXXXX  ",
            "               XX XXXXXXXX ",
            "               XXXXXXXXXXX ",
            "               XXXXXXXXXXX ",
            "               XXXXXXXXXXX ",
            "               XXXXX       ",
            "               XXXXXXXX    ",
            "X            XXXXXXXX      ",
            "X            XXXXXXXXX     ",
            "XX          XXXXXXXXXX     ",
            "XXX        XXXXXXXXXXX     ",
            "XXXX      XXXXXXXXXXXX     ",
            "XXXXX   XXXXXXXXXXXXX      ",
            "XXXXXX XXXXXXXXXXXXXX      ",
            "XXXXXXXXXXXXXXXXXXXX       ",
            " XXXXXXXXXXXXXXXXXX        ",
            "  XXXXXXXXXXXXXXXX         ",
            "    XXXXXXXXXXXXX          ",
            "     XXXXXXXXXX            ",
            "      XXXX  XXX            ",
            "      XX     XX            ",
            "      XXX    XX            ",
            "       XX    XXX            "
        ],
        // 프레임 2
        [
            "                XXXXXXXXX  ",
            "               XX XXXXXXXX ",
            "               XXXXXXXXXXX ",
            "               XXXXXXXXXXX ",
            "               XXXXXXXXXXX ",
            "               XXXXX       ",
            "               XXXXXXXX    ",
            "X            XXXXXXXX      ",
            "X            XXXXXXXXX     ",
            "XX          XXXXXXXXXX     ",
            "XXX        XXXXXXXXXXX     ",
            "XXXX      XXXXXXXXXXXX     ",
            "XXXXX   XXXXXXXXXXXXX      ",
            "XXXXXX XXXXXXXXXXXXXX      ",
            "XXXXXXXXXXXXXXXXXXXX       ",
            " XXXXXXXXXXXXXXXXXX        ",
            "  XXXXXXXXXXXXXXXX         ",
            "    XXXXXXXXXXXXX          ",
            "     XXXXXXXXXX            ",
            "      XXXX  XXX            ",
            "        XX   XX            ",
            "             XX            ",
            "             XXX            "
        ],
    ],
    duck: [
        [
            "                XXXXXX  XXXXXX  ",
            "               XXXXXXXXXXXXXXXX ",
            "               XX XXXXXXXXXXXXX ",
            "               XXXXXXXXXXXXXXXX ",
            "               XXXXXXXXXXXXXXXX ",
            " XXXXXXXXXXXXXXXXXXXXXXXXXXX    ",
            "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  ",
            " XXXXXXXXXXXXXXXXXXXXXXXXXXXXX  ",
            "  XXXXXXXXXXXXXXXXXXXXXXXXXXX   ",
            "    XXXXXXXXXXXXXXXXXXXXXXX     ",
            "      XXXX      XXXX            ",
            "      XX        XX              ",
            "      XXX       XXX             "
        ],
        [
            "                XXXXXX  XXXXXX  ",
            "               XXXXXXXXXXXXXXXX ",
            "               XX XXXXXXXXXXXXX ",
            "               XXXXXXXXXXXXXXXX ",
            "               XXXXXXXXXXXXXXXX ",
            " XXXXXXXXXXXXXXXXXXXXXXXXXXX    ",
            "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  ",
            " XXXXXXXXXXXXXXXXXXXXXXXXXXXXX  ",
            "  XXXXXXXXXXXXXXXXXXXXXXXXXXX   ",
            "    XXXXXXXXXXXXXXXXXXXXXXX     ",
            "      XXX       XXXX            ",
            "       X        XX              ",
            "                XXX             "
        ]
    ]
};

// 선인장 스프라이트
const CACTUS_SMALL = [
    "  XX  ",
    "  XX  ",
    "  XX  ",
    "X XX  ",
    "X XX X",
    "XXXXXX",
    " XXXX ",
    "  XX  ",
    "  XX  ",
    "  XX  "
];

const CACTUS_LARGE = [
    "   XX    ",
    "   XX    ",
    "   XX  X ",
    "X  XX  X ",
    "X  XX  X ",
    "X  XXXXXX",
    "XXXXXXXX ",
    " XXXXXX  ",
    "   XX    ",
    "   XX    ",
    "   XX    ",
    "   XX    "
];

// 새(익룡) 스프라이트
const BIRD_SPRITE = [
    [
        "    X       ",
        "   XX       ",
        "  XXX       ",
        " XXXXXXXXXX ",
        "XXXXXXXXXXXX",
        "   XXXXXXX  ",
        "    XXXXX   "
    ],
    [
        "   XXXXXXX  ",
        "XXXXXXXXXXXX",
        " XXXXXXXXXX ",
        "  XXX       ",
        "   XX       ",
        "    X       ",
        "            "
    ]
];

// 구름 스프라이트
const CLOUD_SPRITE = [
    "    XXXX    ",
    "  XXXXXXXX  ",
    " XXXXXXXXXX ",
    "XXXXXXXXXXXX",
    " XXXXXXXXXX "
];

// =========================
// 픽셀 그리기 함수
// =========================
function getPixelColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? '#e0e0e0' : '#535353';
}

function getGroundColor() {
    return getPixelColor();
}

function getBgColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? '#1a1a1a' : '#f7f7f7';
}

function drawSprite(sprite, x, y, pixelSize = 2) {
    ctx.fillStyle = getPixelColor();
    for (let row = 0; row < sprite.length; row++) {
        for (let col = 0; col < sprite[row].length; col++) {
            if (sprite[row][col] === 'X') {
                ctx.fillRect(
                    x + col * pixelSize,
                    y + row * pixelSize,
                    pixelSize,
                    pixelSize
                );
            }
        }
    }
}

// =========================
// 게임 로직
// =========================
function getGroundY() {
    return canvas.clientHeight - GROUND_HEIGHT;
}

function formatScore(n) {
    return String(Math.floor(n)).padStart(5, '0');
}

function resetGame(keepStateReady = true) {
    score = 0;
    speed = INITIAL_SPEED;
    obstacles = [];
    clouds = [];
    spawnTimer = 0;
    nextSpawnTime = 2.0;
    groundX = 0;
    frameCount = 0;

    const groundY = getGroundY();
    dino.y = groundY - DINO_HEIGHT;
    dino.vy = 0;
    dino.onGround = true;
    dino.ducking = false;
    dino.legFrame = 0;

    scoreEl.textContent = formatScore(0);
    bestEl.textContent = formatScore(Math.max(bestLocal, bestRemote));
    lastTs = 0;

    if (keepStateReady) setState(STATE.READY);
    else setState(STATE.PLAYING);

    saveHint.textContent = "";
}

function setState(s) {
    gameState = s;
    hudOverlay.style.display = s === STATE.PLAYING ? "none" : "flex";

    if (s === STATE.READY) {
        overlayTitle.textContent = "DINO RUN";
        overlayDesc.innerHTML = "SPACE / ↑ / TAP = 점프<br/>↓ = 숙이기<br/><br/>SPACE 또는 화면 터치로 시작";
        btnStart.textContent = "START";
    } else if (s === STATE.OVER) {
        overlayTitle.textContent = "GAME OVER";
        overlayDesc.innerHTML = "SPACE 또는 화면 터치로 재시작";
        btnStart.textContent = "RESTART";
    }
}

// =========================
// 입력 처리
// =========================
function startIfReady() {
    if (gameState === STATE.READY || gameState === STATE.OVER) {
        resetGame(false);
        requestAnimationFrame(loop);
    }
}

function jump() {
    if (gameState !== STATE.PLAYING) return;
    if (!dino.onGround) return;

    dino.vy = JUMP_VELOCITY;
    dino.onGround = false;
    dino.ducking = false;
}

function setDuck(isDuck) {
    if (gameState !== STATE.PLAYING) return;

    if (isDuck && dino.onGround) {
        dino.ducking = true;
    } else if (!isDuck) {
        dino.ducking = false;
    }

    // 공중에서 아래키 = 빠른 하강
    if (isDuck && !dino.onGround) {
        dino.vy = Math.max(dino.vy, 300);
    }
}

document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (gameState !== STATE.PLAYING) startIfReady();
        else jump();
    } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setDuck(true);
    }
});

document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") {
        e.preventDefault();
        setDuck(false);
    }
});

const frame = document.getElementById("canvasFrame");
frame.addEventListener("pointerdown", (e) => {
    if (e.target.id === "btnStart" || e.target.id === "btnReset") return;
    if (gameState !== STATE.PLAYING) startIfReady();
    else jump();
});

btnStart.addEventListener("click", () => startIfReady());
btnReset.addEventListener("click", () => resetGame(true));

// =========================
// 장애물/구름 생성
// =========================
function rand(min, max) { return Math.random() * (max - min) + min; }

function spawnObstacle() {
    const canvasW = canvas.clientWidth;
    const groundY = getGroundY();

    // 80% 선인장, 20% 새
    const type = Math.random() < 0.8 ? "CACTUS" : "BIRD";

    if (type === "CACTUS") {
        const isLarge = Math.random() < 0.5;
        const sprite = isLarge ? CACTUS_LARGE : CACTUS_SMALL;
        const w = sprite[0].length * 2;
        const h = sprite.length * 2;

        obstacles.push({
            x: canvasW + 20,
            y: groundY - h,
            width: w,
            height: h,
            type: "CACTUS",
            sprite: sprite
        });
    } else {
        const w = BIRD_SPRITE[0][0].length * 2;
        const h = BIRD_SPRITE[0].length * 2;
        // 새 높이: 낮음/중간/높음
        const heights = [groundY - h - 5, groundY - h - 40, groundY - h - 75];
        const y = heights[Math.floor(Math.random() * 3)];

        obstacles.push({
            x: canvasW + 20,
            y: y,
            width: w,
            height: h,
            type: "BIRD",
            frame: 0
        });
    }

    // 다음 스폰 간격
    const minGap = Math.max(0.8, 1.5 - speed * 0.05);
    const maxGap = Math.max(1.5, 2.5 - speed * 0.05);
    nextSpawnTime = rand(minGap, maxGap);
    spawnTimer = 0;
}

function spawnCloud() {
    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;

    clouds.push({
        x: canvasW + rand(0, 100),
        y: rand(20, canvasH * 0.35),
        speed: rand(0.5, 1.5)
    });
}

// =========================
// 충돌 감지
// =========================
function checkCollision(dinoBox, obsBox) {
    // 히트박스 여유
    const margin = 6;
    return (
        dinoBox.x + margin < obsBox.x + obsBox.width - margin &&
        dinoBox.x + dinoBox.width - margin > obsBox.x + margin &&
        dinoBox.y + margin < obsBox.y + obsBox.height - margin &&
        dinoBox.y + dinoBox.height - margin > obsBox.y + margin
    );
}

// =========================
// 업데이트
// =========================
function update(dt) {
    const canvasW = canvas.clientWidth;
    const groundY = getGroundY();
    frameCount++;

    // 점수 증가 (거리 기반, 더 느리게)
    score += dt * speed * 3;
    scoreEl.textContent = formatScore(score);

    // 속도 증가 (아주 천천히)
    speed = Math.min(MAX_SPEED, speed + ACCELERATION * dt * 1000);

    // 바닥 스크롤
    groundX -= speed * 60 * dt;
    if (groundX < -20) groundX += 20;

    // 구름 스폰/이동
    if (clouds.length < 4 && Math.random() < 0.008) spawnCloud();
    for (const c of clouds) c.x -= c.speed * 60 * dt;
    clouds = clouds.filter(c => c.x > -60);

    // 장애물 스폰
    spawnTimer += dt;
    if (spawnTimer >= nextSpawnTime) spawnObstacle();

    // 장애물 이동
    for (const o of obstacles) {
        o.x -= speed * 60 * dt;
        if (o.type === "BIRD") {
            o.frame = Math.floor(frameCount / 10) % 2;
        }
    }
    obstacles = obstacles.filter(o => o.x + o.width > -50);

    // 다리 애니메이션
    if (dino.onGround && !dino.ducking) {
        dino.legFrame = Math.floor(frameCount / 5) % 2;
    }

    // 공룡 물리
    const currentHeight = dino.ducking ? DINO_DUCK_HEIGHT : DINO_HEIGHT;

    if (!dino.onGround) {
        dino.vy += GRAVITY * dt;
        dino.y += dino.vy * dt;
    }

    const groundDinoY = groundY - currentHeight;
    if (dino.y >= groundDinoY) {
        dino.y = groundDinoY;
        dino.vy = 0;
        dino.onGround = true;
    }

    // 충돌 감지
    const dinoBox = {
        x: dino.x,
        y: dino.y,
        width: dino.ducking ? 58 : DINO_WIDTH,
        height: dino.ducking ? DINO_DUCK_HEIGHT : DINO_HEIGHT
    };

    for (const o of obstacles) {
        if (checkCollision(dinoBox, o)) {
            onGameOver(Math.floor(score));
            return;
        }
    }

    // 로컬 베스트 갱신
    const scoreInt = Math.floor(score);
    if (scoreInt > bestLocal) {
        bestLocal = scoreInt;
        localStorage.setItem("dinoBestLocal", String(bestLocal));
    }
    bestEl.textContent = formatScore(Math.max(bestLocal, bestRemote));
}

// =========================
// 렌더링
// =========================
function render() {
    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    const groundY = getGroundY();

    // 배경
    ctx.fillStyle = getBgColor();
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 구름
    ctx.globalAlpha = 0.4;
    for (const c of clouds) {
        drawSprite(CLOUD_SPRITE, c.x, c.y, 2);
    }
    ctx.globalAlpha = 1;

    // 바닥선
    ctx.fillStyle = getGroundColor();
    ctx.fillRect(0, groundY, canvasW, 1);

    // 바닥 패턴 (점선처럼)
    for (let x = groundX; x < canvasW; x += 20) {
        ctx.fillRect(x, groundY + 4, 10, 1);
        ctx.fillRect(x + 5, groundY + 7, 6, 1);
    }

    // 장애물
    for (const o of obstacles) {
        if (o.type === "CACTUS") {
            drawSprite(o.sprite, o.x, o.y, 2);
        } else {
            drawSprite(BIRD_SPRITE[o.frame], o.x, o.y, 2);
        }
    }

    // 공룡
    if (dino.ducking) {
        const frame = dino.legFrame;
        const duckY = groundY - DINO_DUCK_HEIGHT;
        drawSprite(DINO_SPRITE.duck[frame], dino.x, duckY, 2);
    } else {
        const frame = dino.onGround ? dino.legFrame : 0;
        drawSprite(DINO_SPRITE.stand[frame], dino.x, dino.y, 2);
    }
}

// =========================
// 게임 루프
// =========================
function loop(ts) {
    if (gameState !== STATE.PLAYING) return;

    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    update(dt);
    render();

    requestAnimationFrame(loop);
}

async function onGameOver(finalScore) {
    setState(STATE.OVER);
    try { navigator.vibrate?.([50, 30, 50]); } catch (e) { }
    await saveScore(finalScore);

    const user = auth.currentUser;
    saveHint.textContent = (!user || user.isAnonymous)
        ? "게스트는 점수 저장 불가"
        : "최고점 자동 저장됨";
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

    const name = prompt("리더보드에 표시할 이름 (최대 20자):");
    if (name?.trim() && name.trim().length <= 20) {
        displayId = name.trim();
        try {
            await user.updateProfile({ displayName: displayId });
            await db.collection("users").doc(user.uid).set({
                displayName: displayId,
                email: user.email || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return displayId;
        } catch (e) { }
    }
    return user.displayName || user.email || "Member";
}

async function loadBestRemote() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        bestRemote = 0;
        return;
    }
    try {
        const doc = await db.collection("dino_scores").doc(user.uid).get();
        bestRemote = doc.exists ? Number(doc.data().score ?? 0) : 0;
    } catch (e) {
        bestRemote = 0;
    }
    bestEl.textContent = formatScore(Math.max(bestLocal, bestRemote));
}

async function saveScore(finalScore) {
    // 점수 저장 전 인증 상태를 확정
    const user = await waitForUser();
    if (!user || user.isAnonymous) {
        guestNote.style.display = "block";
        return;
    }
    guestNote.style.display = "none";

    const displayId = await ensureDisplayName();
    try {
        const ref = db.collection("dino_scores").doc(user.uid);
        const prev = await ref.get();
        const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

        if (finalScore > prevScore) {
            await ref.set({
                uid: user.uid,
                userId: displayId,
                score: finalScore,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            bestRemote = finalScore;
        }
    } catch (e) { }
}

function renderLeaderboard(items) {
    leaderList.innerHTML = "";
    if (!items.length) {
        leaderList.innerHTML = `<div class="leaderItem"><span class="rank">-</span><span class="name">기록 없음</span><span class="pts">0</span></div>`;
        return;
    }
    items.forEach((it, idx) => {
        const div = document.createElement("div");
        div.className = "leaderItem";
        const name = String(it.userId || 'Member').replace(/[<>&"']/g, '');
        div.innerHTML = `<span class="rank">#${idx + 1}</span><span class="name" title="${name}">${name}</span><span class="pts">${formatScore(it.score || 0)}</span>`;
        leaderList.appendChild(div);
    });
}

function subscribeLeaderboard() {
    return db.collection("dino_scores")
        .orderBy("score", "desc")
        .limit(10)
        .onSnapshot((snap) => {
            const items = [];
            snap.forEach(doc => items.push(doc.data()));
            renderLeaderboard(items);
        }, () => renderLeaderboard([]));
}

// =========================
// 시작
// =========================
let unsubLeaderboard = null;

window.onload = async () => {
    resizeCanvas();
    resetGame(true);
    render();

    const user = await waitForUser();
    updateUserBadge(userBadge);
    guestNote.style.display = user.isAnonymous ? "block" : "none";
    await loadBestRemote();
    if (!unsubLeaderboard) unsubLeaderboard = subscribeLeaderboard();
};
