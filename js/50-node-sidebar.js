/* 노드 클릭/연결 모드, 연결선 색상, 우측 패널(사이드바) */
    // -------------------------------------------------------------------------
    // 3. 노드 클릭 & 연결 모드 처리
    // -------------------------------------------------------------------------
    let selectedDimContext = null;

    function handleNodeClick(id, dimContext = null) {
      if (dimContext) {
        selectedDimContext = dimContext;
      } else {
        selectedDimContext = filterDim;
      }

      if (connectMode) {
        if (!connectFromId) {
          connectFromId = id;
          showToast(`[출발] <strong>${project.digimons[id].name}</strong> 선택됨 ➔ 다음 진화체를 클릭하세요 (ESC: 취소)`);
          renderTree();
        } else {
          if (connectFromId === id) {
            connectFromId = null;
            showToast("선택이 취소되었습니다. 다시 출발 디지몬을 클릭하세요.", "warn");
            renderTree();
          } else {
            const exists = project.evolutions.some(e => e.from === connectFromId && e.to === id);
            if (!exists) {
              const srcDigi = project.digimons[connectFromId];
              const tgtDigi = project.digimons[id];
              if (srcDigi && tgtDigi && srcDigi.dim && tgtDigi.dim && srcDigi.dim.trim().toLowerCase() !== tgtDigi.dim.trim().toLowerCase()) {
                showToast(`서로 다른 DiM 간에는 진화선을 연결할 수 없습니다! ([${srcDigi.dim}] ➔ [${tgtDigi.dim}])`, "warn");
                connectFromId = null;
                renderTree();
                return;
              }
              const stageDefault = getDefaultReqForStage(tgtDigi?.stage);
              project.evolutions.push({
                from: connectFromId,
                to: id,
                lineColor: srcDigi?.lineColor || undefined,
                ...stageDefault
              });
              saveState();
              showToast(`<strong>${project.digimons[connectFromId].name}</strong> ➔ <strong>${project.digimons[id].name}</strong> 연결 완료!`);
            } else {
              showToast(`이미 연결되어 있는 루트입니다.`, "warn");
            }
            renderTree();
            updateSidebar();
          }
        }
        return;
      }

      selectedDigiId = id;
      renderTree();
      updateSidebar();
      if (window.innerWidth <= 768) {
        openMobileBottomSheet();
      }
    }

    // -------------------------------------------------------------------------
    // 4. 진화 연결선 색상 프리셋 관리 & 우측 패널 동기화
    // -------------------------------------------------------------------------
    function renderLineColorPresets() {
      const digi = project.digimons[selectedDigiId];
      if (!digi) return;

      const container = document.getElementById("preset-color-container");
      if (!container) return;
      container.innerHTML = "";

      const currentColor = digi.lineColor || null;
      const dotEl = document.getElementById("current-line-color-dot");
      const nameEl = document.getElementById("current-line-color-name");

      let activePreset = LINE_COLOR_PRESETS.find(p => p.color === currentColor);
      if (currentColor) {
        if (activePreset) {
          nameEl.textContent = activePreset.name;
          dotEl.style.background = activePreset.dotBg;
        } else {
          nameEl.textContent = `직접 지정 (${currentColor})`;
          dotEl.style.background = currentColor;
        }
      } else {
        nameEl.textContent = "기본 (속성색)";
        const defaultAttrColor = attrColors[digi.attr] || "#8E9297";
        dotEl.style.background = defaultAttrColor;
      }

      // 1. 프리셋 색상 버튼들
      LINE_COLOR_PRESETS.forEach(preset => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "color-chip";
        const isActive = (preset.color === currentColor) || (!currentColor && preset.id === "default");
        if (isActive) btn.classList.add("active");

        btn.innerHTML = `<span class="color-chip-dot" style="background:${preset.dotBg};"></span><span>${preset.name}</span>`;

        btn.addEventListener("click", () => {
          if (preset.id === "default") {
            delete digi.lineColor;
            project.evolutions.filter(e => e.from === selectedDigiId).forEach(e => delete e.lineColor);
            showToast(`[${digi.name}]의 진화선 색상이 [기본(속성색)]으로 초기화되었습니다.`);
          } else {
            digi.lineColor = preset.color;
            project.evolutions.filter(e => e.from === selectedDigiId).forEach(e => e.lineColor = preset.color);
            showToast(`[${digi.name}]의 모든 진화선 색상이 [${preset.name}]으로 변경되었습니다.`);
          }

          saveState();
          drawConnections();
          renderLineColorPresets();
          updateOutgoingBranchesList();
        });

        container.appendChild(btn);
      });

      // 2. 직접 선택 (Color Picker) 칩
      const pickerLabel = document.createElement("label");
      pickerLabel.className = "color-picker-chip";
      const isCustomActive = currentColor && !LINE_COLOR_PRESETS.some(p => p.color === currentColor);
      if (isCustomActive) pickerLabel.style.borderColor = "#FFFFFF";

      pickerLabel.innerHTML = `
        <span class="color-chip-dot" style="background:${currentColor || '#38BDF8'};"></span>
        <span>직접 선택</span>
        <input type="color" value="${currentColor || '#38BDF8'}" title="원하는 색상을 직접 선택하세요">
      `;

      pickerLabel.querySelector('input[type="color"]').addEventListener("input", (e) => {
        const customColor = e.target.value;
        digi.lineColor = customColor;
        project.evolutions.filter(ev => ev.from === selectedDigiId).forEach(ev => ev.lineColor = customColor);
        saveState();
        drawConnections();
        renderLineColorPresets();
        updateOutgoingBranchesList();
      });

      container.appendChild(pickerLabel);
    }

    function generateTimeOptionsHtml(currentTime) {
      const times = ["1시간", "24시간", "36시간", "48시간", "-", "12시간", "즉시", "1분", "10분"];
      let html = "";
      let found = false;
      times.forEach(t => {
        const isSel = (t === currentTime);
        if (isSel) found = true;
        html += `<option value="${t}" ${isSel ? "selected" : ""}>${t}</option>`;
      });
      if (currentTime && !found) {
        html = `<option value="${currentTime}" selected>${currentTime}</option>` + html;
      }
      return html;
    }

    // 진화 루트별 조건 선택 탭 렌더링 (에디터 & 뷰어 공용)
    function renderRouteTabs(digi) {
      const container = document.getElementById("req-route-tabs-container");
      const listEl = document.getElementById("req-route-tabs-list");
      const countBadge = document.getElementById("req-route-count-badge");
      if (!container || !listEl) return;

      if (!digi || digi.stage === "디지타마") {
        container.style.display = "none";
        return;
      }

      // 현재 DiM 컨텍스트 또는 전체에서 들어오는 진화선 조회
      const incoming = getIncomingEvolutionsForDigi(digi.id);

      if (incoming.length <= 1) {
        container.style.display = "none";
        if (incoming.length === 1) {
          activeIncomingFromId = incoming[0].from;
        } else {
          activeIncomingFromId = null;
        }
        return;
      }

      // 2개 이상의 진화 루트가 존재하는 경우 탭 노출
      container.style.display = "block";
      if (countBadge) {
        countBadge.textContent = `(${incoming.length}개 루트)`;
      }

      // activeIncomingFromId가 현재 유효한 진화선에 속해있는지 확인
      if (!activeIncomingFromId || !incoming.some(e => e.from === activeIncomingFromId)) {
        activeIncomingFromId = incoming[0].from;
      }

      listEl.innerHTML = "";
      incoming.forEach(evo => {
        const fromD = project.digimons[evo.from] || { name: evo.from, stage: "-" };
        const tab = document.createElement("button");
        tab.type = "button";
        const isActive = (evo.from === activeIncomingFromId);
        const isRevealed = isEvoRevealed(evo, digi.stage);
        tab.className = `route-tab-chip ${isActive ? "active" : ""}`;
        tab.innerHTML = `
          ${fromD.img ? `<img src="${encodeURI(fromD.img)}" alt="${escapeHtml(fromD.name)}" onerror="this.style.display='none'">` : ``}
          <span style="font-weight:600;">${escapeHtml(fromD.name)}</span>
          <span style="color:#8E9297; font-size:0.7rem;">➔</span>
          <span style="color:#FFF; font-weight:700;">${escapeHtml(digi.name)}</span>
          ${isRevealed ? `<span style="font-size:0.68rem; color:#57F287; margin-left:3px; font-weight:bold;" title="조건 확인됨">✓</span>` : `<span style="font-size:0.68rem; color:#FCA5A5; margin-left:3px; font-weight:bold;" title="조건 불명">❓</span>`}
        `;

        tab.addEventListener("click", () => {
          activeIncomingFromId = evo.from;
          renderRouteTabs(digi);
          if (isViewerMode) {
            renderViewerSidebar(digi);
          } else {
            updateSidebarReqInputs(digi);
            updateIncomingBranchesHighlight();
          }
        });

        listEl.appendChild(tab);
      });
    }

    // 에디터 모드: 현재 선택된 진화 루트의 조건을 폼 입력 필드에 채우기
    function updateSidebarReqInputs(digi) {
      if (!digi) return;
      const isBabyStage = ["유년기 I", "유년기 II"].includes(digi.stage);
      const activeEvo = getActiveIncomingEvo(digi.id, activeIncomingFromId);
      const curReq = getEvoRequirements(activeEvo, digi);

      const reqTimeEl = document.getElementById("req-time");
      if (reqTimeEl) {
        reqTimeEl.value = curReq.time || getDefaultReqForStage(digi.stage).time || "";
        reqTimeEl.disabled = false;
      }

      const elVital = document.getElementById("req-vital");
      if (elVital) {
        elVital.value = "";
        elVital.readOnly = isBabyStage;
        elVital.style.opacity = isBabyStage ? "0.35" : "1";
        elVital.placeholder = isBabyStage ? "-" : "";
        if (!isBabyStage) elVital.value = (curReq.vital !== undefined && curReq.vital !== null && curReq.vital !== "") ? curReq.vital : "";
      }

      const elPp = document.getElementById("req-pp");
      if (elPp) {
        elPp.value = "";
        elPp.readOnly = isBabyStage;
        elPp.style.opacity = isBabyStage ? "0.35" : "1";
        elPp.placeholder = isBabyStage ? "-" : "";
        if (!isBabyStage) elPp.value = (curReq.pp !== undefined && curReq.pp !== null && curReq.pp !== "") ? curReq.pp : "";
      }

      const elBattle = document.getElementById("req-battle");
      if (elBattle) {
        elBattle.value = "";
        elBattle.readOnly = isBabyStage;
        elBattle.style.opacity = isBabyStage ? "0.35" : "1";
        elBattle.placeholder = isBabyStage ? "-" : "";
        if (!isBabyStage) elBattle.value = (curReq.battle !== undefined && curReq.battle !== null) ? curReq.battle : "";
      }

      const elWinRate = document.getElementById("req-winrate");
      if (elWinRate) {
        elWinRate.value = "";
        elWinRate.readOnly = isBabyStage;
        elWinRate.style.opacity = isBabyStage ? "0.35" : "1";
        elWinRate.placeholder = isBabyStage ? "-" : "";
        if (!isBabyStage) elWinRate.value = (curReq.winRate !== undefined && curReq.winRate !== null) ? curReq.winRate : "";
      }

      const elDungeon = document.getElementById("req-dungeon");
      if (elDungeon) {
        const rawDungeon = isBabyStage ? "" : normalizeDungeonValue(curReq.dungeon);
        const dungeonVal = (!rawDungeon || rawDungeon === "-" || rawDungeon === "없음") ? "" : String(rawDungeon);
        // 별점 형식이 아닌 예전 값(예: "70")은 지우지 않고 그대로 보이도록 임시 항목으로 추가
        elDungeon.querySelectorAll("option[data-legacy]").forEach(o => o.remove());
        if (dungeonVal && !Array.from(elDungeon.options).some(o => o.value === dungeonVal)) {
          const legacyOpt = document.createElement("option");
          legacyOpt.value = dungeonVal;
          legacyOpt.textContent = `${dungeonVal} (예전 값)`;
          legacyOpt.dataset.legacy = "1";
          elDungeon.appendChild(legacyOpt);
        }
        elDungeon.value = dungeonVal;
        elDungeon.disabled = isBabyStage;
        elDungeon.style.opacity = isBabyStage ? "0.35" : "1";
      }

      const elJogress = document.getElementById("req-jogress");
      const jogressPreviewEl = document.getElementById("jogress-partner-preview");
      if (elJogress) {
        if (isBabyStage) {
          elJogress.value = "-";
          elJogress.readOnly = true;
          elJogress.style.opacity = "0.35";
          if (jogressPreviewEl) jogressPreviewEl.innerHTML = "";
        } else {
          elJogress.readOnly = false;
          elJogress.style.opacity = "1";
          const evoJogress = activeEvo ? getEvolutionJogressPartner(activeEvo) : "";
          const rawVal = (curReq.jogress && curReq.jogress !== "-" && curReq.jogress !== "없음")
            ? curReq.jogress
            : (evoJogress && evoJogress !== "-" ? evoJogress : "");
          elJogress.value = rawVal;
          elJogress.placeholder = "-";
          if (jogressPreviewEl) {
            renderJogressPreviewChips(jogressPreviewEl, rawVal);
          }
        }
      }

      const elItem = document.getElementById("req-item");
      if (elItem) {
        elItem.value = isBabyStage ? "-" : (curReq.item && curReq.item !== "-" ? curReq.item : "");
        elItem.placeholder = "-";
        elItem.readOnly = isBabyStage;
        elItem.style.opacity = isBabyStage ? "0.35" : "1";
      }

      const elNote = document.getElementById("req-note");
      if (elNote) elNote.value = curReq.note || "";

      const elIdle = document.getElementById("req-is-idle");
      if (elIdle) {
        const isIdleCond = Boolean(curReq.isIdle || (curReq.note && (curReq.note.includes("방치") || curReq.note.includes("조건 없음") || curReq.note.includes("조건없음") || curReq.note.includes("시간 경과"))));
        elIdle.checked = isIdleCond;
        elIdle.disabled = isBabyStage;
      }
    }

