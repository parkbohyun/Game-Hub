// 게임 공통 유틸: 테마 적용, Firebase 초기화, 사용자 표시/인증 헬퍼
// 모든 게임에서 중복되던 초기화 코드를 한 번만 실행하도록 묶어 관리한다.
(() => {
  // 저장된 테마를 가장 먼저 적용해 초기 렌더링 시 깜빡임을 줄인다.
  const savedTheme = localStorage.getItem("gameHubTheme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
})();

(() => {
  const firebaseConfig = window.FIREBASE_CONFIG;

  if (!firebaseConfig) {
    console.error("FIREBASE_CONFIG is not defined! Please make sure config.js is loaded.");
  }

  // Firebase 앱은 한 번만 초기화되도록 방어
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db = firebase.firestore();
  const auth = firebase.auth();

  // 인증이 완료될 때까지 대기하는 Promise를 재사용해 중복 리스너를 방지한다.
  const waitForUser = (() => {
    let readyPromise;
    return () => {
      if (readyPromise) return readyPromise;
      readyPromise = new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
          if (!user) {
            await auth.signInAnonymously();
            return;
          }
          unsubscribe();
          resolve(user);
        });
      });
      return readyPromise;
    };
  })();

  // Firestore users 컬렉션에서 표시용 이름을 읽어온다.
  async function getDisplayNameFromFirestore() {
    const user = await waitForUser();
    if (!user || user.isAnonymous) return null;

    try {
      const doc = await db.collection("users").doc(user.uid).get();
      if (doc.exists && doc.data().displayName) {
        return doc.data().displayName;
      }
    } catch (error) {
      console.error("Firestore에서 displayName을 가져오는 중 오류:", error);
    }
    return user.displayName || user.email || "Member";
  }

  // 점수 저장 시 사용할 표시용 ID 생성
  function getDisplayIdForScore() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return "Guest";
    return user.displayName || user.email || "Member";
  }

  // 사용자 뱃지에 공통 포맷을 적용
  function updateUserBadge(element, guestText = "게스트 (비회원)") {
    if (!element) return;
    waitForUser().then((user) => {
      element.textContent = user.isAnonymous
        ? guestText
        : `회원: ${user.displayName || user.email || "회원"}`;
    });
  }

  // 전역으로 노출해 각 게임 스크립트에서 바로 사용
  window.db = db;
  window.auth = auth;
  window.gameCommon = {
    db,
    auth,
    waitForUser,
    updateUserBadge,
  };
  window.getDisplayNameFromFirestore = getDisplayNameFromFirestore;
  window.getDisplayIdForScore = getDisplayIdForScore;
})();
