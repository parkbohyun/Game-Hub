"use strict";

// 현재 게임 타입 저장 (sudoku, minesweeper인 경우 자세히보기 표시)
let currentGameKey = "sudoku";

const setUserBadge = (user) => {
  const badge = document.getElementById("user-badge");
  if (!badge) return;

  if (!user) {
    badge.textContent = "세션 준비 중...";
  } else if (user.isAnonymous) {
    badge.textContent = "게스트(점수 저장 불가)";
  } else {
    badge.textContent = `회원: ${user.displayName || user.email || "회원"}`;
  }
};

const updateScoreWarn = () => {
  const user = auth.currentUser;
  document.getElementById("score-warn").style.display = (!user || user.isAnonymous) ? "block" : "none";
};

// 타임스탬프를 읽기 쉬운 형식으로 변환
const formatTimestamp = (timestamp) => {
  if (!timestamp) return "-";

  if (timestamp.toDate) {
    const date = timestamp.toDate();
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return String(timestamp);
};

// 자세히보기 토글 함수
const toggleDetail = (detailRowId) => {
  const detailRow = document.getElementById(detailRowId);
  if (!detailRow) return;

  if (detailRow.style.display === "none" || !detailRow.style.display) {
    detailRow.style.display = "table-row";
  } else {
    detailRow.style.display = "none";
  }
};

const renderTable = (items, gameType = null) => {
  const body = document.getElementById("score-body");
  body.innerHTML = "";

  const hasDetail = (gameType === "sudoku" || gameType === "minesweeper");

  if (!items.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "데이터가 없습니다.";
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const detailRowId = `detail-row-${idx}`;

    const tdRank = document.createElement("td");
    tdRank.textContent = String(idx + 1);

    const tdName = document.createElement("td");
    tdName.textContent = item.name;

    const tdScore = document.createElement("td");
    tdScore.textContent = item.score;

    const tdDetail = document.createElement("td");

    if (hasDetail) {
      const btn = document.createElement("button");
      btn.textContent = "자세히";
      btn.className = "detail-btn";
      btn.onclick = () => toggleDetail(detailRowId);
      tdDetail.appendChild(btn);
    } else {
      tdDetail.textContent = "-";
    }

    tr.appendChild(tdRank);
    tr.appendChild(tdName);
    tr.appendChild(tdScore);
    tr.appendChild(tdDetail);
    body.appendChild(tr);

    // 상세정보 행 추가 (기본 숨김)
    if (hasDetail) {
      const detailTr = document.createElement("tr");
      detailTr.id = detailRowId;
      detailTr.className = "detail-row";
      detailTr.style.display = "none";

      const detailTd = document.createElement("td");
      detailTd.colSpan = 4;

      let detailHTML = "";
      if (gameType === "sudoku") {
        detailHTML = `
          <div class="detail-content">
            <div class="detail-item"><span class="detail-label">난이도:</span> <span class="detail-value">${item.difficulty || "-"}</span></div>
            <div class="detail-item"><span class="detail-label">클리어 시간:</span> <span class="detail-value">${item.timeText || "-"}</span></div>
            <div class="detail-item"><span class="detail-label">실수:</span> <span class="detail-value">${item.mistakes ?? "-"}</span></div>
            <div class="detail-item"><span class="detail-label">기록 일시:</span> <span class="detail-value">${item.updatedAt || "-"}</span></div>
          </div>
        `;
      } else if (gameType === "minesweeper") {
        detailHTML = `
          <div class="detail-content">
            <div class="detail-item"><span class="detail-label">난이도:</span> <span class="detail-value">${item.difficulty || "-"}</span></div>
            <div class="detail-item"><span class="detail-label">클리어 시간:</span> <span class="detail-value">${item.timeSeconds != null ? item.timeSeconds + "초" : "-"}</span></div>
            <div class="detail-item"><span class="detail-label">기록 일시:</span> <span class="detail-value">${item.updatedAt || "-"}</span></div>
          </div>
        `;
      }

      detailTd.innerHTML = detailHTML;
      detailTr.appendChild(detailTd);
      body.appendChild(detailTr);
    }
  });
};

const updateTabUI = (index) => {
  document.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i === index));
};

const loadScores = async (gameKey) => {
  const map = {
    sudoku: { idx: 0, col: "sudoku_scores" },
    "2048": { idx: 1, col: "2048_scores" },
    "maze-eater": { idx: 2, col: "maze-eater_scores" },
    "merge-fruit": { idx: 3, col: "merge-fruit_scores" },
    blockblast: { idx: 4, col: "blockblast_scores" },
    apple: { idx: 5, col: "apple_scores" },
    dino: { idx: 6, col: "dino_scores" },
    minesweeper: { idx: 7, col: "minesweeper_scores" },
  };

  const key = map[gameKey] ? gameKey : "sudoku";
  currentGameKey = key;
  updateTabUI(map[key].idx);

  const snapshot = await db.collection(map[key].col).orderBy("score", "desc").limit(5).get();

  const items = snapshot.docs.map(d => {
    const data = d.data();
    return {
      name: String(data.userId ?? ""),
      score: (Number(data.score ?? 0)) + "점",
      // 공통 필드
      difficulty: data.difficulty ?? null,
      updatedAt: formatTimestamp(data.updatedAt),
      // Sudoku 전용 필드
      timeText: data.timeText ?? null,
      mistakes: data.mistakes ?? null,
      // Minesweeper 전용 필드
      timeSeconds: data.timeSeconds ?? null,
    };
  });

  renderTable(items, key);
};

// HTML onclick 연결 - 전역 함수로 정의
function loadSudokuScores() { loadScores("sudoku"); }
function load2048Scores() { loadScores("2048"); }
function loadMazeEaterScores() { loadScores("maze-eater"); }
function loadMergeFruitScores() { loadScores("merge-fruit"); }
function loadBlockBlastScores() { loadScores("blockblast"); }
function loadAppleScores() { loadScores("apple"); }
function loadDinoScores() { loadScores("dino"); }
function loadMinesweeperScores() { loadScores("minesweeper"); }

function goSettings() {
  window.location.href = "Settings.html";
}

function goMember() {
  sessionStorage.removeItem("gameHubEntered");
  window.location.href = "member.html";
}

async function logout() {
  try {
    await auth.signOut();
    sessionStorage.removeItem("gameHubEntered");
    window.location.href = "member.html";
  } catch (e) {
    alert("로그아웃 실패: " + (e?.message || e));
  }
}

// window 객체에 명시적으로 등록 (defer 스크립트에서 onclick 접근용)
window.loadSudokuScores = loadSudokuScores;
window.load2048Scores = load2048Scores;
window.loadMazeEaterScores = loadMazeEaterScores;
window.loadMergeFruitScores = loadMergeFruitScores;
window.loadBlockBlastScores = loadBlockBlastScores;
window.loadAppleScores = loadAppleScores;
window.loadDinoScores = loadDinoScores;
window.loadMinesweeperScores = loadMinesweeperScores;
window.goSettings = goSettings;
window.goMember = goMember;
window.logout = logout;

window.addEventListener("load", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tab = urlParams.get("tab"); // sudoku / 2048 / maze-eater / merge-fruit / blockblast / Dino

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "member.html" + (tab ? `?tab=${encodeURIComponent(tab)}` : "");
      return;
    }

    sessionStorage.setItem("gameHubEntered", "true");

    setUserBadge(user);
    updateScoreWarn();
    await loadScores(tab || "sudoku");
  });
});
