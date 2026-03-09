(function () {
    "use strict";

    const firebaseConfig = window.FIREBASE_CONFIG;

    if (!firebaseConfig) {
        console.error("FIREBASE_CONFIG is not defined! Please make sure config.js is loaded.");
    }

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    window.db = firebase.firestore();
    window.auth = firebase.auth();

    // ====== 공통 헬퍼 함수 ======

    // 메시지 표시 함수
    window.setMsg = (elementId, msg, isError = false) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = msg;
        el.style.color = isError ? "#c0392b" : "var(--text-color, #2c3e50)";
    };

    // Firebase Auth 에러 메시지 변환
    window.humanizeAuthError = (e) => {
        const code = e?.code || "";
        if (code === "auth/email-already-in-use") return "이미 사용 중인 이메일입니다.";
        if (code === "auth/invalid-email") return "이메일 형식이 올바르지 않습니다.";
        if (code === "auth/user-not-found") return "계정을 찾을 수 없습니다.";
        if (code === "auth/wrong-password") return "비밀번호가 올바르지 않습니다.";
        if (code === "auth/invalid-credential") return "이메일 또는 비밀번호가 올바르지 않습니다.";
        if (code === "auth/too-many-requests") return "요청이 많습니다. 잠시 후 다시 시도하세요.";
        if (code === "auth/weak-password") return "비밀번호가 너무 약합니다. 6자 이상 입력하세요.";
        if (code === "auth/requires-recent-login") return "보안을 위해 다시 로그인 후 시도하세요.";
        return e?.message || "인증 중 오류가 발생했습니다.";
    };

    // 비밀번호 재설정 에러 메시지 변환
    window.humanizeResetError = (e) => {
        const code = e?.code || "";
        if (code === "auth/invalid-email") return "이메일 형식이 올바르지 않습니다.";
        if (code === "auth/user-not-found") return "해당 이메일로 가입된 계정이 없습니다.";
        if (code === "auth/too-many-requests") return "요청이 많습니다. 잠시 후 다시 시도하세요.";
        return e?.message || "메일 발송 중 오류가 발생했습니다.";
    };

    // 안전한 이름 반환
    window.safeName = (s) => {
        return (s && String(s).trim()) ? String(s).trim() : "Member";
    };

    // Firestore에서 displayName 가져오기
    window.getDisplayNameFromFirestore = async () => {
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
    };
})();
