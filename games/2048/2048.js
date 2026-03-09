// 공통 초기화(Firebase/테마)는 game-common.js에서 처리하고,
// 이 파일은 2048 게임 로직과 UI만 담당한다.
const { waitForUser, updateUserBadge } = window.gameCommon;
const db = window.db;
const auth = window.auth;

const userBadge = document.getElementById("user-badge");
// 공통 헬퍼로 인증을 끝낸 뒤 보드를 세팅
window.onload = async () => {
  await waitForUser();
  updateUserBadge(userBadge);
  createBoard();
};

const gridDisplay = document.getElementById('grid');
const scoreDisplay = document.getElementById('score');
const width = 4;
let squares = [];
let score = 0;

function createBoard() {
  gridDisplay.innerHTML = '';
  squares = [];
  score = 0;
  scoreDisplay.innerHTML = score;

  for (let i = 0; i < width * width; i++) {
    let square = document.createElement('div');
    square.classList.add('cell');
    square.innerHTML = '';
    gridDisplay.appendChild(square);
    squares.push(square);
  }
  generate();
  generate();

  document.removeEventListener('keyup', control);
  document.addEventListener('keyup', control);
}

function generate() {
  let randomNumber = Math.floor(Math.random() * squares.length);
  if (squares[randomNumber].innerHTML === '') {
    squares[randomNumber].innerHTML = 2;
    updateStyles();
    checkForGameOver();
  } else {
    const emptySquares = squares.filter(s => s.innerHTML === '');
    if (emptySquares.length > 0) generate();
  }
}

function updateStyles() {
  squares.forEach(square => {
    const value = square.innerHTML;
    square.className = 'cell';
    if (value !== '') square.classList.add('tile-' + value);
  });
}

function slide(row) {
  let filteredRow = row.filter(num => num);
  let missing = 4 - filteredRow.length;
  let zeros = Array(missing).fill('');
  return filteredRow.concat(zeros);
}

function combine(row) {
  for (let i = 0; i < 3; i++) {
    if (row[i] !== '' && row[i] === row[i + 1]) {
      let combinedTotal = parseInt(row[i], 10) + parseInt(row[i + 1], 10);
      row[i] = combinedTotal;
      row[i + 1] = '';
      score += combinedTotal;
      scoreDisplay.innerHTML = score;
    }
  }
  return row;
}

function moveLeft() {
  for (let i = 0; i < 16; i += 4) {
    let row = [squares[i].innerHTML, squares[i + 1].innerHTML, squares[i + 2].innerHTML, squares[i + 3].innerHTML];
    let newRow = slide(combine(slide(row)));
    for (let j = 0; j < 4; j++) squares[i + j].innerHTML = newRow[j];
  }
}

function moveRight() {
  for (let i = 0; i < 16; i += 4) {
    let row = [squares[i].innerHTML, squares[i + 1].innerHTML, squares[i + 2].innerHTML, squares[i + 3].innerHTML].reverse();
    let newRow = slide(combine(slide(row))).reverse();
    for (let j = 0; j < 4; j++) squares[i + j].innerHTML = newRow[j];
  }
}

function moveUp() {
  for (let i = 0; i < 4; i++) {
    let col = [squares[i].innerHTML, squares[i + width].innerHTML, squares[i + width * 2].innerHTML, squares[i + width * 3].innerHTML];
    let newCol = slide(combine(slide(col)));
    for (let j = 0; j < 4; j++) squares[i + width * j].innerHTML = newCol[j];
  }
}

function moveDown() {
  for (let i = 0; i < 4; i++) {
    let col = [squares[i].innerHTML, squares[i + width].innerHTML, squares[i + width * 2].innerHTML, squares[i + width * 3].innerHTML].reverse();
    let newCol = slide(combine(slide(col))).reverse();
    for (let j = 0; j < 4; j++) squares[i + width * j].innerHTML = newCol[j];
  }
}

function control(e) {
  const oldBoard = squares.map(s => s.innerHTML).join(',');
  if (e.keyCode === 37) moveLeft();
  else if (e.keyCode === 38) moveUp();
  else if (e.keyCode === 39) moveRight();
  else if (e.keyCode === 40) moveDown();

  const newBoard = squares.map(s => s.innerHTML).join(',');
  if (oldBoard !== newBoard) generate();
  updateStyles();
}

document.addEventListener('keyup', control);

// 터치 스와이프 지원
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

gridDisplay.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

gridDisplay.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  const minSwipeDistance = 30;

  // 스와이프 거리가 너무 짧으면 무시
  if (Math.abs(diffX) < minSwipeDistance && Math.abs(diffY) < minSwipeDistance) return;

  const oldBoard = squares.map(s => s.innerHTML).join(',');

  // 수평 스와이프가 더 큰 경우
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 0) moveRight();
    else moveLeft();
  }
  // 수직 스와이프가 더 큰 경우
  else {
    if (diffY > 0) moveDown();
    else moveUp();
  }

  const newBoard = squares.map(s => s.innerHTML).join(',');
  if (oldBoard !== newBoard) generate();
  updateStyles();
}

function checkForGameOver() {
  let zeros = 0;
  for (let i = 0; i < squares.length; i++) {
    if (squares[i].innerHTML == '') zeros++;
  }

  if (zeros === 0) {
    let canMove = false;
    for (let i = 0; i < 16; i++) {
      const val = squares[i].innerHTML;
      if (i % 4 !== 3 && squares[i + 1].innerHTML === val) canMove = true;
      if (i < 12 && squares[i + 4].innerHTML === val) canMove = true;
    }

    if (!canMove) {
      document.removeEventListener('keyup', control);
      saveScore(score);
    }
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

async function saveScore(finalScore) {
  // 점수 저장 시에도 인증 완료 상태를 한 번 더 보장
  await waitForUser();
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    alert("게스트는 점수 등록이 불가능합니다. 홈에서 회원가입/로그인 후 기록하세요.");
    location.href = "../../index.html?tab=2048";
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
    const ref = db.collection("2048_scores").doc(user.uid);
    const prev = await ref.get();
    const prevScore = prev.exists ? Number(prev.data().score ?? -1) : -1;

    if (finalScore > prevScore) {
      await ref.set({
        uid: user.uid,
        userId: displayId,
        score: finalScore,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      alert("점수가 등록되었습니다! 홈으로 이동합니다.");
    } else {
      alert("기존 기록이 더 높습니다. 홈으로 이동합니다.");
    }
  } catch (e) {
    console.error("저장 실패: ", e);
    alert("점수 저장에 실패했습니다. 홈으로 이동합니다.");
  }

  location.href = "../../index.html?tab=2048";
}
