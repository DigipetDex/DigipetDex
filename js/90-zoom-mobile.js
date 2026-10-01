/* 캔버스 줌/팬, 모바일 제스처, 바텀시트 */
    // -------------------------------------------------------------------------
    // 7. 캔버스 줌 & 팬
    // -------------------------------------------------------------------------
    const container = document.getElementById("canvas-container");
    const world = document.getElementById("tree-world");
    let currentScale = 0.85;
    let panX = 40, panY = 20;
    let isDragging = false;
    let startX, startY;

    function updateTransform() {
      world.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`;
    }

    let hasMoved = false;
    container.addEventListener("mousedown", (e) => {
      if (e.target.closest(".card-node") || e.target.closest(".zoom-controls") || e.target.closest(".branch-path") || e.target.closest(".jogress-node-box")) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      if (Math.abs(e.clientX - (startX + panX)) > 5 || Math.abs(e.clientY - (startY + panY)) > 5) {
        hasMoved = true;
      }
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener("mouseup", (e) => {
      if (isDragging && !hasMoved) {
        if (!e.target.closest(".card-node") && !e.target.closest(".zoom-controls") && !e.target.closest(".branch-path") && !e.target.closest(".jogress-node-box") && !e.target.closest("header") && !e.target.closest("#sidebar")) {
          if (selectedDigiId) {
            selectedDigiId = null;
            renderTree();
            updateSidebar();
          }
        }
      }
      isDragging = false;
    });

    container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY < 0) currentScale = Math.min(currentScale * zoomFactor, 2.0);
      else currentScale = Math.max(currentScale / zoomFactor, 0.4);
      updateTransform();
      drawConnections();
    }, { passive: false });

    document.getElementById("btn-zoom-in").addEventListener("click", () => {
      currentScale = Math.min(currentScale * 1.2, 2.0);
      updateTransform();
      drawConnections();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
      currentScale = Math.max(currentScale / 1.2, 0.4);
      updateTransform();
      drawConnections();
    });
    function fitEditorView() {
      const cw = container.clientWidth, ch = container.clientHeight;
      const stagesEl = document.getElementById("stages-layout");
      if (!stagesEl) return;
      const sw = stagesEl.scrollWidth + 60, sh = stagesEl.scrollHeight + 80;
      const s = Math.min(cw / sw, ch / sh, 1) * 0.95;
      const minScale = window.innerWidth <= 768 ? 0.22 : 0.45;
      currentScale = Math.min(Math.max(s, minScale), 1.15);
      panX = (cw - stagesEl.scrollWidth * currentScale) / 2 - 30 * currentScale;
      panY = (ch - stagesEl.scrollHeight * currentScale) / 2 - 40 * currentScale;
      updateTransform();
      requestAnimationFrame(drawConnections);
    }

    document.getElementById("btn-zoom-reset").addEventListener("click", fitEditorView);

    // -------------------------------------------------------------
    // 모바일 멀티터치 제스처 엔진 (1핑거 Pan / 2핑거 Pinch-to-Zoom / 탭 구분)
    // -------------------------------------------------------------
    let touchMode = "none"; // "none" | "pan" | "pinch"
    let touchStartX = 0, touchStartY = 0;
    let touchPanStartX = 0, touchPanStartY = 0;
    let touchStartDist = 0;
    let touchStartScale = 1;
    let touchMidX = 0, touchMidY = 0;
    let touchMoved = false;
    let lastTapTime = 0;

    container.addEventListener("touchstart", (e) => {
      if (e.target.closest(".zoom-controls") || e.target.closest(".mobile-sheet-close-btn")) {
        return;
      }

      if (e.touches.length === 1) {
        touchMode = "pan";
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchPanStartX = panX;
        touchPanStartY = panY;
        touchMoved = false;
      } else if (e.touches.length >= 2) {
        touchMode = "pinch";
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartScale = currentScale;
        touchPanStartX = panX;
        touchPanStartY = panY;
        touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        touchMoved = true;
      }
    }, { passive: false });

    container.addEventListener("touchmove", (e) => {
      if (touchMode === "none") return;
      if (e.target.closest(".zoom-controls")) return;

      e.preventDefault();

      if (touchMode === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.hypot(dx, dy) > 8) {
          touchMoved = true;
        }
        panX = touchPanStartX + dx;
        panY = touchPanStartY + dy;
        updateTransform();
      } else if (touchMode === "pinch" && e.touches.length >= 2) {
        const curDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (touchStartDist > 0) {
          const ratio = curDist / touchStartDist;
          const minAllowedScale = window.innerWidth <= 768 ? 0.22 : 0.35;
          const newScale = Math.min(Math.max(touchStartScale * ratio, minAllowedScale), 2.2);

          const curMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const curMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect = container.getBoundingClientRect();
          const focalX = touchMidX - rect.left;
          const focalY = touchMidY - rect.top;

          panX = curMidX - rect.left - (focalX - touchPanStartX) * (newScale / touchStartScale);
          panY = curMidY - rect.top - (focalY - touchPanStartY) * (newScale / touchStartScale);

          currentScale = newScale;
          updateTransform();
          drawConnections();
        }
      }
    }, { passive: false });

    container.addEventListener("touchend", (e) => {
      if (touchMode === "pan") {
        if (!touchMoved) {
          const now = Date.now();
          const targetCard = e.target.closest(".card-node");
          const targetBranch = e.target.closest(".branch-path");

          if (!targetCard && !targetBranch && !e.target.closest(".zoom-controls") && !e.target.closest(".jogress-node-box")) {
            if (now - lastTapTime < 320) {
              fitEditorView();
            } else {
              if (selectedDigiId) {
                selectedDigiId = null;
                renderTree();
                updateSidebar();
              }
              closeMobileBottomSheet();
            }
            lastTapTime = now;
          }
        }
      }

      if (e.touches.length === 0) {
        touchMode = "none";
        touchMoved = false;
      } else if (e.touches.length === 1) {
        touchMode = "pan";
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchPanStartX = panX;
        touchPanStartY = panY;
      }
    }, { passive: true });

    container.addEventListener("touchcancel", () => {
      touchMode = "none";
      touchMoved = false;
    });

    // -------------------------------------------------------------
    // 모바일 바텀시트 제어 (열기 / 닫기 / 스와이프 다운)
    // -------------------------------------------------------------
    function openMobileBottomSheet() {
      const sidebar = document.getElementById("sidebar-panel");
      const backdrop = document.getElementById("mobile-sheet-backdrop");
      if (sidebar) sidebar.classList.add("mobile-open");
      if (backdrop) backdrop.classList.add("active");
    }

    function closeMobileBottomSheet() {
      const sidebar = document.getElementById("sidebar-panel");
      const backdrop = document.getElementById("mobile-sheet-backdrop");
      if (sidebar) sidebar.classList.remove("mobile-open");
      if (backdrop) backdrop.classList.remove("active");
    }

    const btnCloseSheet = document.getElementById("btn-close-mobile-sheet");
    if (btnCloseSheet) {
      btnCloseSheet.addEventListener("click", closeMobileBottomSheet);
    }
    const sheetBackdrop = document.getElementById("mobile-sheet-backdrop");
    if (sheetBackdrop) {
      sheetBackdrop.addEventListener("click", closeMobileBottomSheet);
    }

    // 바텀시트 상단 핸들 아래로 쓸어내려 닫기 제스처
    const sheetTopBar = document.querySelector(".mobile-sheet-topbar");
    if (sheetTopBar) {
      let sheetTouchStartY = 0;
      sheetTopBar.addEventListener("touchstart", (e) => {
        sheetTouchStartY = e.touches[0].clientY;
      }, { passive: true });
      sheetTopBar.addEventListener("touchmove", (e) => {
        const deltaY = e.touches[0].clientY - sheetTouchStartY;
        if (deltaY > 60) {
          closeMobileBottomSheet();
        }
      }, { passive: true });
    }

    // -------------------------------------------------------------
    // 모바일 전용 [화면 맞춤] 버튼 연결
    // -------------------------------------------------------------
    const btnMobileFit = document.getElementById("btn-mobile-fit");
    if (btnMobileFit) {
      btnMobileFit.addEventListener("click", fitEditorView);
    }

