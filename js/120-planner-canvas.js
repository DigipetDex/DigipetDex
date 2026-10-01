/* 플래너 캔버스(PNG/클립보드) 생성 및 window load 초기화 */
    // =========================================================================
    // 진화 체인 고화질 캔버스(Canvas) 생성 및 클립보드 / PNG 내보내기
    // =========================================================================
    function getEvoCondSummary(fromDigi, toDigi) {
      if (!fromDigi || !toDigi) return { lines: ["-"], isUnknown: false, isDisconnected: false, items: [] };

      const isDirect = areDigimonsDirectlyConnected(fromDigi.id, toDigi.id);
      if (!isDirect) {
        return { lines: ["연결 없음"], isUnknown: true, isDisconnected: true, items: [] };
      }

      const evoResult = findDirectOrPathEvo(fromDigi.id, toDigi.id);
      const evo = evoResult?.evo || null;
      const req = getEvoRequirements(evo, toDigi);
      const isRevealed = evo ? isEvoRevealed(evo, toDigi.stage) : !toDigi.unknownTime;
      const isBabyOrChild = ["디지타마", "유년기 I", "유년기 II", "성장기"].includes(toDigi.stage) || ["유년기 I", "유년기 II"].includes(fromDigi.stage);

      if (!isRevealed && !isBabyOrChild) {
        return { lines: ["조건 불명"], isUnknown: true, isDisconnected: false, items: [] };
      }

      const items = [];
      if (req.jogress && req.jogress !== "-" && req.jogress !== "없음") {
        items.push({ label: "조그레스", val: req.jogress, color: "#C084FC" });
      }
      if (req.item && req.item !== "-" && req.item !== "없음") {
        items.push({ label: "아이템", val: req.item, color: "#FCD34D" });
      }
      if (req.time && req.time !== "-") {
        items.push({ label: "시간", val: req.time, color: "#FBBF24", iconKey: "time", text: req.time });
      }
      if (req.vital !== "" && req.vital !== undefined && req.vital !== null && req.vital !== "-") {
        items.push({ label: "바이탈", val: Number(req.vital).toLocaleString() + "V", color: "#34D399", iconKey: "vital", text: Number(req.vital).toLocaleString() + "V" });
      }
      if (req.pp !== "" && req.pp !== undefined && req.pp !== null && req.pp !== "-") {
        items.push({ label: "PP", val: "PP " + req.pp, color: "#38BDF8", iconKey: "pp", text: "PP " + req.pp });
      }
      if (req.battle || req.winRate) {
        const b = req.battle ? `${req.battle}회` : '';
        const w = req.winRate ? `${req.winRate}%` : '';
        const str = [b, w].filter(Boolean).join(' · ');
        if (str) items.push({ label: "배틀", val: str, color: "#F87171", iconKey: "battle", text: str });
      }
      if (req.dungeon && req.dungeon !== "-" && req.dungeon !== "없음") {
        const dStr = req.dungeon.startsWith("던전") ? req.dungeon : `던전 ${req.dungeon}`;
        items.push({ label: "던전", val: dStr, color: "#FB923C" });
      }

      if (items.length === 0) {
        return { lines: ["조건 없음"], isUnknown: false, items: [] };
      }
      return { lines: [], isUnknown: false, items };
    }

    async function loadImgAsync(src) {
      if (!src) return null;
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    async function generatePlannerChainCanvas() {
      if (!plannerChain || plannerChain.length === 0) return null;

      const digis = plannerChain.map(id => project.digimons[id]).filter(Boolean);
      if (digis.length === 0) return null;

      const attrKoMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-" };

      // 아이콘 이미지 사전 로드
      const iconSrcs = { time: "진화시간.webp", vital: "바이탈.webp", pp: "PP.webp", battle: "승률.webp" };
      const iconImgs = {};
      await Promise.all(Object.entries(iconSrcs).map(async ([key, src]) => {
        iconImgs[key] = await loadImgAsync(src);
      }));

      // 아이콘+텍스트 한 줄 그리기 헬퍼: 아이콘이 있으면 왼쪽에 그리고 텍스트 오른쪽 정렬
      function drawCondRow(ctx, items, cx, cy, fontSize) {
        if (items.length === 0) return;
        const iconSize = fontSize + 1;
        const gap = 3;

        // 전체 너비 계산
        ctx.font = `bold ${fontSize}px 'Pretendard', sans-serif`;
        let totalW = 0;
        items.forEach((it, idx) => {
          if (idx > 0) totalW += ctx.measureText(" · ").width;
          if (iconImgs[it.iconKey]) totalW += iconSize + gap;
          totalW += ctx.measureText(it.text).width;
        });

        let curX = cx - totalW / 2;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        items.forEach((it, idx) => {
          if (idx > 0) {
            ctx.fillStyle = "#64748B";
            ctx.fillText(" · ", curX, cy);
            curX += ctx.measureText(" · ").width;
          }
          if (iconImgs[it.iconKey]) {
            ctx.drawImage(iconImgs[it.iconKey], curX, cy - iconSize / 2, iconSize, iconSize);
            curX += iconSize + gap;
          }
          ctx.fillStyle = it.color;
          ctx.fillText(it.text, curX, cy);
          curX += ctx.measureText(it.text).width;
        });

        ctx.textAlign = "center";
      }

      // 이미지 사전 로드
      const loadedImages = await Promise.all(digis.map(d => loadImgAsync(d.img)));

      // 레이아웃 계산: 4개 이하 1줄, 5개 이상 2줄 분할
      const totalCards = digis.length;
      const maxPerRow = (totalCards <= 4) ? totalCards : Math.ceil(totalCards / 2);
      const row1Count = (totalCards <= 4) ? totalCards : maxPerRow;
      const row2Count = (totalCards <= 4) ? 0 : (totalCards - row1Count);

      const cardW = 96;
      const cardH = 104;
      const connW = 136;
      const padX = 24;
      const padY = 20;
      const headerH = 52;
      const rowH = 134; // pill(20) + gap(4) + card(104) + bottom spacing
      const rowGap = 28;

      const rowCols = Math.max(row1Count, row2Count);
      const contentW = rowCols * cardW + (rowCols - 1) * connW;
      const totalW = contentW + padX * 2;
      const totalH = headerH + (row2Count > 0 ? (rowH * 2 + rowGap) : rowH) + padY * 2;

      const scale = 2; // 선명한 2배 레티나 스케일
      const canvas = document.createElement("canvas");
      canvas.width = totalW * scale;
      canvas.height = totalH * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);

      // 1. 전체 다크 배경
      ctx.fillStyle = "#1E1F22";
      drawRoundedRect(ctx, 0, 0, totalW, totalH, 16);
      ctx.fill();
      ctx.strokeStyle = "#2B2D31";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2. 상단 헤더
      const firstName = digis[0].name;
      const lastName = digis[digis.length - 1].name;
      const title = (totalCards === 1) ? `${firstName} 진화 정보` : `${firstName} ➔ ${lastName} 진화 경로`;
      const dimLabel = (plannerActiveDim && plannerActiveDim !== "ALL") ? plannerActiveDim : "전체 DiM";

      // 타이틀
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 15px 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(title, padX, padY + 14);

      // 서브타이틀
      ctx.font = "11px 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#94A3B8";
      ctx.fillText(`DIGIPET 진화 플래너 · ${dimLabel} · 총 ${totalCards}단계`, padX, padY + 32);

      // 헤더 구분선
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, padY + headerH - 8);
      ctx.lineTo(totalW - padX, padY + headerH - 8);
      ctx.stroke();

      // 3. 카드 및 커넥터 렌더링 함수
      function renderStep(dIdx, colIdx, rowIdx) {
        const d = digis[dIdx];
        const img = loadedImages[dIdx];
        const startY = padY + headerH + rowIdx * (rowH + rowGap);
        const x = padX + colIdx * (cardW + connW);
        const y = startY + 22; // pill 아래

        // A. 이전 단계와의 커넥터 (해당 행의 첫 카드가 아닐 때)
        if (colIdx > 0) {
          const prevDigi = digis[dIdx - 1];
          const connX = x - connW;
          const connY = y;
          const bubbleW = connW - 14;
          // 조건 계산 먼저
          const cond = getEvoCondSummary(prevDigi, d);

          // 조건 분류
          const jogressItem = cond.items.find(it => it.label === "조그레스");
          const specialItem = cond.items.find(it => it.label === "아이템");
          const iconItems = cond.items.filter(it => it.iconKey);
          const iconRowCount = Math.ceil(iconItems.length / 2);

          // 버블 높이 동적 계산 (행당 13px + 상하 패딩 16px)
          let contentRows = iconRowCount;
          if (jogressItem) contentRows += 2; // 라벨 1줄 + 파트너명 1줄
          else if (specialItem) contentRows += 2;
          const bubbleH = Math.max(44, contentRows * 14 + 16);
          const bx = connX + 7;
          const by = connY + 6;

          // 조건 버블 배경
          ctx.fillStyle = "#18191C";
          drawRoundedRect(ctx, bx, by, bubbleW, bubbleH, 8);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // 조건 텍스트 렌더링
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (cond.isDisconnected) {
            ctx.font = "bold 10px 'Pretendard', sans-serif";
            ctx.fillStyle = "#EF4444";
            ctx.fillText("연결 없음", bx + bubbleW / 2, by + bubbleH / 2);
          } else if (cond.isUnknown) {
            ctx.font = "10px 'Pretendard', sans-serif";
            ctx.fillStyle = "#94A3B8";
            ctx.fillText("조건 불명", bx + bubbleW / 2, by + bubbleH / 2);
          } else if (cond.items.length === 0) {
            ctx.font = "10px 'Pretendard', sans-serif";
            ctx.fillStyle = "#64748B";
            ctx.fillText("조건 없음", bx + bubbleW / 2, by + bubbleH / 2);
          } else {
            let curY = by + 10;

            // 1. 조그레스 / 아이템: 라벨 + 파트너명 분리 표시
            if (jogressItem) {
              ctx.font = "bold 9px 'Pretendard', sans-serif";
              ctx.fillStyle = "#C084FC";
              ctx.fillText("조그레스", bx + bubbleW / 2, curY);
              curY += 13;
              // 파트너명: 너무 길면 말줄임
              ctx.font = "8px 'Pretendard', sans-serif";
              ctx.fillStyle = "#D8B4FE";
              let partnerStr = jogressItem.val;
              while (ctx.measureText(partnerStr).width > bubbleW - 8 && partnerStr.length > 3) {
                partnerStr = partnerStr.slice(0, -1);
              }
              if (partnerStr !== jogressItem.val) partnerStr += "…";
              ctx.fillText(partnerStr, bx + bubbleW / 2, curY);
              curY += 13;
            } else if (specialItem) {
              ctx.font = "bold 9px 'Pretendard', sans-serif";
              ctx.fillStyle = "#FCD34D";
              ctx.fillText("아이템", bx + bubbleW / 2, curY);
              curY += 13;
              ctx.font = "8px 'Pretendard', sans-serif";
              ctx.fillStyle = "#FDE68A";
              let itemStr = specialItem.val;
              while (ctx.measureText(itemStr).width > bubbleW - 8 && itemStr.length > 3) {
                itemStr = itemStr.slice(0, -1);
              }
              if (itemStr !== specialItem.val) itemStr += "…";
              ctx.fillText(itemStr, bx + bubbleW / 2, curY);
              curY += 13;
            }

            // 2. 아이콘 조건 (time, vital, pp, battle) - 2개씩 행으로
            for (let i = 0; i < iconItems.length; i += 2) {
              const rowSlice = iconItems.slice(i, i + 2).map(it => ({
                iconKey: it.iconKey,
                text: it.text || it.val,
                color: it.color
              }));
              drawCondRow(ctx, rowSlice, bx + bubbleW / 2, curY, 9.5);
              curY += 13;
            }
          }

          // 화살표 선 & 화살촉
          const arrY = by + bubbleH + 16;
          ctx.strokeStyle = cond.isDisconnected ? "#EF4444" : "#5865F2";
          ctx.fillStyle = cond.isDisconnected ? "#EF4444" : "#5865F2";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(bx + 14, arrY);
          ctx.lineTo(bx + bubbleW - 14, arrY);
          ctx.stroke();

          // 화살촉
          ctx.beginPath();
          ctx.moveTo(bx + bubbleW - 14, arrY);
          ctx.lineTo(bx + bubbleW - 20, arrY - 4);
          ctx.lineTo(bx + bubbleW - 20, arrY + 4);
          ctx.closePath();
          ctx.fill();
        }

        // B. 세대 배지 (Pill)
        const stageText = d.stage || `Step ${dIdx + 1}`;
        ctx.font = "bold 10px 'Pretendard', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const stageW = Math.max(60, ctx.measureText(stageText).width + 16);
        const stageH = 18;
        const stageX = x + (cardW - stageW) / 2;
        const stageY = startY;

        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        drawRoundedRect(ctx, stageX, stageY, stageW, stageH, 9);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#94A3B8";
        ctx.fillText(stageText, stageX + stageW / 2, stageY + stageH / 2);

        // C. 디지몬 카드 본체
        ctx.fillStyle = "#2B2D31";
        drawRoundedRect(ctx, x, y, cardW, cardH, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 디지몬 이미지
        if (img) {
          const imgSize = 44;
          const imgX = x + (cardW - imgSize) / 2;
          const imgY = y + 8;
          ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
        } else {
          // 대체 플레이스홀더
          ctx.fillStyle = "#1E1F22";
          ctx.beginPath();
          ctx.arc(x + cardW / 2, y + 30, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#64748B";
          ctx.font = "12px sans-serif";
          ctx.fillText("?", x + cardW / 2, y + 30);
        }

        // 디지몬 이름
        ctx.font = "bold 11px 'Pretendard', sans-serif";
        ctx.fillStyle = "#FFFFFF";
        let displayName = d.name;
        if (ctx.measureText(displayName).width > cardW - 12) {
          while (ctx.measureText(displayName + "…").width > cardW - 12 && displayName.length > 1) {
            displayName = displayName.slice(0, -1);
          }
          displayName += "…";
        }
        ctx.fillText(displayName, x + cardW / 2, y + 68);

        // 디지몬 속성
        ctx.font = "10px 'Pretendard', sans-serif";
        ctx.fillStyle = "#94A3B8";
        ctx.fillText(attrKoMap[d.attr] || d.attr || "-", x + cardW / 2, y + 84);
      }

      // 1행 카드 렌더링
      for (let i = 0; i < row1Count; i++) {
        renderStep(i, i, 0);
      }

      // 2행 카드 렌더링
      if (row2Count > 0) {
        for (let i = 0; i < row2Count; i++) {
          const dIdx = row1Count + i;
          renderStep(dIdx, i, 1);
        }

        // 1행과 2행 사이 줄바꿈 커넥터 인디케이터
        const bridgePrev = digis[row1Count - 1];
        const bridgeNext = digis[row1Count];
        const bridgeCond = getEvoCondSummary(bridgePrev, bridgeNext);
        const isBridgeDirect = !bridgeCond.isDisconnected;
        const bridgeText = bridgeCond.items.length > 0
          ? bridgeCond.items.map(it => `${it.label} ${it.val}`).join(" · ")
          : (bridgeCond.isDisconnected ? "연결 없음" : (bridgeCond.isUnknown ? "조건 불명" : "다음 진화"));

        const indY = padY + headerH + rowH + 6;
        ctx.font = "bold 10px 'Pretendard', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isBridgeDirect ? "#7DD3FC" : "#EF4444";
        ctx.fillText(isBridgeDirect ? `↵ 다음 단계 계속 [${bridgeText}]` : `✕ 연결 끊김 [${bridgeText}]`, padX + 8, indY);
      }

      return canvas;
    }

    async function copyPlannerChainImageToClipboard() {
      if (!plannerChain || plannerChain.length === 0) {
        showToast("복사할 진화 경로가 없습니다. 디지몬을 먼저 선택해주세요.");
        return;
      }
      showToast("이미지를 생성하는 중입니다...");
      try {
        const canvas = await generatePlannerChainCanvas();
        if (!canvas) throw new Error("Canvas generation failed");

        canvas.toBlob(async (blob) => {
          if (!blob) {
            showToast("이미지 변환 실패: PNG 다운로드를 진행합니다.");
            downloadCanvasAsPng(canvas);
            return;
          }

          if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
            try {
              const item = new ClipboardItem({ "image/png": blob });
              await navigator.clipboard.write([item]);
              showToast("진화 경로 이미지가 클립보드에 복사되었습니다! (Ctrl+V로 붙여넣기)");
              return;
            } catch (clipErr) {
              console.warn("ClipboardItem write failed, fallback to download:", clipErr);
            }
          }

          downloadCanvasAsPng(canvas);
          showToast("클립보드 접근이 제한되어 PNG 파일로 다운로드되었습니다.");
        }, "image/png");
      } catch (err) {
        console.error("copyPlannerChainImageToClipboard error:", err);
        showToast("이미지 복사 중 오류: " + err.message);
      }
    }

    async function downloadPlannerChainImage() {
      if (!plannerChain || plannerChain.length === 0) {
        showToast("다운로드할 진화 경로가 없습니다. 디지몬을 먼저 선택해주세요.");
        return;
      }
      showToast("이미지를 생성하는 중입니다...");
      try {
        const canvas = await generatePlannerChainCanvas();
        if (!canvas) throw new Error("Canvas generation failed");
        downloadCanvasAsPng(canvas);
        showToast("진화 경로 이미지가 다운로드되었습니다!");
      } catch (err) {
        console.error("downloadPlannerChainImage error:", err);
        showToast("이미지 다운로드 중 오류: " + err.message);
      }
    }

    function downloadCanvasAsPng(canvas, filename) {
      if (!filename) {
        const firstName = project.digimons[plannerChain[0]]?.name || "시작";
        const lastName = project.digimons[plannerChain[plannerChain.length - 1]]?.name || "끝";
        filename = `진화경로_${firstName}_to_${lastName}.png`;
      }
      const link = document.createElement("a");
      link.download = filename;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function initEvolutionPlanner() {
      // 1. 헤더 오픈 버튼
      const btnOpen = document.getElementById("btn-open-evolution-planner");
      if (btnOpen) btnOpen.addEventListener("click", () => openEvolutionPlannerModal());
      const btnMobileOpen = document.getElementById("btn-mobile-evolution-planner");
      if (btnMobileOpen) btnMobileOpen.addEventListener("click", () => openEvolutionPlannerModal());

      // 2. 메인 플래너 닫기
      const btnClose = document.getElementById("evolution-planner-close");
      if (btnClose) btnClose.addEventListener("click", closeEvolutionPlannerModal);
      const modalPlanner = document.getElementById("evolution-planner-modal");
      if (modalPlanner) {
        modalPlanner.addEventListener("click", (e) => {
          if (e.target === modalPlanner) closeEvolutionPlannerModal();
        });
      }

      // 3. 체인 초기화 버튼
      const btnResetChain = document.getElementById("planner-btn-reset-chain");
      if (btnResetChain) {
        btnResetChain.addEventListener("click", () => {
          plannerChain = [];
          plannerActiveIndex = 0;
          updateEvolutionPlannerUI();
          openPlannerPickerModal(0);
        });
      }

      // 4. 플래너 내 DiM 필터
      const filterDimSel = document.getElementById("planner-filter-dim");
      if (filterDimSel) {
        filterDimSel.addEventListener("change", (e) => {
          plannerActiveDim = e.target.value;
          updateEvolutionPlannerUI();
        });
      }

      // 5. 피커 모달 닫기
      const btnPickerClose = document.getElementById("planner-picker-close");
      if (btnPickerClose) btnPickerClose.addEventListener("click", closePlannerPickerModal);
      const modalPicker = document.getElementById("planner-picker-modal");
      if (modalPicker) {
        modalPicker.addEventListener("click", (e) => {
          if (e.target === modalPicker) closePlannerPickerModal();
        });
      }

      // 6. 피커 검색어 입력
      const searchInput = document.getElementById("planner-search-input");
      const searchClear = document.getElementById("planner-search-clear");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          pickerSearchQuery = e.target.value;
          if (searchClear) searchClear.style.display = pickerSearchQuery ? "block" : "none";
          renderPlannerPickerList();
        });
      }
      if (searchClear) {
        searchClear.addEventListener("click", () => {
          if (searchInput) searchInput.value = "";
          pickerSearchQuery = "";
          searchClear.style.display = "none";
          renderPlannerPickerList();
        });
      }

      // 7. 피커 세대 칩 클릭
      document.querySelectorAll("#planner-stage-chips .planner-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          document.querySelectorAll("#planner-stage-chips .planner-chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          pickerStageFilter = chip.dataset.stage;
          renderPlannerPickerList();
        });
      });

      // 8. 피커 속성 칩 클릭
      document.querySelectorAll("#planner-attr-chips .planner-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          document.querySelectorAll("#planner-attr-chips .planner-chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          pickerAttrFilter = chip.dataset.attr;
          renderPlannerPickerList();
        });
      });

      // 9. 피커 DiM 셀렉트 변경
      const pickerDimSelect = document.getElementById("planner-picker-dim-select");
      if (pickerDimSelect) {
        pickerDimSelect.addEventListener("change", (e) => {
          pickerDimFilter = e.target.value;
          renderPlannerPickerList();
        });
      }

      // 10. 진화 경로 저장 버튼
      const btnSaveChain = document.getElementById("planner-btn-save-chain");
      if (btnSaveChain) btnSaveChain.addEventListener("click", saveCurrentPlannerChain);

      // 11. 저장된 목록 모달 열기 버튼
      const btnSavedList = document.getElementById("planner-btn-saved-list");
      if (btnSavedList) btnSavedList.addEventListener("click", openSavedPlannerModal);

      // 12. 저장된 목록 모달 닫기
      const btnSavedClose = document.getElementById("planner-saved-modal-close");
      if (btnSavedClose) btnSavedClose.addEventListener("click", closeSavedPlannerModal);
      const modalSaved = document.getElementById("planner-saved-modal");
      if (modalSaved) {
        modalSaved.addEventListener("click", (e) => {
          if (e.target === modalSaved) closeSavedPlannerModal();
        });
      }

      // 13. 이미지 복사 / PNG 다운로드 버튼
      const btnCopyImg = document.getElementById("planner-btn-copy-img");
      if (btnCopyImg) btnCopyImg.addEventListener("click", copyPlannerChainImageToClipboard);
      const btnDownloadImg = document.getElementById("planner-btn-download-img");
      if (btnDownloadImg) btnDownloadImg.addEventListener("click", downloadPlannerChainImage);

      // 초기 배지 갱신
      updateSavedChainsBadge();
    }

    window.addEventListener("load", () => {
      if (window.innerWidth <= 768) {
        isViewerMode = true;
      }
      applyViewerModeUI();
      autoSyncAllSameNameDigimons();
      recalculateAllDigimonConditionStatuses();
      initOfficialDatalist();
      initTrainingCalc();
      initEvolutionPlanner();
      initReportsSystem();
      updateClientUidDisplays();
      getClientMaskedIp().then(() => updateClientUidDisplays());
      updateLineStyleButton();
      if (!filterDim || (project.dims && !project.dims.includes(filterDim))) {
        filterDim = (project.dims && project.dims.includes("아구몬 EX")) ? "아구몬 EX" : ((project.dims && project.dims[0]) || "아구몬 EX");
      }
      updateDimFilterOptions();
      renderTree();
      updateSidebar();
      setTimeout(() => {
        fitEditorView();
        drawConnections();
      }, 100);
      fetchAndApplyLiveConditions();
      fetchWikiHistoryFromGas(true);
    });
