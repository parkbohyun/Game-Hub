(function () {
    "use strict";

    // ====== UI 제어: 로더 표시/숨김 ======
    const showLoader = () => {
        const loader = document.getElementById("loader-overlay");
        if (loader) loader.style.display = "flex";
    };

    const hideLoader = () => {
        const loader = document.getElementById("loader-overlay");
        if (loader) loader.style.display = "none";
    };

    // ====== UI 제어: 탭 전환 ======
    window.switchAuthTab = (which) => {
        document.getElementById("tab-login").classList.toggle("active", which === "login");
        document.getElementById("tab-signup").classList.toggle("active", which === "signup");
        document.getElementById("panel-login").classList.toggle("active", which === "login");
        document.getElementById("panel-signup").classList.toggle("active", which === "signup");
        window.setMsg("auth-msg", "");
    };

    const redirectToIndex = (tab) => {
        sessionStorage.setItem("gameHubEntered", "true");
        const q = tab ? `?tab=${encodeURIComponent(tab)}` : "";
        window.location.href = `index.html${q}`;
    };

    // ====== 게스트 로그인 ======
    window.enterAsGuest = async () => {
        showLoader(); // 로딩 시작
        try {
            await auth.signInAnonymously();
            redirectToIndex();
        } catch (e) {
            window.setMsg("auth-msg", "게스트 시작 실패: " + (e?.message || e), true);
            hideLoader(); // 실패 시 로딩 숨김 (성공 시엔 페이지 이동하므로 자동 숨김 처리됨)
        }
    };

    window.signUp = async () => {
        const name = document.getElementById("signup-name").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value;
    
        const passwordConfirm = document.getElementById("signup-password-confirm")?.value ?? "";
    
        // 1. 유효성 검사 (로딩 전 체크)
        if (!name) return window.setMsg("auth-msg", "회원가입 시 표시 이름은 필수입니다.", true);
        if (name.length > 20) return window.setMsg("auth-msg", "표시 이름은 20자 이하여야 합니다.", true);
        if (!email || !password) return window.setMsg("auth-msg", "이메일과 비밀번호를 입력하세요.", true);
        if (password.length < 6) return window.setMsg("auth-msg", "비밀번호는 6자 이상을 권장합니다.", true);
    
        // 2. 비밀번호 확인 일치 검사
        if (!passwordConfirm) return window.setMsg("auth-msg", "비밀번호 확인을 입력하세요.", true);
        if (password !== passwordConfirm) return window.setMsg("auth-msg", "비밀번호와 비밀번호 확인이 일치하지 않습니다.", true);
    
        showLoader(); // 로딩 시작
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await cred.user.updateProfile({ displayName: name });
    
            await db.collection("users").doc(cred.user.uid).set({
                displayName: name,
                email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
    
            window.setMsg("auth-msg", "회원가입 완료. 입장합니다.");
            redirectToIndex();
        } catch (e) {
            window.setMsg("auth-msg", window.humanizeAuthError(e), true);
        } finally {
            hideLoader(); // 성공/실패 여부와 관계없이 로딩 숨김
        }
    };

    // ====== 이메일 로그인 ======
    window.signIn = async () => {
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;

        if (!email || !password) return window.setMsg("auth-msg", "이메일과 비밀번호를 입력하세요.", true);

        showLoader(); // 로딩 시작
        try {
            await auth.signInWithEmailAndPassword(email, password);
            window.setMsg("auth-msg", "로그인 완료. 입장합니다.");
            redirectToIndex();
        } catch (e) {
            window.setMsg("auth-msg", window.humanizeAuthError(e), true);
        } finally {
            hideLoader(); // 성공/실패 여부와 관계없이 로딩 숨김
        }
    };

    // ====== 비밀번호 재설정 ======
    window.sendResetEmail = async () => {
        const email = document.getElementById("login-email").value.trim();
        if (!email) return window.setMsg("auth-msg", "비밀번호 재설정 메일을 받을 이메일을 입력하세요.", true);

        showLoader(); // 로딩 시작
        try {
            await auth.sendPasswordResetEmail(email);
            window.setMsg("auth-msg", "비밀번호 재설정 메일을 발송했습니다. 받은편지함/스팸함을 확인하세요.");
        } catch (e) {
            window.setMsg("auth-msg", window.humanizeResetError(e), true);
        } finally {
            hideLoader(); // 성공/실패 여부와 관계없이 로딩 숨김
        }
    };

    // ====== 초기화 ======
    window.addEventListener("load", () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get("tab");

        auth.onAuthStateChanged((user) => {
            if (user && sessionStorage.getItem("gameHubEntered") === "true") {
                redirectToIndex(tab || "");
            }
        });

        window.switchAuthTab("login");
    });
})();