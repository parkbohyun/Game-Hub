// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 Fruit Box 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

// 공통 헬퍼를 활용해 사용자 뱃지/인증을 처리
const userBadge = document.getElementById("user-badge");
const bestEl = document.getElementById("best");

const ROWS = 10;
const COLS = 17;
let grid = [];
let cells = [];
let score = 0;
let timeLeft = 120;
let timer = null;
let isSelecting = false;
let startPos = null;
let gameEnded = false;

const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const sumEl = document.getElementById('sum');
const sumIndicator = document.getElementById('sum-indicator');

// 세션 관리: 공통 헬퍼로 인증 완료 후 초기화
window.onload = async () => {
    await waitForUser();
    updateUserBadge(userBadge);
    loadBestScore();
    initBoard();
};

// 최고 기록 불러오기
async function loadBestScore() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        bestEl.textContent = "-";
        return;
    }

    try {
        const doc = await db.collection("apple_scores").doc(user.uid).get();
        if (doc.exists && doc.data().score) {
            bestEl.textContent = doc.data().score;
        } else {
            bestEl.textContent = "-";
        }
    } catch (e) {
        console.error("최고 기록 불러오기 실패:", e);
        bestEl.textContent = "-";
    }
}

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

// 점수 저장 - 2048.html 패턴
async function saveScore(finalScore) {
    // 점수 저장 직전에 인증 상태를 한 번 더 확정
    await waitForUser();
    const user = auth.currentUser;

    if (!user || user.isAnonymous) {
        alert("게스트는 점수 등록이 불가능합니다. 홈에서 회원가입/로그인 후 기록하세요.");
        return;
    }

    // Firestore users 컬렉션에서 displayName 가져오기
    let displayId = await getDisplayNameFromFirestore();

    // 표시이름이 없으면 1회 입력 받아 프로필에 저장
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
        const ref = db.collection("apple_scores").doc(user.uid);
        const prev = await ref.get();
        const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

        if (finalScore > prevScore) {
            await ref.set({
                uid: user.uid,
                userId: displayId,
                score: finalScore,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            alert("최고 기록이 저장되었습니다!");
            bestEl.textContent = finalScore;
        } else {
            alert(`기존 최고 기록(${prevScore})이 더 높습니다.`);
        }
    } catch (e) {
        console.error("저장 실패: ", e);
        alert("점수 저장에 실패했습니다.");
    }
}

// 리더보드 불러오기
async function loadLeaderboard() {
    const lbEl = document.getElementById('lb');
    lbEl.innerHTML = '<div style="text-align:center;">불러오는 중...</div>';

    try {
        const snapshot = await db.collection("apple_scores")
            .orderBy("score", "desc")
            .limit(10)
            .get();

        if (snapshot.empty) {
            lbEl.innerHTML = '<div style="text-align:center; color:#888;">기록이 없습니다.</div>';
            return;
        }

        let html = '';
        let rank = 1;
        snapshot.forEach(doc => {
            const data = doc.data();
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            html += `<div class="lb-item"><span>${medal} ${escapeHtml(data.userId || 'Member')}</span><span>${data.score}점</span></div>`;
            rank++;
        });
        lbEl.innerHTML = html;
    } catch (e) {
        console.error("리더보드 불러오기 실패:", e);
        lbEl.innerHTML = '<div style="text-align:center; color:#888;">불러오기 실패</div>';
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
}

function initBoard() {
    clearInterval(timer);
    gameEnded = false;
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    grid = [];
    cells = [];
    score = 0;
    timeLeft = 120;
    scoreEl.textContent = '0';
    timeEl.textContent = '120';

    for (let i = 0; i < ROWS * COLS; i++) {
        const val = Math.floor(Math.random() * 9) + 1;
        grid.push(val);

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.dataset.r = Math.floor(i / COLS);
        cell.dataset.c = i % COLS;
        cell.innerHTML = `<div class="apple"><span class="apple-icon">🍎</span><span class="apple-num">${val}</span></div>`;
        boardEl.appendChild(cell);
        cells.push(cell);
    }
    startTimer();
}

function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        timeEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timer);
            endGame();
        }
    }, 1000);
}

// 마우스/터치 좌표로 셀 인덱스 찾기
function getCellIndex(e) {
    const touch = e.touches ? e.touches[0] : e;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target?.closest('.cell');
    if (!cell) return null;
    return {
        r: parseInt(cell.dataset.r),
        c: parseInt(cell.dataset.c)
    };
}

function handleStart(e) {
    if (timeLeft <= 0 || gameEnded) return;
    const pos = getCellIndex(e);
    if (!pos) return;
    isSelecting = true;
    startPos = pos;
    updateSelection(pos);
}

function handleMove(e) {
    if (!isSelecting) return;
    const pos = getCellIndex(e);
    if (pos) updateSelection(pos);
    e.preventDefault();
}

function handleEnd() {
    if (!isSelecting) return;
    isSelecting = false;
    checkSelection();
}

function updateSelection(currentPos) {
    const r1 = Math.min(startPos.r, currentPos.r);
    const r2 = Math.max(startPos.r, currentPos.r);
    const c1 = Math.min(startPos.c, currentPos.c);
    const c2 = Math.max(startPos.c, currentPos.c);

    let currentSum = 0;
    cells.forEach((cell, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) {
            cell.classList.add('selected');
            if (grid[i] !== null) currentSum += grid[i];
        } else {
            cell.classList.remove('selected');
        }
    });

    sumEl.textContent = currentSum;
    sumIndicator.className = 'sum-indicator' + (currentSum === 10 ? ' ok' : '');
}

function checkSelection() {
    const selected = document.querySelectorAll('.cell.selected');
    let sum = 0;
    let count = 0;

    selected.forEach(cell => {
        const idx = cell.dataset.index;
        if (grid[idx] !== null) {
            sum += grid[idx];
            count++;
        }
    });

    if (sum === 10 && count > 0) {
        selected.forEach(cell => {
            const idx = cell.dataset.index;
            grid[idx] = null;
            cell.innerHTML = '';
            cell.classList.add('empty');
        });
        score += count;
        scoreEl.textContent = score;
        if (window.navigator.vibrate) window.navigator.vibrate(20);
    }

    cells.forEach(c => c.classList.remove('selected'));
    sumEl.textContent = '0';
    sumIndicator.className = 'sum-indicator';
}

function endGame() {
    if (gameEnded) return;
    gameEnded = true;
    clearInterval(timer);
    document.getElementById('modal-title').textContent = "게임 종료!";
    document.getElementById('modal-desc').textContent = `최종 점수: ${score}점`;
    loadLeaderboard();
    document.getElementById('overlay').classList.add('show');
}

function hideOverlay() {
    document.getElementById('overlay').classList.remove('show');
}

// 이벤트 리스너
boardEl.addEventListener('mousedown', handleStart);
window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);

boardEl.addEventListener('touchstart', handleStart, { passive: false });
boardEl.addEventListener('touchmove', handleMove, { passive: false });
boardEl.addEventListener('touchend', handleEnd);

document.getElementById('btn-restart').onclick = initBoard;
document.getElementById('btn-end').onclick = endGame;
document.getElementById('btn-save').onclick = () => saveScore(score);
document.getElementById('btn-leaderboard').onclick = () => {
    document.getElementById('modal-title').textContent = "🏆 리더보드";
    document.getElementById('modal-desc').textContent = "";
    loadLeaderboard();
    document.getElementById('overlay').classList.add('show');
};
