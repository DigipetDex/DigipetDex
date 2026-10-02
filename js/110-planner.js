/* 진화 경로 플래너, 저장된 경로 관리 */
    // =========================================================================
    // 진화 경로 검색 & 플래너 기능 (Evolution Route Planner)
    // =========================================================================
    // 진화 경로 체인 플래너 기능 (Evolution Route Chain Planner)
    // =========================================================================
    let plannerChain = []; // [digiId0, digiId1, digiId2, ...]
    let plannerActiveIndex = 0; // 현재 포커스된 체인 노드 인덱스
    let plannerBranchDirection = "outgoing"; // 'incoming' (하위 역방향) | 'outgoing' (상위 순방향)
    let plannerActiveDim = "ALL";

    let pickerTargetSlot = 0; // 체인 내 변경할 슬롯 인덱스 (기본 0: 시작 디지몬)
    let pickerSearchQuery = "";
    let pickerStageFilter = "ALL";
    let pickerAttrFilter = "ALL";
    let pickerDimFilter = "ALL";

    function getPlannerAvailableDims() {
      const dimSet = new Set();
      if (project && Array.isArray(project.dims)) {
        project.dims.forEach(d => { if (d && typeof d === "string" && d.trim().length > 1) dimSet.add(d.trim()); });
      }
      if (window.DIGIPET_DEFAULT_DATA && Array.isArray(window.DIGIPET_DEFAULT_DATA.dims)) {
        window.DIGIPET_DEFAULT_DATA.dims.forEach(d => { if (d && typeof d === "string" && d.trim().length > 1) dimSet.add(d.trim()); });
      }
      if (project && project.digimons) {
        Object.values(project.digimons).forEach(d => {
          if (d && d.dim) {
            d.dim.split(",").map(s => s.trim()).filter(s => s.length > 1).forEach(x => dimSet.add(x));
          }
        });
      }
      const list = Array.from(dimSet);
      list.sort((a, b) => {
        if (a === "아구몬 EX") return -1;
        if (b === "아구몬 EX") return 1;
        return a.localeCompare(b, "ko");
      });
      return list;
    }

    function refreshPlannerDimSelects() {
      const dims = getPlannerAvailableDims();

      // 1. 플래너 헤더 DiM 셀렉트
      const filterSel = document.getElementById("planner-filter-dim");
      if (filterSel) {
        const curVal = filterSel.value || plannerActiveDim || "ALL";
        let html = '<option value="ALL">전체 DiM</option>';
        dims.forEach(dim => {
          html += `<option value="${escapeHtml(dim)}">${escapeHtml(dim)}</option>`;
        });
        filterSel.innerHTML = html;
        filterSel.value = (curVal && (curVal === "ALL" || dims.includes(curVal))) ? curVal : "ALL";
        plannerActiveDim = filterSel.value;
      }

      // 2. 피커 모달 DiM 셀렉트
      const pickerSel = document.getElementById("planner-picker-dim-select");
      if (pickerSel) {
        const curVal = pickerSel.value || pickerDimFilter || "ALL";
        let html = '<option value="ALL">전체 DiM</option>';
        dims.forEach(dim => {
          html += `<option value="${escapeHtml(dim)}">${escapeHtml(dim)}</option>`;
        });
        pickerSel.innerHTML = html;
        pickerSel.value = (curVal && (curVal === "ALL" || dims.includes(curVal))) ? curVal : "ALL";
        pickerDimFilter = pickerSel.value;
      }
    }

    function openEvolutionPlannerModal(initialDigiId = null) {
      try {
        const modal = document.getElementById("evolution-planner-modal");
        if (!modal) return;

        // DiM 셀렉트 박스 옵션 갱신
        refreshPlannerDimSelects();

        // 초기 디지몬 설정:
        // 1) 명시적 인자 initialDigiId
        // 2) 현재 트리에서 선택된 디지몬 (디지타마 제외)
        let targetId = initialDigiId;
        if (!targetId && selectedDigiId && project.digimons[selectedDigiId]) {
          const selDigi = project.digimons[selectedDigiId];
          if (selDigi.stage !== "디지타마" && !selDigi.name.includes("알")) {
            targetId = selectedDigiId;
          }
        }

        if (targetId) {
          plannerChain = [targetId];
          plannerActiveIndex = 0;
          const digiObj = project.digimons[targetId];
          if (digiObj && ["완전체", "궁극체", "궁극체2", "초궁극체", "초궁극체II"].includes(digiObj.stage)) {
            plannerBranchDirection = "incoming";
          } else {
            plannerBranchDirection = "outgoing";
          }
        } else if (plannerChain.length === 0) {
          plannerChain = [];
          plannerActiveIndex = 0;
        }

        modal.style.display = "flex";
        modal.classList.add("active");
        updateEvolutionPlannerUI();
        updateSavedChainsBadge();

        // 선택된 디지몬이 없다면 즉시 디지몬 선택 검색창(피커 모달) 오픈
        if (plannerChain.length === 0) {
          openPlannerPickerModal(0);
        }
      } catch (err) {
        console.error("openEvolutionPlannerModal error:", err);
      }
    }
    window.openEvolutionPlannerModal = openEvolutionPlannerModal;

    function closeEvolutionPlannerModal() {
      const modal = document.getElementById("evolution-planner-modal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    }
    window.closeEvolutionPlannerModal = closeEvolutionPlannerModal;

    // 두 디지몬 간의 직접 진화선 또는 최단 경로 탐색 (BFS)
    function findDirectOrPathEvo(fromId, toId) {
      if (!fromId || !toId || !project.evolutions) return null;
      // 1) 직접 연결선
      const direct = project.evolutions.find(e => e.from === fromId && e.to === toId);
      if (direct) return { isDirect: true, path: [fromId, toId], evo: direct };

      // 2) 이름 기반 직접 연결선 (다른 DiM 인스턴스 고려)
      const fromD = project.digimons[fromId];
      const toD = project.digimons[toId];
      if (fromD && toD) {
        const nameEvos = project.evolutions.filter(e => {
          const ef = project.digimons[e.from];
          const et = project.digimons[e.to];
          return ef && et && ef.name === fromD.name && et.name === toD.name;
        });
        if (nameEvos.length > 0) {
          if (plannerActiveDim !== "ALL") {
            const dimMatched = nameEvos.find(e => {
              const ef = project.digimons[e.from];
              return ef && ef.dim && ef.dim.includes(plannerActiveDim);
            });
            if (dimMatched) return { isDirect: true, path: [dimMatched.from, dimMatched.to], evo: dimMatched };
          }
          return { isDirect: true, path: [nameEvos[0].from, nameEvos[0].to], evo: nameEvos[0] };
        }
      }

      // 3) 다단계 최단 경로 탐색 (BFS)
      const queue = [[fromId]];
      const visited = new Set([fromId]);
      while (queue.length > 0) {
        const path = queue.shift();
        const curr = path[path.length - 1];
        const outgoing = project.evolutions.filter(e => e.from === curr);
        for (const evo of outgoing) {
          if (evo.to === toId) {
            return { isDirect: false, path: [...path, evo.to], evo: evo };
          }
          if (!visited.has(evo.to)) {
            visited.add(evo.to);
            queue.push([...path, evo.to]);
          }
        }
      }
      return null;
    }

    // 두 디지몬 간의 직접 진화선 여부 확인
    function areDigimonsDirectlyConnected(fromId, toId) {
      if (!fromId || !toId || !project.evolutions) return false;
      const res = findDirectOrPathEvo(fromId, toId);
      return !!(res && res.isDirect);
    }

    // 인라인 진화 조건 요약 포맷팅 (화살표 사이 표시용)
    function formatInlineEvoReq(fromDigi, toDigi) {
      if (!fromDigi || !toDigi) return { html: '<div class="planner-cond-none">-</div>', hasData: false };

      const isDirect = areDigimonsDirectlyConnected(fromDigi.id, toDigi.id);
      if (!isDirect) {
        return {
          html: `<div class="planner-cond-unknown" style="color:#EF4444; border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.1); font-weight:700;">연결 없음</div>`,
          hasData: false
        };
      }

      const evoResult = findDirectOrPathEvo(fromDigi.id, toDigi.id);
      const evo = evoResult?.evo || null;
      const req = getEvoRequirements(evo, toDigi);
      const isRevealed = evo ? isEvoRevealed(evo, toDigi.stage) : !toDigi.unknownTime;

      // 유년기 또는 성장기로의 진화는 시간이 밝혀져 있으면 조건 공개로 취급
      const isBabyOrChild = ["디지타마", "유년기 I", "유년기 II", "성장기"].includes(toDigi.stage) || ["유년기 I", "유년기 II"].includes(fromDigi.stage);

      if (!isRevealed && !isBabyOrChild) {
        return {
          html: `<div class="planner-cond-unknown">조건 불명</div>`,
          hasData: false
        };
      }

      const tags = [];
      let jogressSub = "";
      let itemSub = "";

      // 1. 조그레스
      if (req.jogress && req.jogress !== "-" && req.jogress !== "없음") {
        tags.push(`<span class="cond-tag jogress" title="조그레스: ${escapeHtml(req.jogress)}">조그레스</span>`);
        jogressSub = req.jogress;
      }

      // 2. 특수 아이템
      if (req.item && req.item !== "-" && req.item !== "없음") {
        tags.push(`<span class="cond-tag item" title="필요 아이템: ${escapeHtml(req.item)}">아이템</span>`);
        itemSub = req.item;
      }

      // 3. 진화 시간
      if (req.time && req.time !== "-") {
        tags.push(`<span class="cond-tag time" title="진화 시간"><img src="진화시간.webp" alt="시간" class="cond-icon">${escapeHtml(req.time)}</span>`);
      }

      // 4. 바이탈
      if (req.vital !== "" && req.vital !== undefined && req.vital !== null && req.vital !== "-") {
        tags.push(`<span class="cond-tag vital" title="필요 바이탈"><img src="바이탈.webp" alt="바이탈" class="cond-icon">${Number(req.vital).toLocaleString()}V</span>`);
      }

      // 5. PP / 트로피
      if (req.pp !== "" && req.pp !== undefined && req.pp !== null && req.pp !== "-") {
        tags.push(`<span class="cond-tag pp" title="필요 트로피/PP"><img src="PP.webp" alt="PP" class="cond-icon">PP ${req.pp}</span>`);
      }

      // 6. 배틀 / 승률
      if (req.battle || req.winRate) {
        const b = req.battle ? `${req.battle}회` : '';
        const w = req.winRate ? `${req.winRate}%` : '';
        const str = [b, w].filter(Boolean).join('·');
        if (str) {
          tags.push(`<span class="cond-tag battle" title="배틀 및 승률"><img src="승률.webp" alt="배틀/승률" class="cond-icon">${escapeHtml(str)}</span>`);
        }
      }

      // 7. 던전 클리어 조건
      if (req.dungeon && req.dungeon !== "-" && req.dungeon !== "없음") {
        const dStr = req.dungeon.startsWith("던전") ? req.dungeon : `던전 ${req.dungeon}`;
        tags.push(`<span class="cond-tag dungeon" title="던전 조건: ${escapeHtml(req.dungeon)}">${escapeHtml(dStr)}</span>`);
      }

      if (tags.length === 0 && !jogressSub && !itemSub) {
        return {
          html: `<div class="planner-cond-none">조건 없음</div>`,
          hasData: false
        };
      }

      // 태그들을 한 줄에 최대 2개씩 분할 (3개가 한 줄에 몰려 삐져나가는 현상 방지)
      const rows = [];
      for (let i = 0; i < tags.length; i += 2) {
        rows.push(tags.slice(i, i + 2).join(" "));
      }
      const rowsHtml = rows.map(r => `<div class="planner-cond-row">${r}</div>`).join("");

      let subHtml = "";
      if (jogressSub) {
        subHtml += `<div class="planner-cond-sub" title="조그레스: ${escapeHtml(req.jogress)}">${escapeHtml(req.jogress)}</div>`;
      } else if (itemSub) {
        subHtml += `<div class="planner-cond-sub" style="color:#FCD34D;" title="아이템: ${escapeHtml(req.item)}">${escapeHtml(req.item)}</div>`;
      }

      return {
        html: `
          ${rowsHtml}
          ${subHtml}
        `,
        hasData: true
      };
    }

    function updateEvolutionPlannerUI() {
      const chainContainer = document.getElementById("planner-chain-container");
      // chainCountBadge removed
      const branchesContainer = document.getElementById("planner-branches-container");
      const branchesGrid = document.getElementById("planner-branches-grid");
      const branchesTitle = document.getElementById("planner-branches-title");
      const branchesSubtitle = document.getElementById("planner-branches-subtitle");
      const btnTabIncoming = document.getElementById("planner-tab-dir-incoming");
      const btnTabOutgoing = document.getElementById("planner-tab-dir-outgoing");
      const btnViewTree = document.getElementById("planner-btn-view-in-tree");

      if (!chainContainer) return;

      // 1. 체인 상태 유효성 보정
      if (plannerChain.length === 0) {
        chainContainer.innerHTML = `
          <div class="planner-chain-slot-wrap">
            <div class="planner-chain-slot-stage">시작 디지몬</div>
            <div class="planner-chain-slot empty" onclick="openPlannerPickerModal(0)" title="클릭하여 디지몬 선택">
              <div class="planner-slot-empty-icon">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <span style="font-size:0.72rem; color:#94A3B8; font-weight:600; margin-top:4px;">디지몬 선택</span>
            </div>
          </div>
        `;
        if (branchesContainer) branchesContainer.style.display = "none";
        return;
      }

      if (plannerActiveIndex >= plannerChain.length) {
        plannerActiveIndex = plannerChain.length - 1;
      }
      if (plannerActiveIndex < 0) plannerActiveIndex = 0;

      const activeDigi = project.digimons[plannerChain[plannerActiveIndex]];
      const attrKoMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-", unknown: "불명" };

      // 2. 트리에서 보기 버튼 바인딩
      if (btnViewTree && activeDigi) {
        btnViewTree.onclick = () => {
          closeEvolutionPlannerModal();
          navigateToDigimon(activeDigi.id, `[<strong>${activeDigi.name}</strong>] 트리 위치로 이동했습니다!`);
        };
      }

      // 3. 현재 포커스된 디지몬의 들어오는(incoming) 및 나가는(outgoing) 진화선 모두 수집
      let incomingEvos = [];
      let outgoingEvos = [];

      if (activeDigi) {
        if (plannerActiveDim === "ALL") {
          const sameNameDigis = Object.values(project.digimons).filter(d => d.name === activeDigi.name);
          const allIds = sameNameDigis.map(d => d.id);
          incomingEvos = (project.evolutions || []).filter(e => allIds.includes(e.to));
          outgoingEvos = (project.evolutions || []).filter(e => allIds.includes(e.from));
        } else {
          const matchedDigis = Object.values(project.digimons).filter(d => {
            if (d.name !== activeDigi.name) return false;
            const dims = d.dim ? d.dim.split(",").map(s => s.trim()) : [];
            return dims.includes(plannerActiveDim);
          });
          const matchIds = matchedDigis.length > 0 ? matchedDigis.map(d => d.id) : [activeDigi.id];
          incomingEvos = (project.evolutions || []).filter(e => {
            if (!matchIds.includes(e.to)) return false;
            const fd = project.digimons[e.from];
            if (!fd) return false;
            const fDims = fd.dim ? fd.dim.split(",").map(s => s.trim()) : [];
            return fDims.includes(plannerActiveDim);
          });
          outgoingEvos = (project.evolutions || []).filter(e => {
            if (!matchIds.includes(e.from)) return false;
            const td = project.digimons[e.to];
            if (!td) return false;
            const tDims = td.dim ? td.dim.split(",").map(s => s.trim()) : [];
            return tDims.includes(plannerActiveDim);
          });
        }
      }

      // 하위 진화체(incoming) 후보군 집계
      const inBranchMap = new Map();
      incomingEvos.forEach(evo => {
        const fd = project.digimons[evo.from];
        if (!fd) return;
        // 디지타마(알)는 하위 진화체 탐색에서 완전히 제외
        if (fd.stage === "디지타마") return;
        const evoDim = (fd.dim ? fd.dim.split(",")[0].trim() : "");
        if (!inBranchMap.has(fd.name)) {
          inBranchMap.set(fd.name, { candDigi: fd, evos: [evo], dims: evoDim ? [evoDim] : [] });
        } else {
          const grp = inBranchMap.get(fd.name);
          grp.evos.push(evo);
          if (evoDim && !grp.dims.includes(evoDim)) grp.dims.push(evoDim);
        }
      });
      const incomingList = Array.from(inBranchMap.values());

      // 상위 진화체(outgoing) 후보군 집계
      const outBranchMap = new Map();
      outgoingEvos.forEach(evo => {
        const td = project.digimons[evo.to];
        if (!td) return;
        const fromD = project.digimons[evo.from];
        const evoDim = (fromD && fromD.dim ? fromD.dim.split(",")[0].trim() : (td.dim ? td.dim.split(",")[0].trim() : ""));
        if (!outBranchMap.has(td.name)) {
          outBranchMap.set(td.name, { candDigi: td, evos: [evo], dims: evoDim ? [evoDim] : [] });
        } else {
          const grp = outBranchMap.get(td.name);
          grp.evos.push(evo);
          if (evoDim && !grp.dims.includes(evoDim)) grp.dims.push(evoDim);
        }
      });
      const outgoingList = Array.from(outBranchMap.values());

      // 만약 선택된 방향의 후보가 0개이고 반대 방향 후보가 있으면 자동 전환 (초궁극체 선택 시 incoming, 유년기 선택 시 outgoing 자동 활성화)
      if (plannerBranchDirection === "incoming" && incomingList.length === 0 && outgoingList.length > 0) {
        plannerBranchDirection = "outgoing";
      } else if (plannerBranchDirection === "outgoing" && outgoingList.length === 0 && incomingList.length > 0) {
        plannerBranchDirection = "incoming";
      }

      // 4. 방향 탭 버튼 텍스트 및 활성화 상태 갱신
      if (btnTabIncoming) {
        btnTabIncoming.textContent = `◀ 이전 진화체 (하위 ${incomingList.length}종)`;
        btnTabIncoming.className = `planner-dir-btn ${plannerBranchDirection === "incoming" ? "active" : ""}`;
        btnTabIncoming.onclick = () => {
          plannerBranchDirection = "incoming";
          updateEvolutionPlannerUI();
        };
      }
      if (btnTabOutgoing) {
        btnTabOutgoing.textContent = `다음 진화체 (상위 ${outgoingList.length}종) ▶`;
        btnTabOutgoing.className = `planner-dir-btn ${plannerBranchDirection === "outgoing" ? "active" : ""}`;
        btnTabOutgoing.onclick = () => {
          plannerBranchDirection = "outgoing";
          updateEvolutionPlannerUI();
        };
      }

      const activeList = plannerBranchDirection === "incoming" ? incomingList : outgoingList;

      // 5. 체인 슬롯 & 인라인 진화 조건 커넥터 렌더링
      chainContainer.innerHTML = "";

      // 5-A. 역방향 탐색 슬롯 (체인 첫 노드가 유년기 I가 아니고 incoming 후보가 있는 경우)
      if (incomingList.length > 0 && plannerActiveIndex === 0) {
        const prevStageSample = incomingList[0]?.candDigi?.stage || "이전 진화";
        const prevWrap = document.createElement("div");
        prevWrap.className = "planner-chain-slot-wrap";
        prevWrap.innerHTML = `
          <div class="planner-chain-slot-stage" style="color:#A78BFA; border-color:rgba(167,139,250,0.3);">${escapeHtml(prevStageSample)}</div>
          <div class="planner-chain-slot empty" title="클릭하여 하위(이전) 진화체를 선택하세요">
            <div class="planner-slot-empty-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#A78BFA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </div>
            <span style="font-size:0.67rem; color:#A78BFA; font-weight:700; margin-top:2px;">이전 진화</span>
          </div>
          <span style="font-size:0.62rem; color:#949BA4;">하위 선택</span>
        `;
        prevWrap.querySelector(".planner-chain-slot").addEventListener("click", () => {
          plannerActiveIndex = 0;
          plannerBranchDirection = "incoming";
          updateEvolutionPlannerUI();
        });
        chainContainer.appendChild(prevWrap);

        const connector = document.createElement("div");
        connector.className = "planner-chain-connector";
        connector.innerHTML = `
          <div class="planner-cond-bubble" style="border:1.5px dashed rgba(167,139,250,0.4); background:rgba(167,139,250,0.06);">
            <span style="font-size:0.65rem; color:#C4B5FD; font-weight:600;">진화 대기</span>
          </div>
          <div class="planner-connector-arrow" style="color:#A78BFA;">
            <svg viewBox="0 0 24 24" width="22" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <polyline points="15 6 22 12 15 18"></polyline>
            </svg>
          </div>
        `;
        chainContainer.appendChild(connector);
      }

      // 5-B. 확정된 체인 노드들 및 커넥터 렌더링
      plannerChain.forEach((digiId, idx) => {
        const digi = project.digimons[digiId];
        if (!digi) return;

        // 화살표 및 조건 커넥터 (2번째 노드부터 노드 앞에 삽입)
        if (idx > 0) {
          const prevDigi = project.digimons[plannerChain[idx - 1]];
          const reqInfo = formatInlineEvoReq(prevDigi, digi);

          const connector = document.createElement("div");
          connector.className = "planner-chain-connector";
          connector.innerHTML = `
            <div class="planner-cond-bubble" title="${escapeHtml(prevDigi.name)} → ${escapeHtml(digi.name)} 진화 조건">
              ${reqInfo.html}
            </div>
            <div class="planner-connector-arrow">
              <svg viewBox="0 0 24 24" width="22" height="14" fill="none" stroke="#5865F2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <polyline points="15 6 22 12 15 18"></polyline>
              </svg>
            </div>
          `;
          connector.addEventListener("click", () => {
            plannerActiveIndex = idx;
            updateEvolutionPlannerUI();
          });
          chainContainer.appendChild(connector);
        }

        const isFocus = idx === plannerActiveIndex;
        const wrap = document.createElement("div");
        wrap.className = "planner-chain-slot-wrap";

        wrap.innerHTML = `
          <div class="planner-chain-slot-stage">${escapeHtml(digi.stage || `Step ${idx+1}`)}</div>
          <div class="planner-chain-slot filled ${isFocus ? 'active' : ''}" title="${escapeHtml(digi.name)} (클릭 시 이 단계에서 분기/하위 탐색)">
            <img class="planner-slot-img" style="width:44px; height:44px;" src="${encodeURI(digi.img || '')}" alt="${escapeHtml(digi.name)}" onerror="handleDigiImgError(this, '${escapeHtml(digi.name)}', '${escapeHtml(digi.img || '')}', '${digi.id}')">
            <div class="planner-slot-name">${escapeHtml(digi.name)}</div>
            <div class="planner-slot-sub">${escapeHtml(attrKoMap[digi.attr] || digi.attr || '-')}</div>
          </div>
          <button type="button" class="planner-btn-select" style="padding:2px 6px; font-size:0.68rem; width:82%;">변경</button>
        `;

        const slotCard = wrap.querySelector(".planner-chain-slot");
        slotCard.addEventListener("click", () => {
          plannerActiveIndex = idx;
          updateEvolutionPlannerUI();
        });

        const btnChange = wrap.querySelector(".planner-btn-select");
        btnChange.addEventListener("click", (e) => {
          e.stopPropagation();
          openPlannerPickerModal(idx);
        });

        chainContainer.appendChild(wrap);
      });

      // 5-C. 순방향 다음 진화 슬롯 (체인의 마지막 노드가 포커스되어 있고, outgoing 후보가 있는 경우)
      if (plannerActiveIndex === plannerChain.length - 1) {
        if (outgoingList.length > 0) {
          const connector = document.createElement("div");
          connector.className = "planner-chain-connector";
          connector.innerHTML = `
            <div class="planner-cond-bubble" style="border:1.5px dashed rgba(88,101,242,0.4); background:rgba(88,101,242,0.06);">
              <span style="font-size:0.66rem; color:#7DD3FC; font-weight:600;">진화 대기</span>
            </div>
            <div class="planner-connector-arrow">
              <svg viewBox="0 0 24 24" width="22" height="14" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <polyline points="15 6 22 12 15 18"></polyline>
              </svg>
            </div>
          `;
          chainContainer.appendChild(connector);

          const nextWrap = document.createElement("div");
          nextWrap.className = "planner-chain-slot-wrap";
          const nextStageSample = outgoingList[0]?.candDigi?.stage || "다음 진화";
          nextWrap.innerHTML = `
            <div class="planner-chain-slot-stage" style="color:#38BDF8; border-color:rgba(56,189,248,0.3);">${escapeHtml(nextStageSample)}</div>
            <div class="planner-chain-slot empty" title="하단에서 다음 진화할 디지몬을 선택하세요">
              <div class="planner-slot-empty-icon">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <span style="font-size:0.68rem; color:#38BDF8; font-weight:600; margin-top:2px;">다음 진화</span>
            </div>
            <span style="font-size:0.63rem; color:#94A3B8;">상위 선택</span>
          `;
          nextWrap.querySelector(".planner-chain-slot").addEventListener("click", () => {
            plannerActiveIndex = plannerChain.length - 1;
            plannerBranchDirection = "outgoing";
            updateEvolutionPlannerUI();
          });
          chainContainer.appendChild(nextWrap);
        } else if (incomingList.length === 0) {
          // 최종 진화체 도달
          const connector = document.createElement("div");
          connector.className = "planner-chain-connector";
          connector.style.minWidth = "60px";
          connector.style.maxWidth = "80px";
          connector.innerHTML = `
            <div class="planner-connector-arrow" style="color:#F59E0B;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          `;
          chainContainer.appendChild(connector);

          const finalWrap = document.createElement("div");
          finalWrap.className = "planner-chain-slot-wrap";
          finalWrap.innerHTML = `
            <div class="planner-chain-slot-stage" style="color:#F59E0B; border-color:rgba(245,158,11,0.3); background:rgba(245,158,11,0.1);">최종 형태</div>
            <div class="planner-chain-slot" style="border: 1.5px solid rgba(245,158,11,0.35); background: rgba(245,158,11,0.06); cursor: default;">
              <div style="font-size:0.75rem; font-weight:700; color:#FCD34D;">진화 완료</div>
              <span style="font-size:0.64rem; color:#949BA4; margin-top:2px;">최대 형태</span>
            </div>
          `;
          chainContainer.appendChild(finalWrap);
        }
      }



      // 6. 진화 가능한 디지몬 후보군 서랍 렌더링
      if (activeDigi) {
        branchesContainer.style.display = "flex";
        if (plannerBranchDirection === "incoming") {
          branchesTitle.textContent = `${activeDigi.name}(으)로 진화하는 하위 디지몬 (${incomingList.length}종)`;
          if (branchesSubtitle) branchesSubtitle.textContent = "카드를 클릭하면 경로 앞쪽에 하위 단계로 추가됩니다.";
        } else {
          branchesTitle.textContent = `${activeDigi.name}에서 진화하는 상위 디지몬 (${outgoingList.length}종)`;
          if (branchesSubtitle) branchesSubtitle.textContent = "카드를 클릭하면 경로 뒤쪽에 다음 단계로 추가됩니다.";
        }
        branchesGrid.innerHTML = "";

        if (activeList.length > 0) {
          activeList.forEach(item => {
            const candDigi = item.candDigi;
            const card = document.createElement("div");
            card.className = `planner-cand-card`;

            // DiM 뱃지
            let dimBadgeHtml = "";
            if (item.dims.length === 1) {
              dimBadgeHtml = `<div class="planner-dim-badge" title="${escapeHtml(item.dims[0])}">${escapeHtml(item.dims[0])}</div>`;
            } else if (item.dims.length > 1) {
              dimBadgeHtml = `<div class="planner-dim-badge multi" title="${escapeHtml(item.dims.join(', '))}">다중 DiM (${item.dims.length})</div>`;
            }

            card.innerHTML = `
              <img class="planner-cand-img" src="${encodeURI(candDigi.img || '')}" alt="${escapeHtml(candDigi.name)}" onerror="handleDigiImgError(this, '${escapeHtml(candDigi.name)}', '${escapeHtml(candDigi.img || '')}', '${candDigi.id}')">
              <div class="planner-cand-name">${escapeHtml(candDigi.name)}</div>
              <div class="planner-cand-info">${escapeHtml(candDigi.stage || '-')} · ${escapeHtml(attrKoMap[candDigi.attr] || candDigi.attr || '-')}</div>
              ${dimBadgeHtml}
            `;

            // 후보 카드 클릭 핸들러
            card.addEventListener("click", () => {
              if (plannerBranchDirection === "incoming") {
                // 역방향: 체인 앞쪽에 삽입!
                if (plannerActiveIndex === 0) {
                  plannerChain.unshift(candDigi.id);
                  plannerActiveIndex = 0;
                } else {
                  plannerChain = [candDigi.id, ...plannerChain.slice(plannerActiveIndex)];
                  plannerActiveIndex = 0;
                }
              } else {
                // 순방향: 체인 뒤쪽에 추가 또는 분기 교체!
                if (plannerActiveIndex === plannerChain.length - 1) {
                  plannerChain.push(candDigi.id);
                  plannerActiveIndex = plannerChain.length - 1;
                } else {
                  plannerChain = plannerChain.slice(0, plannerActiveIndex + 1);
                  plannerChain.push(candDigi.id);
                  plannerActiveIndex = plannerChain.length - 1;
                }
              }
              updateEvolutionPlannerUI();
            });

            branchesGrid.appendChild(card);
          });
        } else {
          const msg = plannerBranchDirection === "incoming" 
            ? "더 이상 하위 진화체가 존재하지 않는 최초 진화 단계(유년기)입니다."
            : "다음 진화체가 등록되어 있지 않거나 최종 진화체입니다.";
          branchesGrid.innerHTML = `<div style="grid-column: 1/-1; font-size:0.78rem; color:#949BA4; text-align:center; padding:12px;">${msg}</div>`;
        }
      } else {
        branchesContainer.style.display = "none";
      }
    }

    function openPlannerPickerModal(targetSlot = 0) {
      try {
        pickerTargetSlot = targetSlot;
        const modal = document.getElementById("planner-picker-modal");
        if (!modal) return;

        const titleEl = document.getElementById("planner-picker-modal-title");
        if (titleEl) {
          if (plannerChain && plannerChain.length > 0 && plannerChain[targetSlot]) {
            const curDigi = project.digimons[plannerChain[targetSlot]];
            const prevDigi = targetSlot > 0 ? project.digimons[plannerChain[targetSlot - 1]] : null;
            if (prevDigi) {
              titleEl.textContent = `디지몬 변경 (${prevDigi.name}의 다음 단계 선택)`;
            } else {
              titleEl.textContent = `디지몬 변경 (현재: ${curDigi ? curDigi.name : '선택'})`;
            }
          } else {
            titleEl.textContent = "디지몬 선택";
          }
        }

        refreshPlannerDimSelects();
        modal.style.display = "flex";
        modal.classList.add("active");
        renderPlannerPickerList();
      } catch (err) {
        console.error("openPlannerPickerModal error:", err);
      }
    }
    window.openPlannerPickerModal = openPlannerPickerModal;

    function closePlannerPickerModal() {
      const modal = document.getElementById("planner-picker-modal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    }
    window.closePlannerPickerModal = closePlannerPickerModal;

    // 플래너에서 선택한 디지몬을 체인에 지능적으로 연계 적용
    function applyPlannerSelection(did, targetSlot) {
      const newDigi = project.digimons[did];
      if (!newDigi) return;

      // 1. 체인이 비어있거나 최초 선택인 경우
      if (!plannerChain || plannerChain.length === 0) {
        plannerChain = [did];
        plannerActiveIndex = 0;
        if (["완전체", "궁극체", "궁극체2", "초궁극체", "초궁극체II"].includes(newDigi.stage)) {
          plannerBranchDirection = "incoming";
        } else {
          plannerBranchDirection = "outgoing";
        }
        return;
      }

      // targetSlot 범위 방어
      if (targetSlot < 0 || targetSlot >= plannerChain.length) {
        targetSlot = plannerChain.length - 1;
      }

      // 2. 체인의 유일한 노드(길이 1)인 경우
      if (plannerChain.length === 1) {
        plannerChain = [did];
        plannerActiveIndex = 0;
        if (["완전체", "궁극체", "궁극체2", "초궁극체", "초궁극체II"].includes(newDigi.stage)) {
          plannerBranchDirection = "incoming";
        } else {
          plannerBranchDirection = "outgoing";
        }
        return;
      }

      // 3. 앞(이전) 노드 및 뒤(다음) 노드와의 연결성 검사
      const prevId = targetSlot > 0 ? plannerChain[targetSlot - 1] : null;
      const nextId = targetSlot < plannerChain.length - 1 ? plannerChain[targetSlot + 1] : null;

      const connectsWithPrev = prevId ? areDigimonsDirectlyConnected(prevId, did) : true;
      const connectsWithNext = nextId ? areDigimonsDirectlyConnected(did, nextId) : true;

      // Case A: 앞뒤 모두 정상 연결되는 경우 -> 슬롯만 안전 교체
      if (connectsWithPrev && connectsWithNext) {
        plannerChain[targetSlot] = did;
        plannerActiveIndex = targetSlot;
        showToast(`[${newDigi.name}] 디지몬으로 교체되었습니다.`);
        return;
      }

      // Case B: 앞쪽과는 연결되나, 뒤쪽과는 연결 불가능한 경우 (순방향 분기)
      // 예: 그루스감마몬 -> 베텔감마몬으로 변경 (감마몬과는 연결되나 뒤쪽 레굴루스몬과는 불일치)
      if (connectsWithPrev && !connectsWithNext) {
        plannerChain = [...plannerChain.slice(0, targetSlot), did];
        plannerActiveIndex = plannerChain.length - 1;
        plannerBranchDirection = "outgoing";
        showToast(`[${newDigi.name}] 기준으로 새로운 상위 진화 경로를 탐색합니다.`);
        return;
      }

      // Case C: 앞쪽과는 연결되지 않으나, 뒤쪽과는 연결 가능한 경우 (역방향 분기)
      if (!connectsWithPrev && connectsWithNext) {
        plannerChain = [did, ...plannerChain.slice(targetSlot + 1)];
        plannerActiveIndex = 0;
        plannerBranchDirection = "incoming";
        showToast(`[${newDigi.name}] 기준으로 새로운 하위 진화 경로를 탐색합니다.`);
        return;
      }

      // Case D: 앞쪽과도, 뒤쪽과도 전혀 연결되지 않는 완전히 무관한 디지몬 (예: 감마몬 라인에 유노몬 선택)
      // 연관 없는 앞뒤 단계를 모두 제거하고, 선택한 디지몬으로 새 진화 경로 시작
      plannerChain = [did];
      plannerActiveIndex = 0;
      if (["완전체", "궁극체", "궁극체2", "초궁극체", "초궁극체II"].includes(newDigi.stage)) {
        plannerBranchDirection = "incoming";
      } else {
        plannerBranchDirection = "outgoing";
      }
      showToast(`[${newDigi.name}] 디지몬으로 새로운 진화 경로를 시작합니다.`);
    }

    function renderPlannerPickerList() {
      const grid = document.getElementById("planner-picker-grid");
      const countEl = document.getElementById("planner-picker-count");
      if (!grid) return;

      const allDigis = Object.values(project.digimons || {});
      const query = (pickerSearchQuery || "").toLowerCase().trim();

      // 이름 기준 그룹핑 (여러 DiM에 속한 동일 디지몬 중복 방지)
      const nameGroupMap = new Map();
      allDigis.forEach(d => {
        // 디지타마(알) 제외
        if (d.stage === "디지타마" || (d.name && d.name.includes("알")) || (d.id && d.id.startsWith("digitama"))) return;

        // 세대 필터
        if (pickerStageFilter !== "ALL" && d.stage !== pickerStageFilter) return;

        // 속성 필터
        if (pickerAttrFilter !== "ALL" && d.attr !== pickerAttrFilter) return;

        // DiM 필터
        const dDims = d.dim ? d.dim.split(",").map(s => s.trim()) : [];
        if (pickerDimFilter !== "ALL" && !dDims.includes(pickerDimFilter)) return;

        // 검색어 필터 (이름, 세대, DiM, 영문명)
        if (query) {
          const matchName = (d.name || "").toLowerCase().includes(query);
          const matchDim = dDims.some(dm => dm.toLowerCase().includes(query));
          const matchStage = (d.stage || "").toLowerCase().includes(query);
          const official = typeof lookupOfficialDigimon === "function" ? lookupOfficialDigimon(d.name) : null;
          const qClean = query.replace(/[\s\-_]/g, '');
          const matchEng = official && (
            (official.englishName && official.englishName.toLowerCase().replace(/[\s\-_]/g, '').includes(qClean)) ||
            (official.dir && String(official.dir).toLowerCase().replace(/[\s\-_]/g, '').includes(qClean))
          );
          const matchImg = (d.img || "").toLowerCase().includes(query);
          if (!matchName && !matchDim && !matchStage && !matchEng && !matchImg) return;
        }

        if (!nameGroupMap.has(d.name)) {
          nameGroupMap.set(d.name, {
            digi: d,
            dims: new Set(dDims)
          });
        } else {
          const entry = nameGroupMap.get(d.name);
          dDims.forEach(dm => entry.dims.add(dm));
        }
      });

      const list = Array.from(nameGroupMap.values());
      const stageOrderMap = {
        "유년기 I": 1, "유년기 II": 2, "성장기": 3, "성숙기": 4,
        "완전체": 5, "궁극체": 6, "궁극체2": 7, "초궁극체": 8, "초궁극체II": 9
      };

      const prevId = (pickerTargetSlot > 0 && plannerChain && plannerChain[pickerTargetSlot - 1]) ? plannerChain[pickerTargetSlot - 1] : null;
      const nextId = (plannerChain && pickerTargetSlot < plannerChain.length - 1) ? plannerChain[pickerTargetSlot + 1] : null;

      list.sort((a, b) => {
        const isConnA = (prevId && areDigimonsDirectlyConnected(prevId, a.digi.id)) || (nextId && areDigimonsDirectlyConnected(a.digi.id, nextId));
        const isConnB = (prevId && areDigimonsDirectlyConnected(prevId, b.digi.id)) || (nextId && areDigimonsDirectlyConnected(b.digi.id, nextId));
        if (isConnA && !isConnB) return -1;
        if (!isConnA && isConnB) return 1;

        const sA = stageOrderMap[a.digi.stage] || 99;
        const sB = stageOrderMap[b.digi.stage] || 99;
        if (sA !== sB) return sA - sB;
        return (a.digi.name || "").localeCompare(b.digi.name || "", "ko");
      });

      if (countEl) countEl.textContent = `${list.length}종`;

      const attrKoMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-", unknown: "불명" };

      if (list.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#949BA4; padding:30px 0; font-size:0.85rem;">검색 조건에 맞는 디지몬이 없습니다.</div>';
        return;
      }

      grid.innerHTML = list.map(item => {
        const d = item.digi;
        const dimsArr = Array.from(item.dims);
        let dimBadge = '';
        if (dimsArr.length === 1) {
          dimBadge = `<div class="planner-dim-badge" title="${escapeHtml(dimsArr[0])}">${escapeHtml(dimsArr[0])}</div>`;
        } else if (dimsArr.length > 1) {
          dimBadge = `<div class="planner-dim-badge multi" title="${escapeHtml(dimsArr.join(', '))}">다중 DiM (${dimsArr.length})</div>`;
        }

        const isConnected = (prevId && areDigimonsDirectlyConnected(prevId, d.id)) || (nextId && areDigimonsDirectlyConnected(d.id, nextId));
        let connBadge = '';
        if (isConnected) {
          connBadge = `<div style="font-size:0.62rem; color:#38BDF8; font-weight:700; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.3); border-radius:4px; padding:1px 5px; margin-top:2px;">⚡ 연결 가능</div>`;
        }

        return `
          <div class="planner-cand-card ${isConnected ? 'planner-connected-cand' : ''}" data-id="${escapeHtml(d.id)}">
            <img class="planner-cand-img" src="${encodeURI(d.img || '')}" alt="${escapeHtml(d.name)}" onerror="handleDigiImgError(this, '${escapeHtml(d.name)}', '${escapeHtml(d.img || '')}', '${d.id}')">
            <div class="planner-cand-name">${escapeHtml(d.name)}</div>
            <div class="planner-cand-info">${escapeHtml(d.stage || '-')} · ${escapeHtml(attrKoMap[d.attr] || d.attr || '-')}</div>
            ${dimBadge}
            ${connBadge}
          </div>
        `;
      }).join('');

      grid.querySelectorAll(".planner-cand-card").forEach(card => {
        card.addEventListener("click", () => {
          const did = card.dataset.id;
          if (!did || !project.digimons[did]) return;

          applyPlannerSelection(did, pickerTargetSlot);
          closePlannerPickerModal();
          updateEvolutionPlannerUI();
        });
      });
    }

    // =========================================================================
    // 진화 플래너 - 저장된 진화 경로 관리 (localStorage)
    // =========================================================================
    const SAVED_CHAINS_KEY = "digipet_saved_planner_chains";

    function getSavedPlannerChains() {
      try {
        const raw = localStorage.getItem(SAVED_CHAINS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("getSavedPlannerChains parse error:", e);
        return [];
      }
    }

    function setSavedPlannerChains(list) {
      try {
        localStorage.setItem(SAVED_CHAINS_KEY, JSON.stringify(list));
      } catch (e) {
        console.error("setSavedPlannerChains error:", e);
      }
      updateSavedChainsBadge();
    }

    function updateSavedChainsBadge() {
      const list = getSavedPlannerChains();
      const badge = document.getElementById("planner-saved-count-badge");
      if (badge) badge.textContent = list.length;
      const totalCount = document.getElementById("planner-saved-total-count");
      if (totalCount) totalCount.textContent = `${list.length}개`;
    }

    async function saveCurrentPlannerChain() {
      if (!plannerChain || plannerChain.length === 0) {
        showToast("저장할 진화 경로가 없습니다. 디지몬을 먼저 선택해주세요.");
        return;
      }
      const firstDigi = project.digimons[plannerChain[0]];
      const lastDigi = project.digimons[plannerChain[plannerChain.length - 1]];
      const firstName = firstDigi ? firstDigi.name : "시작";
      const lastName = lastDigi ? lastDigi.name : "끝";
      const defaultName = (plannerChain.length === 1) ? firstName : `${firstName} ➔ ${lastName}`;

      let nameToSave = defaultName;
      if (typeof showCustomPrompt === "function") {
        const res = await showCustomPrompt(
          "진화 경로 저장",
          "저장할 진화 경로의 이름을 입력해주세요:",
          defaultName,
          "예: 쿠리몬 ➔ 프로시마몬",
          "",
          true
        );
        if (res === null) return;
        if (res.trim()) nameToSave = res.trim();
      } else {
        const res = prompt("저장할 진화 경로의 이름을 입력해주세요:", defaultName);
        if (res === null) return;
        if (res.trim()) nameToSave = res.trim();
      }

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mi = String(now.getMinutes()).padStart(2, "0");
      const dateStr = `${yyyy}.${mm}.${dd} ${hh}:${mi}`;

      const newChainItem = {
        id: "chain_" + Date.now(),
        name: nameToSave,
        chain: [...plannerChain],
        dim: plannerActiveDim || "ALL",
        createdAt: dateStr
      };

      const list = getSavedPlannerChains();
      list.unshift(newChainItem);
      setSavedPlannerChains(list);
      showToast(`[${nameToSave}] 경로가 저장되었습니다!`);
    }

    function openSavedPlannerModal() {
      renderSavedPlannerList();
      const modal = document.getElementById("planner-saved-modal");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
      }
    }

    function closeSavedPlannerModal() {
      const modal = document.getElementById("planner-saved-modal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    }

    function renderSavedPlannerList() {
      const container = document.getElementById("planner-saved-list-container");
      if (!container) return;

      const list = getSavedPlannerChains();
      updateSavedChainsBadge();

      if (list.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:48px 20px; color:#949BA4; font-size:0.88rem; line-height:1.6;">
            저장된 진화 경로가 없습니다.<br>
            진화 플래너 상단의 <strong style="color:#4ADE80;">[경로 저장]</strong> 버튼을 눌러 나만의 진화 트리를 저장해보세요.
          </div>
        `;
        return;
      }

      container.innerHTML = list.map((item) => {
        const digis = (item.chain || []).map(id => project.digimons[id]).filter(Boolean);
        const flowHtml = digis.map((d, dIdx) => `
          <div style="display:inline-flex; align-items:center; gap:6px; flex-shrink:0;">
            <div style="display:flex; flex-direction:column; align-items:center; background:#1E1F22; border:1px solid #3F4147; border-radius:8px; padding:4px 6px; min-width:58px;" title="${escapeHtml(d.name)} (${escapeHtml(d.stage || '-')})">
              <img src="${encodeURI(d.img || '')}" alt="${escapeHtml(d.name)}" onerror="handleDigiImgError(this, '${escapeHtml(d.name)}', '${escapeHtml(d.img || '')}', '${d.id}')" style="width:28px; height:28px; object-fit:contain;">
              <span style="font-size:0.65rem; color:#F2F3F5; font-weight:600; margin-top:2px; max-width:62px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(d.name)}</span>
            </div>
            ${dIdx < digis.length - 1 ? '<span style="color:#5865F2; font-size:0.8rem; font-weight:bold;">➔</span>' : ''}
          </div>
        `).join('');

        const dimTag = (item.dim && item.dim !== "ALL")
          ? `<span style="font-size:0.68rem; color:#38BDF8; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.3); padding:1px 6px; border-radius:4px;">${escapeHtml(item.dim)}</span>`
          : `<span style="font-size:0.68rem; color:#94A3B8; background:rgba(255,255,255,0.06); padding:1px 6px; border-radius:4px;">전체 DiM</span>`;

        return `
          <div class="planner-saved-card" data-id="${escapeHtml(item.id)}" style="background:#23272A; border:1px solid #3F4147; border-radius:12px; padding:12px 16px; display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.92rem; font-weight:700; color:#FFFFFF;">${escapeHtml(item.name)}</span>
                ${dimTag}
                <span style="font-size:0.7rem; color:#94A3B8;">총 ${digis.length}단계</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.7rem; color:#64748B;">${escapeHtml(item.createdAt || '')}</span>
                <button type="button" class="btn-saved-rename planner-btn-select" data-id="${escapeHtml(item.id)}" style="padding:2px 8px; font-size:0.7rem; background:rgba(255,255,255,0.06); border:1px solid #4E5058; color:#94A3B8;">이름</button>
                <button type="button" class="btn-saved-delete planner-btn-select" data-id="${escapeHtml(item.id)}" style="padding:2px 8px; font-size:0.7rem; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#F87171;">삭제</button>
                <button type="button" class="btn-saved-load planner-btn-select" data-id="${escapeHtml(item.id)}" style="padding:3px 12px; font-size:0.75rem; background:rgba(88,101,242,0.25); border:1px solid #5865F2; color:#FFFFFF; font-weight:700;">불러오기</button>
              </div>
            </div>
            <!-- 디지몬 흐름 미리보기 -->
            <div style="display:flex; align-items:center; gap:6px; overflow-x:auto; padding-bottom:4px;">
              ${flowHtml}
            </div>
          </div>
        `;
      }).join('');

      // 이벤트 바인딩
      container.querySelectorAll(".btn-saved-load").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const target = list.find(x => x.id === id);
          if (!target || !target.chain || target.chain.length === 0) return;

          plannerChain = [...target.chain];
          plannerActiveIndex = plannerChain.length - 1;
          plannerActiveDim = target.dim || "ALL";

          const dimSelect = document.getElementById("planner-filter-dim");
          if (dimSelect) dimSelect.value = plannerActiveDim;

          closeSavedPlannerModal();
          updateEvolutionPlannerUI();
          showToast(`[${target.name}] 경로를 불러왔습니다!`);
        });
      });

      container.querySelectorAll(".btn-saved-rename").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const target = list.find(x => x.id === id);
          if (!target) return;
          let newName = null;
          if (typeof showCustomPrompt === "function") {
            newName = await showCustomPrompt(
              "경로 이름 변경",
              "새로운 경로 이름을 입력해주세요:",
              target.name,
              "경로 이름 입력",
              "",
              true
            );
          } else {
            newName = prompt("변경할 경로 이름을 입력해주세요:", target.name);
          }
          if (newName === null) return;
          const trimmed = newName.trim();
          if (!trimmed) return;
          target.name = trimmed;
          setSavedPlannerChains(list);
          renderSavedPlannerList();
          showToast("경로 이름이 변경되었습니다.");
        });
      });

      container.querySelectorAll(".btn-saved-delete").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const target = list.find(x => x.id === id);
          if (!target) return;
          if (!confirm(`'${target.name}' 경로를 목록에서 삭제하시겠습니까?`)) return;
          const nextList = list.filter(x => x.id !== id);
          setSavedPlannerChains(nextList);
          renderSavedPlannerList();
          showToast("경로가 삭제되었습니다.");
        });
      });
    }

