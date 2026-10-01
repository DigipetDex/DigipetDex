/* 뷰어/에디터 모드 판별 */
    // -------------------------------------------------------------------------
    // 뷰어 모드(Viewer Mode) vs 에디터 모드(Editor Mode) 자동 판별
    // -------------------------------------------------------------------------
    const urlParams = new URLSearchParams(window.location.search);
    const pathLower = window.location.pathname.toLowerCase();
    const isViewerByPath = pathLower.endsWith("viewer.html") || 
                           pathLower.endsWith("index.html") || 
                           pathLower.endsWith("/viewer") || 
                           pathLower.endsWith("/");
    const isViewerByParam = urlParams.has("view") || urlParams.get("mode") === "viewer";
    const isMobileDevice = window.innerWidth <= 768;
    let isViewerMode = isViewerByPath || isViewerByParam || isMobileDevice;

    function applyViewerModeUI() {
      if (window.innerWidth <= 768) {
        isViewerMode = true;
      }
      document.body.classList.toggle("viewer-mode", isViewerMode);

      const titleEl = document.getElementById("header-logo-title");
      const badgeEl = document.getElementById("header-logo-badge");
      const toggleBtn = document.getElementById("btn-toggle-mode");
      const verEl = document.getElementById("app-version-tag");
      if (verEl && typeof APP_VERSION !== "undefined") {
        verEl.textContent = APP_VERSION;
      }

      if (isViewerMode) {
        if (titleEl && badgeEl) {
          titleEl.childNodes[0].nodeValue = "디지펫 바이탈 링크 ";
          badgeEl.textContent = "진화 트리 뷰어";
          badgeEl.style.background = "#23A55A";
        }
        if (toggleBtn) {
          toggleBtn.style.display = "none";
        }
        document.title = "디지펫 바이탈 링크 - 진화 트리 뷰어";
      } else {
        if (titleEl && badgeEl) {
          titleEl.childNodes[0].nodeValue = "디지펫 바이탈 링크 ";
          badgeEl.textContent = "트리 & 시트 편집기";
          badgeEl.style.background = "var(--primary)";
        }
        if (toggleBtn) {
          toggleBtn.style.display = "inline-flex";
          toggleBtn.innerHTML = "뷰어 모드로 보기";
          toggleBtn.style.background = "#5865F2";
          toggleBtn.title = "편집 요소를 숨기고 완성된 진화 트리 뷰어 모드로 확인합니다.";
        }
        document.title = "디지몬 진화트리 & 스프레드시트 편집기";
      }
    }

