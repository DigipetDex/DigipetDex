/* 조건 클립보드 및 조건 입력 핸들러 */
    // -------------------------------------------------------------------------
    // 조건 클립보드 (복사 & 붙여넣기) 기능
    // -------------------------------------------------------------------------
    let copiedConditionBuffer = null;
    try {
      const savedClip = localStorage.getItem("digipet_copied_req");
      if (savedClip) copiedConditionBuffer = JSON.parse(savedClip);
    } catch (e) {}

    function updateClipIndicator() {
      const indicator = document.getElementById("copied-req-indicator");
      const pasteBtn = document.getElementById("btn-paste-req");
      if (!indicator || !pasteBtn) return;
      if (copiedConditionBuffer) {
        indicator.style.display = "inline-block";
        indicator.textContent = `복사됨: ${copiedConditionBuffer._sourceName || "조건"}`;
        indicator.title = `[${copiedConditionBuffer._sourceName || "복사된 디지몬"}] 시간: ${copiedConditionBuffer.time || "-"}, 바이탈: ${copiedConditionBuffer.vital ?? "-"}, PP: ${copiedConditionBuffer.pp ?? "-"}`;
        pasteBtn.classList.add("btn-paste-active");
      } else {
        indicator.style.display = "none";
        pasteBtn.classList.remove("btn-paste-active");
      }
    }

    // 현재 선택된 디지몬(또는 루트)의 달성 조건 복사
    function copyCurrentRequirement() {
      const digi = project.digimons[selectedDigiId];
      if (!digi) return;

      const activeEvo = getActiveIncomingEvo(selectedDigiId, activeIncomingFromId);
      const curReq = getEvoRequirements(activeEvo, digi);

      copiedConditionBuffer = {
        ...curReq,
        _sourceName: digi.name
      };

      try {
        localStorage.setItem("digipet_copied_req", JSON.stringify(copiedConditionBuffer));
      } catch (e) {}

      updateClipIndicator();
      showToast(`[${digi.name}]의 달성 조건이 클립보드에 복사되었습니다!<br>다른 디지몬이나 루트 선택 후 [📥 붙여넣기]를 누르세요.`, "success");
    }

    // 클립보드에 복사된 달성 조건을 현재 디지몬(또는 루트)에 붙여넣기
    function pasteCurrentRequirement() {
      const digi = project.digimons[selectedDigiId];
      if (!digi) return;

      if (!copiedConditionBuffer) {
        showToast("클립보드에 복사된 조건이 없습니다. 먼저 [📋 복사]를 눌러주세요.", "warn");
        return;
      }

      const fields = ["time", "vital", "pp", "battle", "winRate", "dungeon", "jogress", "item", "note"];

      // 1. 현재 활성 루트(activeIncomingEvo)에 붙여넣기
      const activeEvo = getActiveIncomingEvo(selectedDigiId, activeIncomingFromId);
      if (activeEvo) {
        fields.forEach(f => {
          if (copiedConditionBuffer[f] !== undefined) {
            activeEvo[f] = copiedConditionBuffer[f];
          }
        });
      }

      // 2. 들어오는 진화선이 1개 이하인 경우에만 digi.req 및 진화선 동기화
      const incoming = project.evolutions.filter(ev => ev.to === selectedDigiId);
      if (incoming.length <= 1) {
        if (!digi.req) digi.req = {};
        fields.forEach(f => {
          if (copiedConditionBuffer[f] !== undefined) {
            digi.req[f] = copiedConditionBuffer[f];
          }
        });
        incoming.forEach(ev => {
          fields.forEach(f => {
            if (copiedConditionBuffer[f] !== undefined) {
              ev[f] = copiedConditionBuffer[f];
            }
          });
        });
      }

      drawConnections();

      saveState();
      syncSameNameDigimons(digi);
      updateSidebarReqInputs(digi);
      if (isViewerMode) renderViewerSidebar(digi);

      showToast(`'${copiedConditionBuffer._sourceName || "복사된"}' 달성 조건이 [${digi.name}]에 붙여넣기 되었습니다!`, "success");
    }

    // 현재 선택된 루트의 조건을 모든 진화선에 동일하게 복사 적용
    function copyCurrentReqToAllRoutes() {
      const digi = project.digimons[selectedDigiId];
      if (!digi) return;
      const activeEvo = getActiveIncomingEvo(selectedDigiId, activeIncomingFromId);
      if (!activeEvo) return;

      const incoming = project.evolutions.filter(e => e.to === selectedDigiId);
      if (incoming.length <= 1) {
        showToast("복사할 다른 진화 루트가 없습니다.", "warn");
        return;
      }

      const fields = ["time", "vital", "pp", "battle", "winRate", "dungeon", "jogress", "item", "note"];
      incoming.forEach(ev => {
        fields.forEach(f => {
          if (activeEvo[f] !== undefined) {
            ev[f] = activeEvo[f];
          }
        });
      });

      saveState();
      updateDigimonConditionStatus(digi);
      renderTree();
      updateSidebar();
      showToast(`현재 루트의 달성 조건이 모든 진화선(${incoming.length}개)에 복사되었습니다! (전체 공개 완료)`, "success");
    }

    function updateIncomingBranchesHighlight() {
      const inContainer = document.getElementById("incoming-branches-list");
      if (!inContainer) return;
      inContainer.querySelectorAll(".conn-item").forEach(item => {
        const fromId = item.dataset.from;
        if (fromId === activeIncomingFromId) {
          item.style.borderColor = "var(--primary)";
          item.style.background = "rgba(88, 101, 242, 0.15)";
          const badge = item.querySelector(".conn-item-badge");
          if (badge && !badge.textContent.includes("선택됨")) {
            badge.textContent += " • 선택됨";
          }
        } else {
          item.style.borderColor = "var(--border-color)";
          item.style.background = "#23272A";
          const badge = item.querySelector(".conn-item-badge");
          if (badge) {
            badge.textContent = badge.textContent.replace(" • 선택됨", "");
          }
        }
      });
    }

    function updateSidebar() {
      const digi = project.digimons[selectedDigiId];
      if (!digi) {
        if (window.innerWidth <= 768) {
          closeMobileBottomSheet();
        }
        renderViewerSidebar(null);
        const nameInput = document.getElementById("edit-name");
        if (nameInput) nameInput.value = "";
        const imgInput = document.getElementById("edit-img");
        if (imgInput) imgInput.value = "";
        const inpHp = document.getElementById("edit-base-hp");
        if (inpHp) inpHp.value = "";
        const inpAp = document.getElementById("edit-base-ap");
        if (inpAp) inpAp.value = "";
        const inpSpd = document.getElementById("edit-base-spd");
        if (inpSpd) inpSpd.value = "";
        const previewImg = document.getElementById("dropzone-preview");
        if (previewImg) previewImg.style.display = "none";
        const dropzonePrompt = document.getElementById("dropzone-prompt");
        if (dropzonePrompt) dropzonePrompt.style.display = "block";
        const reqNameEl = document.getElementById("req-digi-name");
        if (reqNameEl) reqNameEl.textContent = "선택 없음";
        const inContainer = document.getElementById("incoming-branches-list");
        if (inContainer) inContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-sub); padding:4px 0;">디지몬을 클릭하면 이전 진화 연결이 표시됩니다.</div>`;
        const outContainer = document.getElementById("outgoing-branches-list");
        if (outContainer) outContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-sub); padding:4px 0;">디지몬을 클릭하면 다음 진화 연결이 표시됩니다.</div>`;
        return;
      }

      document.getElementById("edit-name").value = digi.name;
      document.getElementById("edit-stage").value = digi.stage;
      document.getElementById("edit-attr").value = digi.attr;
      document.getElementById("edit-img").value = digi.img;
      const inpHp = document.getElementById("edit-base-hp");
      if (inpHp) inpHp.value = (digi.baseHp !== undefined && digi.baseHp !== null) ? digi.baseHp : "";
      const inpAp = document.getElementById("edit-base-ap");
      if (inpAp) inpAp.value = (digi.baseAp !== undefined && digi.baseAp !== null) ? digi.baseAp : "";
      const inpSpd = document.getElementById("edit-base-spd");
      if (inpSpd) inpSpd.value = (digi.baseSpd !== undefined && digi.baseSpd !== null) ? digi.baseSpd : "";
      // 진화 조건 공개 상태 버튼 갱신: 수동 지정(conditionStatus)이 있으면 그 버튼, 없으면 [자동 판정]
      const curStatus = ["known", "partial", "unknown"].includes(digi.conditionStatus) ? digi.conditionStatus : "auto";
      const autoResultEl = document.getElementById("condition-status-auto-result");
      if (autoResultEl) {
        const autoLabel = digi.partialUnknown ? "일부 불명" : (digi.unknownTime ? "전체 불명" : "공개");
        autoResultEl.textContent = curStatus === "auto" ? ` · 지금: ${autoLabel}` : " (수동 지정 해제)";
      }
      document.querySelectorAll("#condition-status-selector .status-btn-opt").forEach(btn => {
        const val = btn.dataset.status;
        const input = btn.querySelector("input");
        if (input) input.checked = (val === curStatus);
        btn.classList.toggle("active", val === curStatus);
      });

      // 드롭존 미리보기 갱신
      const previewImg = document.getElementById("dropzone-preview");
      const dropzonePrompt = document.getElementById("dropzone-prompt");
      if (digi.img) {
        previewImg.src = digi.img;
        previewImg.style.display = "block";
        dropzonePrompt.style.display = "none";
      } else {
        previewImg.style.display = "none";
        dropzonePrompt.style.display = "block";
      }

      // [섹션 2] 이 디지몬이 되기 위한 진화 조건 (B가 되기 위한 조건) 갱신
      const reqNameEl = document.getElementById("req-digi-name");
      if (reqNameEl) reqNameEl.textContent = digi.name;
      const elIndepReq = document.getElementById("edit-independent-req");
      if (elIndepReq) elIndepReq.checked = (digi.independentReq !== false);

      // 조건 클립보드 표시 갱신
      updateClipIndicator();

      const isEgg = (digi.stage === "디지타마");
      const reqContainer = document.getElementById("req-condition-container");
      const eggNotice = document.getElementById("req-egg-notice");

      if (isEgg) {
        if (reqContainer) reqContainer.style.display = "none";
        if (eggNotice) eggNotice.style.display = "block";
        const routeContainer = document.getElementById("req-route-tabs-container");
        if (routeContainer) routeContainer.style.display = "none";
      } else {
        if (reqContainer) reqContainer.style.display = "block";
        if (eggNotice) eggNotice.style.display = "none";

        if (!digi.req) {
          digi.req = getDefaultReqForStage(digi.stage);
        }

        // 진화 루트별 선택 탭 및 조건 입력 필드 갱신
        renderRouteTabs(digi);
        updateSidebarReqInputs(digi);
      }

      // [섹션 3] 진화선 색상 프리셋 갱신
      renderLineColorPresets();

      // [섹션 3] 이전 단계에서 진화해오는 연결 (Incoming: ? -> B)
      const inContainer = document.getElementById("incoming-branches-list");
      if (inContainer) {
        inContainer.innerHTML = "";
        const incoming = project.evolutions.filter(e => e.to === selectedDigiId);
        if (incoming.length === 0) {
          inContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-sub); padding:4px 0;">이전 단계에서 진화해오는 연결이 없습니다.</div>`;
        } else {
          incoming.forEach(evo => {
            const fromD = project.digimons[evo.from] || { name: evo.from, stage: "-" };
            const item = document.createElement("div");
            item.className = "conn-item";
            item.dataset.from = evo.from;
            const isCurrentActive = (evo.from === activeIncomingFromId);
            if (isCurrentActive) {
              item.style.borderColor = "var(--primary)";
              item.style.background = "rgba(88, 101, 242, 0.15)";
            }
            const currentEvoColor = evo.lineColor || fromD?.lineColor || (fromD ? attrColors[fromD.attr] : "#888") || "#8E9297";
            item.innerHTML = `
              <div class="conn-item-info" title="클릭하여 [${fromD.name} ➔ ${digi.name}] 루트 조건 선택">
                <span class="color-chip-dot" style="background:${currentEvoColor}; width:12px; height:12px; margin-right:6px;" title="이 분기선의 색상"></span>
                ${fromD.img ? `<img src="${encodeURI(fromD.img)}" class="conn-item-img" onerror="this.style.display='none'">` : ``}
                <div>
                  <div style="font-weight:700; color:#fff;">${fromD.name} ➔ ${digi.name}</div>
                  <div class="conn-item-badge">${fromD.stage || "-"} ${isCurrentActive ? "• 선택됨" : ""}</div>
                </div>
              </div>
              <div class="editor-only" style="display:flex; align-items:center; gap:6px;">
                <label class="color-picker-chip" style="padding:2px 7px; font-size:0.72rem;" title="이 분기선만 단독으로 색상 변경">
                  <span>선 색</span>
                  <input type="color" value="${evo.lineColor || fromD?.lineColor || '#EF4444'}" class="evo-branch-color-input">
                </label>
                <button class="btn-danger-sm btn-del-connection" data-from="${evo.from}" data-to="${evo.to}">해제</button>
              </div>
            `;
            item.querySelector(".conn-item-info").addEventListener("click", () => {
              activeIncomingFromId = evo.from;
              renderRouteTabs(digi);
              updateSidebarReqInputs(digi);
              updateIncomingBranchesHighlight();
            });

            const colorInput = item.querySelector(".evo-branch-color-input");
            if (colorInput) {
              colorInput.addEventListener("input", (e) => {
                const color = e.target.value;
                evo.lineColor = color;
                saveState();
                drawConnections();
                updateSidebar();
                showToast(`[${fromD?.name} ➔ ${digi.name}] 분기선의 색상이 변경되었습니다.`);
              });
            }

            const delBtn = item.querySelector(".btn-del-connection");
            if (delBtn) {
              delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                project.evolutions = project.evolutions.filter(ev => !(ev.from === evo.from && ev.to === evo.to));
                if (activeIncomingFromId === evo.from) {
                  activeIncomingFromId = null;
                }
                saveState();
                renderTree();
                updateSidebar();
              });
            }
            inContainer.appendChild(item);
          });
        }
      }

      // [섹션 3] 다음 단계로 진화하는 연결 (Outgoing: B -> ?)
      updateOutgoingBranchesList();

      updateDigiRefBadge(digi);

      // 뷰어 모드 전용 사이드바 프로필 및 스펙 렌더링
      renderViewerSidebar(digi);
    }

    // 다음 단계 진화 분기 목록 및 개별 선 색상 컨트롤 렌더링
    function updateOutgoingBranchesList() {
      const outContainer = document.getElementById("outgoing-branches-list");
      if (!outContainer) return;
      outContainer.innerHTML = "";
      const outgoing = project.evolutions.filter(e => e.from === selectedDigiId);
      const fromDigi = project.digimons[selectedDigiId];
      if (outgoing.length === 0) {
        outContainer.innerHTML = isViewerMode
          ? `<div style="font-size:0.75rem; color:var(--text-sub); padding:4px 0;">다음 단계로 진화하는 연결이 없습니다.</div>`
          : `<div style="font-size:0.75rem; color:var(--text-sub); padding:4px 0;">다음 단계로 진화하는 연결이 없습니다. 상단의 [다음 진화 추가]를 눌러 연결할 수 있습니다.</div>`;
        return;
      }

      outgoing.forEach(evo => {
        const toD = project.digimons[evo.to] || { name: evo.to, stage: "-" };
        const item = document.createElement("div");
        item.className = "conn-item";
        const currentEvoColor = evo.lineColor || fromDigi?.lineColor || (fromDigi ? attrColors[fromDigi.attr] : "#888") || "#8E9297";
        item.innerHTML = `
          <div class="conn-item-info" title="클릭하여 [${toD.name}] 디지몬으로 이동">
            <span class="color-chip-dot" style="background:${currentEvoColor}; width:12px; height:12px; margin-right:6px;" title="현재 이 분기선의 색상"></span>
            ${toD.img ? `<img src="${toD.img}" class="conn-item-img">` : ``}
            <div>
              <div style="font-weight:700; color:#fff;">${toD.name}</div>
              <div class="conn-item-badge">${toD.stage || "-"}</div>
            </div>
          </div>
          <div class="editor-only" style="display:flex; align-items:center; gap:6px;">
            <label class="color-picker-chip" style="padding:2px 7px; font-size:0.72rem;" title="이 분기선만 단독으로 색상 변경">
              <span>선 색</span>
              <input type="color" value="${evo.lineColor || fromDigi?.lineColor || '#EF4444'}" class="evo-branch-color-input">
            </label>
            <button class="btn-danger-sm btn-del-connection" data-from="${evo.from}" data-to="${evo.to}">해제</button>
          </div>
        `;

        const infoEl = item.querySelector(".conn-item-info");
        infoEl.addEventListener("click", () => {
          selectedDigiId = evo.to;
          renderTree();
          updateSidebar();
        });
        infoEl.addEventListener("mouseenter", () => {
          document.querySelectorAll(`.card-node[data-id="${evo.to}"]`).forEach(n => n.classList.add("highlight-flash"));
          document.querySelectorAll(`path.branch-path[data-from="${evo.from}"][data-to="${evo.to}"]`).forEach(p => {
            p.style.strokeWidth = "8px";
            p.style.filter = "drop-shadow(0 0 14px #FFF)";
          });
        });
        infoEl.addEventListener("mouseleave", () => {
          document.querySelectorAll(`.card-node[data-id="${evo.to}"]`).forEach(n => n.classList.remove("highlight-flash"));
          document.querySelectorAll(`path.branch-path[data-from="${evo.from}"][data-to="${evo.to}"]`).forEach(p => {
            p.style.strokeWidth = "";
            p.style.filter = "";
          });
        });

        const colorInput = item.querySelector(".evo-branch-color-input");
        if (colorInput) {
          colorInput.addEventListener("input", (e) => {
            const color = e.target.value;
            evo.lineColor = color;
            saveState();
            drawConnections();
            updateOutgoingBranchesList();
            showToast(`[${fromDigi?.name} ➔ ${toD.name}] 분기선의 색상이 변경되었습니다.`);
          });
        }

        const delBtn = item.querySelector(".btn-del-connection");
        if (delBtn) {
          delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            project.evolutions = project.evolutions.filter(ev => !(ev.from === evo.from && ev.to === evo.to));
            saveState();
            renderTree();
            updateSidebar();
          });
        }

        outContainer.appendChild(item);
      });
    }

    // 뷰어 모드 전용 사이드바 렌더링 함수
    function renderViewerSidebar(digi) {
      const profileCard = document.getElementById("viewer-profile-card");
      const condCard = document.getElementById("viewer-condition-card");
      if (!profileCard || !condCard) return;

      if (!digi) {
        profileCard.innerHTML = `<div style="font-size:0.8rem; color:var(--text-sub); text-align:center; padding:16px;">선택된 디지몬이 없습니다.</div>`;
        condCard.innerHTML = "";
        return;
      }

      const attrKoMap = { vaccine: "백신 (Vaccine)", data: "데이터 (Data)", virus: "바이러스 (Virus)", free: "프리 (Free)", none: "-", unknown: "불명" };
      const attrKo = attrKoMap[digi.attr] || digi.attr || "-";

      // 공식 도감 링크
      const official = lookupOfficialDigimon(digi.name);
      const officialLink = (official && official.dir)
        ? `<a href="https://digimon.net/reference_ko/detail.php?directory_name=${official.dir}" target="_blank" rel="noopener" style="color:#5865F2; font-size:0.75rem; text-decoration:underline; font-weight:600;">공식 도감 보기 ↗</a>`
        : "";

      const hpDisplay = (digi.baseHp !== undefined && digi.baseHp !== "" && digi.baseHp !== null) ? digi.baseHp : "-";
      const apDisplay = (digi.baseAp !== undefined && digi.baseAp !== "" && digi.baseAp !== null) ? digi.baseAp : "-";
      const spdDisplay = (digi.baseSpd !== undefined && digi.baseSpd !== "" && digi.baseSpd !== null) ? digi.baseSpd : "-";

      profileCard.innerHTML = `
        <div class="viewer-hero-card">
          <div class="viewer-hero-img-wrap attr-${digi.attr}">
            <img class="viewer-hero-img" src="${encodeURI(digi.img || '')}" alt="${escapeHtml(digi.name)}" onerror="handleDigiImgError(this, '${escapeHtml(digi.name)}', '${escapeHtml(digi.img || '')}', '${digi.id}')">
          </div>
          <div class="viewer-hero-name">${escapeHtml(digi.name)}</div>
          <div class="viewer-hero-badges">
            <span class="viewer-pill" style="background:rgba(255,255,255,0.1);">${escapeHtml(digi.stage || '-')}</span>
            <span class="viewer-pill" style="background:${attrColors[digi.attr] || '#888'};">${escapeHtml(attrKo)}</span>
            ${digi.dim ? `<span class="viewer-pill" style="background:rgba(88,101,242,0.5);">${escapeHtml(digi.dim)}</span>` : ''}
          </div>
          <div class="viewer-base-stats-grid">
            <div class="viewer-stat-card">
              <span class="viewer-stat-label">체력</span>
              <span class="viewer-stat-val text-hp">${escapeHtml(String(hpDisplay))}</span>
            </div>
            <div class="viewer-stat-card">
              <span class="viewer-stat-label">전투력</span>
              <span class="viewer-stat-val text-ap">${escapeHtml(String(apDisplay))}</span>
            </div>
            <div class="viewer-stat-card">
              <span class="viewer-stat-label">속도</span>
              <span class="viewer-stat-val text-spd">${escapeHtml(String(spdDisplay))}</span>
            </div>
          </div>
          ${officialLink ? `<div style="margin-top:4px;">${officialLink}</div>` : ''}
          <button type="button" onclick="openEvolutionPlannerModal('${digi.id}')" style="width:100%; margin-top:8px; padding:6px 0; font-size:0.75rem; font-weight:700; background:rgba(88,101,242,0.2); border:1px solid #5865F2; color:#C4B5FD; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;" title="이 디지몬을 기준으로 진화 경로 검색 열기">
            <span>진화 경로 검색</span>
          </button>
        </div>
      `;

      if (digi.stage === "디지타마") {
        condCard.innerHTML = `
          <div style="font-size:0.8rem; color:var(--text-sub); background:#202225; padding:14px; border-radius:6px; border:1px dashed #4E5058; text-align:center;">
            디지타마(알)는 최초 세대이므로 진화 조건이 없습니다.
          </div>
        `;
        const routeContainer = document.getElementById("req-route-tabs-container");
        if (routeContainer) routeContainer.style.display = "none";
        return;
      }

      // 진화 루트 탭 갱신 (2개 이상 루트 존재 시 뷰어에서도 탭 버튼 표시)
      renderRouteTabs(digi);

      // 현재 선택된 특정 진화 루트의 조건 가져오기
      const activeEvo = getActiveIncomingEvo(digi.id, activeIncomingFromId);
      const req = getEvoRequirements(activeEvo, digi);
      const isBabyStage = ["유년기 I", "유년기 II"].includes(digi.stage);

      // 조그레스 파트너 목록
      const evoJogress = activeEvo ? getEvolutionJogressPartner(activeEvo) : "";
      const jogressVal = (req.jogress && req.jogress !== "-" && req.jogress !== "없음")
        ? req.jogress
        : (evoJogress || "-");
      const jogressNames = parseJogressNames(jogressVal);
      let jogressHtml = "-";
      if (jogressNames.length > 0) {
        jogressHtml = `<div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
          ${jogressNames.map(name => {
            const partner = findDigimonByNameOrId(name);
            if (partner) {
              return `<div class="jogress-sidebar-chip" style="margin-top:0; padding:3px 6px;" onclick="focusDigimonNode('${partner.id}')" title="클릭하여 [${escapeHtml(partner.name)}] 디지몬으로 이동">
                <img src="${encodeURI(partner.img || '')}" class="jogress-chip-img" style="width:20px; height:20px;">
                <span style="font-size:0.75rem; font-weight:700; color:#FFF;">${escapeHtml(partner.name)}</span>
              </div>`;
            }
            return `<span style="font-size:0.8rem; font-weight:700; color:#E74C3C;">${escapeHtml(name)}</span>`;
          }).join("")}
        </div>`;
      }

      // unknownTime 체크 시 뷰어에서 '진화조건 불명' 표시
      if (digi.unknownTime) {
        condCard.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:16px; background:#23272A; border:1px dashed #94A3B8; border-radius:8px; text-align:center;">
            <div style="display:flex; align-items:center; gap:6px; color:#94A3B8; font-size:0.9rem; font-weight:700;">
              <span>❓</span>
              <span>진화조건 불명 (제보바람)</span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
              <button type="button" class="btn-open-report-from-viewer" style="padding:6px 14px; background:#0284C7; color:#FFF; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(2,132,199,0.35);">
                <span>위키 편집</span>
              </button>
              <button type="button" class="btn-open-history-from-viewer" style="padding:6px 12px; background:#334155; color:#F1F5F9; border:1px solid #475569; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:5px;" title="이 디지몬의 변경 역사 확인">
                <span>역사</span>
              </button>
            </div>
          </div>
        `;
        const btn = condCard.querySelector(".btn-open-report-from-viewer");
        if (btn) {
          btn.addEventListener("click", () => openReportModalForDigi(digi));
        }
        const histBtn = condCard.querySelector(".btn-open-history-from-viewer");
        if (histBtn) {
          histBtn.addEventListener("click", () => openWikiHistoryModal(digi.name, digi.dim));
        }
        return;
      }

      // partialUnknown 체크 시 뷰어에서 일부 루트 불명 안내 배너 표시
      let partialNoticeHtml = "";
      if (digi.partialUnknown) {
        partialNoticeHtml = `
          <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; margin-bottom:12px; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.35); border-radius:8px; color:#7DD3FC; font-size:0.8rem; font-weight:600;">
            <span style="font-size:1.2rem; line-height:1;">🌓</span>
            <div>
              <div style="color:#FFF; font-weight:700;">일부 진화 루트 조건 불명</div>
              <div style="font-size:0.72rem; color:#94A3B8; font-weight:400; margin-top:2px;">일부 루트의 조건만 확인된 디지몬입니다. 상단 탭에서 각 루트별 조건을 확인할 수 있습니다.</div>
            </div>
          </div>
        `;

        const isCurRouteRevealed = isEvoRevealed(activeEvo, digi.stage);
        if (!isCurRouteRevealed) {
          const fromDigi = activeEvo ? project.digimons[activeEvo.from] : null;
          const fromName = fromDigi ? fromDigi.name : "이전 단계";
          condCard.innerHTML = partialNoticeHtml + `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:16px; background:#23272A; border:1px dashed #F87171; border-radius:8px; text-align:center;">
              <div style="display:flex; align-items:center; gap:6px; color:#FCA5A5; font-size:0.85rem; font-weight:700;">
                <span>❓</span>
                <span>[${escapeHtml(fromName)} ➔ ${escapeHtml(digi.name)}] 조건 불명</span>
              </div>
              <div style="font-size:0.75rem; color:#94A3B8;">이 진화 루트의 조건은 아직 밝혀지지 않았습니다.</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                <button type="button" class="btn-open-report-from-viewer" style="padding:6px 14px; background:#0284C7; color:#FFF; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(2,132,199,0.35);">
                  <span>위키 편집</span>
                </button>
                <button type="button" class="btn-open-history-from-viewer" style="padding:6px 12px; background:#334155; color:#F1F5F9; border:1px solid #475569; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:5px;" title="이 디지몬의 변경 역사 확인">
                  <span>역사</span>
                </button>
              </div>
            </div>
          `;
          const btn = condCard.querySelector(".btn-open-report-from-viewer");
          if (btn) {
            btn.addEventListener("click", () => openReportModalForDigi(digi));
          }
          const histBtn = condCard.querySelector(".btn-open-history-from-viewer");
          if (histBtn) {
            histBtn.addEventListener("click", () => openWikiHistoryModal(digi.name, digi.dim));
          }
          return;
        }
      }

      condCard.innerHTML = partialNoticeHtml + `
        <div class="viewer-spec-table">
          <div class="viewer-spec-cell">
            <div class="viewer-spec-label" style="display:flex; align-items:center; gap:4px;">
              <img src="진화시간.webp" alt="진화시간" style="width:14px; height:14px; object-fit:contain; image-rendering:pixelated;">
              <span>진화 시간</span>
            </div>
            <div class="viewer-spec-val">${escapeHtml(req.time || '-')}</div>
          </div>
          <div class="viewer-spec-cell">
            <div class="viewer-spec-label" style="display:flex; align-items:center; gap:4px;">
              <img src="바이탈.webp" alt="바이탈" style="width:14px; height:14px; object-fit:contain; image-rendering:pixelated;">
              <span>필요 바이탈</span>
            </div>
            <div class="viewer-spec-val" style="color:#57F287;">${isBabyStage ? '-' : (req.vital !== undefined && req.vital !== null && req.vital !== "" && req.vital !== 0 ? Number(req.vital).toLocaleString() : (req.vital === 0 ? '0' : '-'))}</div>
          </div>
          <div class="viewer-spec-cell">
            <div class="viewer-spec-label" style="display:flex; align-items:center; gap:4px;">
              <img src="PP.webp" alt="PP" style="width:14px; height:14px; object-fit:contain; image-rendering:pixelated;">
              <span>필요 PP</span>
            </div>
            <div class="viewer-spec-val" style="color:#FEE75C;">${isBabyStage ? '-' : (req.pp !== '' && req.pp !== undefined && req.pp !== null ? req.pp : '-')}</div>
          </div>
          <div class="viewer-spec-cell">
            <div class="viewer-spec-label" style="display:flex; align-items:center; gap:4px;">
              <img src="배틀.webp" alt="배틀" style="width:14px; height:14px; object-fit:contain; image-rendering:pixelated;">
              <span>배틀 횟수</span>
            </div>
            <div class="viewer-spec-val">${isBabyStage ? '-' : (req.battle || '-')}</div>
          </div>
          <div class="viewer-spec-cell">
            <div class="viewer-spec-label" style="display:flex; align-items:center; gap:4px;">
              <img src="승률.webp" alt="승률" style="width:14px; height:14px; object-fit:contain; image-rendering:pixelated;">
              <span>필요 승률</span>
            </div>
            <div class="viewer-spec-val">${isBabyStage ? '-' : (req.winRate ? req.winRate + (String(req.winRate).includes('%') ? '' : '%') : '-')}</div>
          </div>
          <div class="viewer-spec-cell">
            <div class="viewer-spec-label">던전 조건</div>
            <div class="viewer-spec-val">${isBabyStage ? '-' : (req.dungeon || '-')}</div>
          </div>
          <div class="viewer-spec-cell full-width">
            <div class="viewer-spec-label">조그레스 파트너</div>
            <div class="viewer-spec-val">${isBabyStage ? '-' : jogressHtml}</div>
          </div>
          <div class="viewer-spec-cell full-width">
            <div class="viewer-spec-label">필요 아이템 / 캡슐</div>
            <div class="viewer-spec-val">${isBabyStage ? '-' : (req.item || '-')}</div>
          </div>
          ${req.note ? `
          <div class="viewer-spec-cell full-width" style="background:#2A2B2F;">
            <div class="viewer-spec-label">비고 / 메모</div>
            <div class="viewer-spec-val" style="font-size:0.8rem; font-weight:normal; color:#DDD;">${escapeHtml(req.note)}</div>
          </div>` : ''}
        </div>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button type="button" class="btn-open-report-from-viewer" style="flex:1; padding:9px 12px; background:linear-gradient(135deg, #0284C7 0%, #4F46E5 100%); color:#FFF; border:none; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 8px rgba(79,70,229,0.35);">
            <span>위키 편집 / 조건 수정</span>
          </button>
          <button type="button" class="btn-open-history-from-viewer" style="padding:9px 14px; background:#334155; color:#F1F5F9; border:1px solid #475569; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;" title="이 디지몬의 변경 역사 확인">
            <span>역사</span>
          </button>
        </div>
      `;

      const reportBtn = condCard.querySelector(".btn-open-report-from-viewer");
      if (reportBtn) {
        reportBtn.addEventListener("click", () => openReportModalForDigi(digi));
      }
      const historyBtn = condCard.querySelector(".btn-open-history-from-viewer");
      if (historyBtn) {
        historyBtn.addEventListener("click", () => openWikiHistoryModal(digi.name, digi.dim));
      }
    }

    // 조건 입력(B가 되기 위한 조건) 변경 이벤트 리스너 바인딩
    function handleReqFieldChange(e) {
      const digi = project.digimons[selectedDigiId];
      if (!digi) return;
      if (!digi.req) {
        digi.req = getDefaultReqForStage(digi.stage);
      }

      const field = e.target.dataset.field;
      let val = e.target.value;
      let parsedVal = val;
      if (field === "vital" || field === "pp") {
        parsedVal = val === "" ? "" : Number(val);
      } else if (field === "winRate" || field === "battle") {
        parsedVal = val.trim();
      } else {
        parsedVal = val;
      }

      // 1. 현재 선택된 활성 진화선(activeIncomingEvo)에 개별 저장
      const activeEvo = getActiveIncomingEvo(selectedDigiId, activeIncomingFromId);
      if (activeEvo) {
        activeEvo[field] = parsedVal;
      }

      // 2. 디지몬 기본 조건(digi.req)도 함께 갱신하여 이전 기본값이 남아 되돌아가는 현상 방지
      if (digi.req) {
        digi.req[field] = parsedVal;
      }

      // 3. 들어오는 진화선이 1개 이하인 경우 진화선 전체 동기화
      const incoming = project.evolutions.filter(ev => ev.to === selectedDigiId);
      if (incoming.length <= 1) {
        incoming.forEach(ev => {
          ev[field] = parsedVal;
        });
      }

      drawConnections();
      if (field === "jogress") {
        const jogressPreviewEl = document.getElementById("jogress-partner-preview");
        if (jogressPreviewEl) {
          renderJogressPreviewChips(jogressPreviewEl, val);
        }
      }

      updateDigimonConditionStatus(digi);
      saveState();
      syncSameNameDigimons(digi);
      renderRouteTabs(digi);
    }

    document.querySelectorAll(".req-input").forEach(input => {
      input.addEventListener("input", handleReqFieldChange);
      input.addEventListener("change", handleReqFieldChange);
    });

    const elReqIdle = document.getElementById("req-is-idle");
    if (elReqIdle) {
      elReqIdle.addEventListener("change", (e) => {
        const digi = project.digimons[selectedDigiId];
        if (!digi) return;
        if (!digi.req) digi.req = getDefaultReqForStage(digi.stage);
        const isChecked = e.target.checked;
        const activeEvo = getActiveIncomingEvo(selectedDigiId, activeIncomingFromId);
        if (activeEvo) {
          activeEvo.isIdle = isChecked;
          if (isChecked && (!activeEvo.note || activeEvo.note.trim() === "")) {
            activeEvo.note = "방치 진화";
          } else if (!isChecked && activeEvo.note === "방치 진화") {
            activeEvo.note = "";
          }
        }
        if (digi.req) {
          digi.req.isIdle = isChecked;
          if (isChecked && (!digi.req.note || digi.req.note.trim() === "")) {
            digi.req.note = "방치 진화";
          } else if (!isChecked && digi.req.note === "방치 진화") {
            digi.req.note = "";
          }
        }
        const noteInput = document.getElementById("req-note");
        if (noteInput && activeEvo) noteInput.value = activeEvo.note || "";
        updateDigimonConditionStatus(digi);
        saveState();
        syncSameNameDigimons(digi);
        renderTree();
        drawConnections();
      });
    }

    const btnCopyRoutes = document.getElementById("btn-copy-req-to-all-routes");
    if (btnCopyRoutes) {
      btnCopyRoutes.addEventListener("click", copyCurrentReqToAllRoutes);
    }

    const btnCopyReq = document.getElementById("btn-copy-req");
    if (btnCopyReq) {
      btnCopyReq.addEventListener("click", copyCurrentRequirement);
    }

    const btnPasteReq = document.getElementById("btn-paste-req");
    if (btnPasteReq) {
      btnPasteReq.addEventListener("click", pasteCurrentRequirement);
    }

    // 조건 복사/붙여넣기 단축키 (Ctrl+Shift+C / Ctrl+Shift+V)
    window.addEventListener("keydown", (e) => {
      if (isViewerMode) return;
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyCurrentRequirement();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteCurrentRequirement();
      }
    });

    // 입력 폼 변경 시 디지몬 정보 실시간 업데이트 & 동명 디지몬 / 도감 자동 연동
    document.getElementById("edit-name").addEventListener("input", (e) => {
      const curDigi = project.digimons[selectedDigiId];
      if (curDigi) {
        curDigi.name = e.target.value;
        const reqNameEl = document.getElementById("req-digi-name");
        if (reqNameEl) reqNameEl.textContent = e.target.value;
        saveState();
        renderTree();

        const inputVal = e.target.value.trim();
        const matchedExisting = findExistingDigimonByName(inputVal, selectedDigiId);
        const matchedOfficial = lookupOfficialDigimon(inputVal);
        if (matchedExisting || (matchedOfficial && matchedOfficial.name === inputVal)) {
          applyDigimonInfoByName(selectedDigiId, inputVal, false);
        } else {
          updateDigiRefBadge(curDigi);
        }
      }
    });

    document.getElementById("edit-name").addEventListener("change", (e) => {
      if (project.digimons[selectedDigiId]) {
        applyDigimonInfoByName(selectedDigiId, e.target.value, false);
      }
    });

    // 공식 도감 수동 조회 버튼 클릭 이벤트
    document.getElementById("btn-lookup-db").addEventListener("click", () => {
      const curDigi = project.digimons[selectedDigiId];
      if (!curDigi) return;
      const nameInput = document.getElementById("edit-name").value.trim();
      if (!nameInput) return alert("디지몬 이름을 먼저 입력해주세요.");
      applyDigimonInfoByName(selectedDigiId, nameInput, true);
    });


    document.getElementById("edit-stage").addEventListener("change", (e) => {
      if (project.digimons[selectedDigiId]) {
        project.digimons[selectedDigiId].stage = e.target.value;
        if (NO_ATTR_STAGES.includes(e.target.value)) project.digimons[selectedDigiId].attr = "none";
        syncSameNameDigimons(project.digimons[selectedDigiId]);
        saveState();
        renderTree();
        updateSidebar();
      }
    });

    document.getElementById("edit-attr").addEventListener("change", (e) => {
      if (project.digimons[selectedDigiId]) {
        project.digimons[selectedDigiId].attr = e.target.value;
        syncSameNameDigimons(project.digimons[selectedDigiId]);
        saveState();
        renderTree();
        renderLineColorPresets();
      }
    });

    document.getElementById("edit-img").addEventListener("input", (e) => {
      if (project.digimons[selectedDigiId]) {
        project.digimons[selectedDigiId].img = e.target.value;
        syncSameNameDigimons(project.digimons[selectedDigiId]);
        saveState();
        renderTree();
        const previewImg = document.getElementById("dropzone-preview");
        const dropzonePrompt = document.getElementById("dropzone-prompt");
        if (e.target.value) {
          previewImg.src = e.target.value;
          previewImg.style.display = "block";
          dropzonePrompt.style.display = "none";
        }
      }
    });

    document.getElementById("edit-base-hp").addEventListener("input", (e) => {
      const digi = project.digimons[selectedDigiId];
      if (digi) {
        const val = e.target.value.trim();
        digi.baseHp = val === "" ? "" : Number(val);
        syncSameNameDigimons(digi);
        saveState();
      }
    });

    document.getElementById("edit-base-ap").addEventListener("input", (e) => {
      const digi = project.digimons[selectedDigiId];
      if (digi) {
        const val = e.target.value.trim();
        digi.baseAp = val === "" ? "" : Number(val);
        syncSameNameDigimons(digi);
        saveState();
      }
    });

    document.getElementById("edit-base-spd").addEventListener("input", (e) => {
      const digi = project.digimons[selectedDigiId];
      if (digi) {
        const val = e.target.value.trim();
        digi.baseSpd = val === "" ? "" : Number(val);
        syncSameNameDigimons(digi);
        saveState();
      }
    });

    document.querySelectorAll("#condition-status-selector .status-btn-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        const digi = project.digimons[selectedDigiId];
        if (!digi) return;
        const status = btn.dataset.status;
        if (status === "auto") {
          delete digi.conditionStatus;
          updateDigimonConditionStatus(digi);
        } else {
          digi.conditionStatus = status;
          digi.unknownTime = (status === "unknown");
          digi.partialUnknown = (status === "partial");
        }
        syncSameNameDigimons(digi);
        saveState();
        renderTree();
        updateSidebar();
      });
    });

    document.getElementById("edit-independent-req").addEventListener("change", (e) => {
      if (project.digimons[selectedDigiId]) {
        project.digimons[selectedDigiId].independentReq = e.target.checked;
        saveState();
        updateDigiRefBadge(project.digimons[selectedDigiId]);
        if (e.target.checked) {
          showToast(`[${project.digimons[selectedDigiId].name}] 디지몬의 진화조건이 DiM 고유 조건으로 분리되었습니다.`);
        } else {
          // 체크 해제 시 동일 이름 디지몬과 조건 다시 동기화
          syncSameNameDigimons(project.digimons[selectedDigiId]);
          updateSidebar();
          showToast(`[${project.digimons[selectedDigiId].name}] 디지몬의 진화조건이 동일 디지몬들과 다시 연동됩니다.`);
        }
      }
    });

    // 드롭존 및 이미지 파일 핸들러
    function handleImageFile(file, targetDigiId) {
      if (!file || !file.type.startsWith("image/")) {
        return alert("이미지 파일(GIF, PNG, JPG 등)만 등록할 수 있습니다.");
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        if (project.digimons[targetDigiId]) {
          project.digimons[targetDigiId].img = dataUrl;
          syncSameNameDigimons(project.digimons[targetDigiId]);
          saveState();
          renderTree();
          updateSidebar();
        }
      };
      reader.readAsDataURL(file);
    }

    const dropzone = document.getElementById("image-dropzone");
    const dropzoneInput = document.getElementById("dropzone-file-input");

    dropzone.addEventListener("click", () => dropzoneInput.click());
    dropzoneInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleImageFile(e.target.files[0], selectedDigiId);
      }
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleImageFile(e.dataTransfer.files[0], selectedDigiId);
      }
    });

