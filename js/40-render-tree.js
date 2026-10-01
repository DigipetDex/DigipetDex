/* 진화 트리 캔버스 렌더링 (renderTree 등) */
    // -------------------------------------------------------------------------
    // 2. 캔버스 렌더링
    // -------------------------------------------------------------------------
    const stagesLayout = document.getElementById("stages-layout");
    const svgLayer = document.getElementById("svg-layer");

    // 세대 컬럼 DOM 생성 모듈화 함수
    function createStageColumn(stageName, digis, dimContext) {
      const col = document.createElement("div");
      col.className = "stage-col";
      col.innerHTML = `
        <div class="stage-title">${stageName} (${digis.length})</div>
        <div class="nodes-list" id="col-${cleanDimId(dimContext)}-${stageName}" data-stage="${stageName}" data-dim="${dimContext}"></div>
      `;

      const listEl = col.querySelector(".nodes-list");

      // 빈 컬럼 영역에 드롭 (세대 변경) - 에디터 모드에서만 활성화
      if (!isViewerMode) {
        listEl.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          listEl.classList.add("drag-over");
        });
        listEl.addEventListener("dragleave", (e) => {
          if (!listEl.contains(e.relatedTarget)) {
            listEl.classList.remove("drag-over");
          }
        });
        listEl.addEventListener("drop", (e) => {
          e.preventDefault();
          listEl.classList.remove("drag-over");
          if (!draggedId || !project.digimons[draggedId]) return;
          if (e.ctrlKey || isCtrlKeyDown) return;

          if (e.target === listEl || e.target.closest(".card-node") === null) {
            moveDigimonToStage(draggedId, stageName, null, "end");
          }
        });
      }

      digis.forEach(digi => {
        const card = document.createElement("div");
        const isConnectSource = connectFromId === digi.id;
        const isUnknownTime = Boolean(digi.unknownTime);
        const isPartialUnknown = Boolean(digi.partialUnknown);
        const isSelected = selectedDigiId === digi.id;
        const isNextTarget = Boolean(selectedDigiId && project.evolutions.some(e => e.from === selectedDigiId && e.to === digi.id));
        const isPrevSource = Boolean(selectedDigiId && project.evolutions.some(e => e.to === selectedDigiId && e.from === digi.id));
        const isDimmed = Boolean(selectedDigiId && !isSelected && !isNextTarget && !isPrevSource);

        card.className = `card-node ${isSelected ? "selected" : ""} ${isNextTarget ? "evo-next-target" : ""} ${isPrevSource ? "evo-prev-source" : ""} ${isDimmed ? "dimmed" : ""} ${isConnectSource ? "connect-source" : ""} ${isUnknownTime ? "unknown-time" : ""} ${isPartialUnknown ? "partial-unknown" : ""}`;
        card.id = `node-${digi.id}-${cleanDimId(dimContext)}`;
        card.dataset.id = digi.id;
        card.dataset.stage = stageName;
        card.dataset.dim = dimContext;
        card.draggable = !isViewerMode;

        card.innerHTML = `
          ${isSelected ? `<span class="node-flow-tag tag-selected">★ 선택</span>` : ''}
          ${isNextTarget ? `<span class="node-flow-tag tag-next">➔ 진화</span>` : ''}
          ${isPrevSource && !isNextTarget ? `<span class="node-flow-tag tag-prev">이전 ➔</span>` : ''}
          <div class="sprite-frame attr-${digi.attr}">
            <img src="${encodeURI(digi.img || '')}" alt="${escapeHtml(digi.name)}" draggable="false" onerror="handleDigiImgError(this, '${escapeHtml(digi.name)}', '${escapeHtml(digi.img || '')}', '${digi.id}')">
            ${isPartialUnknown ? `
              <div class="diagonal-split-overlay">
                <img src="${encodeURI(digi.img || '')}" class="diagonal-gray-img" draggable="false" onerror="this.style.display='none'">
              </div>
              <div class="diagonal-split-divider"></div>
            ` : ''}
          </div>
          <div class="card-name">${escapeHtml(digi.name)}</div>
        `;

        card.addEventListener("click", () => handleNodeClick(digi.id, dimContext));

        if (!isViewerMode) {
          card.addEventListener("dragstart", (e) => {
            draggedId = digi.id;
            card.classList.add("dragging");
            e.dataTransfer.setData("text/plain", digi.id);
            e.dataTransfer.effectAllowed = "all";
          });

          card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            clearDropIndicators();
            draggedId = null;
          });

          card.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (draggedId === digi.id) return;

            const isCtrl = e.ctrlKey || isCtrlKeyDown;
            if (isCtrl) {
              e.dataTransfer.dropEffect = "link";
              clearDropIndicators();
              card.classList.add("connect-drop-target");
              return;
            }

            e.dataTransfer.dropEffect = "move";
            const rect = card.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            clearDropIndicators();

            if (relY < rect.height / 2) {
              card.classList.add("drop-before");
            } else {
              card.classList.add("drop-after");
            }
          });

          card.addEventListener("dragleave", (e) => {
            if (!card.contains(e.relatedTarget)) {
              card.classList.remove("drop-before", "drop-after", "connect-drop-target");
            }
          });

          card.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearDropIndicators();
            listEl.classList.remove("drag-over");

            if (!draggedId || !project.digimons[draggedId]) return;

            const isCtrl = e.ctrlKey || isCtrlKeyDown;
            if (isCtrl) {
              if (draggedId === digi.id) {
                showToast("자기 자신에게는 진화선을 연결할 수 없습니다.", true);
                return;
              }
              const fromId = draggedId;
              const toId = digi.id;
              const exists = project.evolutions.some(ev => ev.from === fromId && ev.to === toId);
              if (exists) {
                showToast("이미 연결된 진화 라인입니다.", true);
                return;
              }
              const srcDigi = project.digimons[fromId];
              const tgtDigi = project.digimons[toId];
              const stageDefault = getDefaultReqForStage(tgtDigi?.stage);
              const newLink = {
                from: fromId,
                to: toId,
                lineColor: (srcDigi && srcDigi.lineColor) ? srcDigi.lineColor : undefined,
                ...stageDefault
              };
              project.evolutions.push(newLink);
              saveState();
              selectedDigiId = toId;
              activeIncomingFromId = fromId;
              showToast(`'${srcDigi?.name || fromId}' ➔ '${tgtDigi?.name || toId}' 진화 라인을 연결했습니다.`);
              renderTree();
              updateSidebar();
              return;
            }

            if (draggedId === digi.id) return;

            const rect = card.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const position = relY < rect.height / 2 ? "before" : "after";

            moveDigimonToStage(draggedId, stageName, digi.id, position);
          });
        }

        listEl.appendChild(card);
      });

      return col;
    }

    // DiM별 메타데이터 (등장 지역 등) 안전 조회 헬퍼
    function getDimLocation(dimName) {
      if (!dimName || !project.dimMeta) return "";
      if (project.dimMeta[dimName] && project.dimMeta[dimName].location) {
        return project.dimMeta[dimName].location;
      }
      const dimLower = dimName.trim().toLowerCase();
      const directKey = Object.keys(project.dimMeta).find(k => k.trim().toLowerCase() === dimLower);
      if (directKey && project.dimMeta[directKey].location) {
        return project.dimMeta[directKey].location;
      }
      return "";
    }

    function renderTree() {
      recalculateAllDigimonConditionStatuses();
      stagesLayout.innerHTML = "";
      updateDimFilterOptions();

      if (!filterDim && project.dims && project.dims.length > 0) {
        filterDim = project.dims[0];
      }
      if (!filterDim) return;

      const sectionEl = document.createElement("div");
      sectionEl.className = "dim-tree-section";
      sectionEl.dataset.dim = filterDim;

      sectionEl.innerHTML = `
        <div class="dim-section-header" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="dim-title-badge" title="더블 클릭하여 DiM 이름 변경" style="cursor:pointer;">${escapeHtml(filterDim)}</span>
          <button class="btn-rename-dim-inline editor-only" data-dim="${filterDim.replace(/"/g,'&quot;')}" style="background:none; border:none; color:rgba(255,255,255,0.7); cursor:pointer; font-size:0.8rem; padding:2px 4px; display:inline-flex; align-items:center;" title="이 DiM 이름 변경">✏️</button>
          <input
            class="dim-location-input editor-only"
            data-dim="${filterDim.replace(/"/g,'&quot;')}"
            type="text"
            placeholder="등장 지역 입력..."
            value="${escapeHtml(getDimLocation(filterDim))}"
            style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.18); color:#fff; border-radius:6px; padding:3px 10px; font-size:0.8rem; min-width:140px; max-width:260px; outline:none;"
          >
          ${getDimLocation(filterDim)
            ? `<span class="viewer-only" style="font-size:0.8rem; color:#94A3B8; font-weight:400;">📍 ${escapeHtml(getDimLocation(filterDim))}</span>`
            : ''}
        </div>
        <div class="dim-stages-row"></div>
      `;
      stagesLayout.appendChild(sectionEl);

      const rowEl = sectionEl.querySelector(".dim-stages-row");

      const totalInDim = Object.values(project.digimons).filter(d => isDigimonVisibleInDim(d, filterDim)).length;
      if (totalInDim === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "dim-empty-notice";
        emptyMsg.style.cssText = "padding:40px 20px; color:#94A3B8; font-size:0.95rem; text-align:center; width:100%;";
        emptyMsg.innerHTML = `
          <div style="font-size:1.1rem; font-weight:600; color:#E2E8F0; margin-bottom:8px;">'${escapeHtml(filterDim)}' DiM에 등록된 디지몬이 없습니다.</div>
          ${!isViewerMode ? `<button class="btn-primary" onclick="document.getElementById('btn-add-digimon').click()" style="padding:6px 14px; font-size:0.85rem; margin-top:8px; cursor:pointer;">+ 새 디지몬 추가</button>` : ''}
        `;
        rowEl.appendChild(emptyMsg);
      } else {
        stageOrder.forEach(stageName => {
          let digis = Object.values(project.digimons).filter(d => {
            if (d.stage !== stageName) return false;
            return isDigimonVisibleInDim(d, filterDim);
          });

          digis.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          if (digis.length === 0 && !["디지타마", "유년기 I", "유년기 II", "성장기", "성숙기", "완전체", "궁극체"].includes(stageName)) return;

          const col = createStageColumn(stageName, digis, filterDim);
          rowEl.appendChild(col);
        });
      }

      requestAnimationFrame(() => {
        drawConnections();
      });
    }

    // DIM 지역 입력 및 인라인 이름 변경 이벤트 위임 (캔버스에서 동적 생성되는 요소 처리)
    document.getElementById("stages-layout").addEventListener("input", (e) => {
      if (!e.target.classList.contains("dim-location-input")) return;
      const dimName = e.target.dataset.dim;
      if (!dimName) return;
      if (!project.dimMeta) project.dimMeta = {};
      if (!project.dimMeta[dimName]) project.dimMeta[dimName] = {};
      project.dimMeta[dimName].location = e.target.value;
      saveState();
    });

    document.getElementById("stages-layout").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-rename-dim-inline");
      if (btn) {
        e.stopPropagation();
        const dim = btn.dataset.dim;
        if (dim) renameDim(dim);
      }
    });

    document.getElementById("stages-layout").addEventListener("dblclick", (e) => {
      const span = e.target.closest(".dim-title-badge");
      if (span) {
        e.stopPropagation();
        const dimSec = span.closest(".dim-tree-section");
        const dim = dimSec?.dataset?.dim;
        if (dim) renameDim(dim);
      }
    });


    let lineStyle = localStorage.getItem("digipet_line_style") || "step";

    function updateLineStyleButton() {
      const btn = document.getElementById("btn-toggle-line-style");
      if (btn) {
        btn.innerHTML = lineStyle === "step" ? "직각선" : "곡선";
        btn.title = lineStyle === "step" ? "현재: 직각 연결선 (클릭 시 곡선 전환)" : "현재: 곡선 연결선 (클릭 시 직각선 전환)";
      }
    }

    // 다중 DiM 섹션 간 최적의 진화선 노드 쌍 탐색
    function findBestNodePair(fromId, toId) {
      const fromEls = Array.from(document.querySelectorAll(`.card-node[data-id="${fromId}"]`));
      const toEls = Array.from(document.querySelectorAll(`.card-node[data-id="${toId}"]`));
      if (fromEls.length === 0 || toEls.length === 0) return null;

      // 1. 같은 DiM 섹션 안에 둘 다 있는 쌍 우선 매칭
      for (const f of fromEls) {
        const fDim = f.closest(".dim-tree-section")?.dataset?.dim;
        for (const t of toEls) {
          const tDim = t.closest(".dim-tree-section")?.dataset?.dim;
          if (fDim && tDim && fDim === tDim) {
            return { fromEl: f, toEl: t };
          }
        }
      }

      // 2. 조그레스 등 교차 DiM인 경우 물리적 거리가 가장 가까운 쌍 매칭
      let bestPair = { fromEl: fromEls[0], toEl: toEls[0] };
      let minDistance = Infinity;

      fromEls.forEach(f => {
        const fRect = f.getBoundingClientRect();
        toEls.forEach(t => {
          const tRect = t.getBoundingClientRect();
          const dist = Math.hypot(tRect.left - fRect.left, tRect.top - fRect.top);
          if (dist < minDistance) {
            minDistance = dist;
            bestPair = { fromEl: f, toEl: t };
          }
        });
      });

      return bestPair;
    }

    // 조그레스 텍스트에서 쉼표(,)로 구분된 디지몬 목록 파싱
    function parseJogressNames(raw) {
      if (!raw || typeof raw !== "string") return [];
      const trimmed = raw.trim();
      if (!trimmed || trimmed === "-" || trimmed === "없음") return [];
      return trimmed.split(",").map(s => s.trim()).filter(s => s && s !== "-" && s !== "없음");
    }

    // 각 진화 분기선별 정확한 조그레스 파트너 산출 함수
    // ※ 주의: 조그레스 입력칸(evo.jogress 또는 toDigi.req.jogress)에 명시된 경우에만 조그레스로 판정합니다!
    // 쉼표(,)로 여러 마리를 지정한 경우 본인 이름을 제외한 상대 파트너를 자동으로 매칭합니다.
    function getEvolutionJogressPartner(evo) {
      if (!evo) return "";
      const toDigi = project.digimons[evo.to];
      const fromDigi = project.digimons[evo.from];
      const fromName = (fromDigi?.name || "").trim().toLowerCase();

      // 1. 진화선 자체에 조그레스 파트너가 명시된 경우
      const evoJogressList = parseJogressNames(evo.jogress);
      if (evoJogressList.length > 0) {
        const partner = evoJogressList.find(n => n.toLowerCase() !== fromName);
        if (partner) return partner;

        const otherParent = project.evolutions.find(e => e.to === evo.to && e.from !== evo.from);
        if (otherParent && project.digimons[otherParent.from]) {
          const pName = project.digimons[otherParent.from].name?.trim();
          if (pName && pName.toLowerCase() !== fromName) return pName;
        }
      }

      // 2. 도착 디지몬(toDigi)의 진화 조건에 조그레스가 명시된 경우 (쉼표로 복수 지정 지원)
      const toJogressList = parseJogressNames(toDigi?.req?.jogress);
      if (toJogressList.length > 0) {
        // 본인 이름을 제외한 상대 파트너 반환 (예: '시리우스몬, 아크투루스몬' -> 시리우스몬 진화선에선 아크투루스몬 반환)
        const partner = toJogressList.find(n => n.toLowerCase() !== fromName);
        if (partner) return partner;

        const otherParent = project.evolutions.find(e => e.to === evo.to && e.from !== evo.from);
        if (otherParent && project.digimons[otherParent.from]) {
          const pName = project.digimons[otherParent.from].name?.trim();
          if (pName && pName.toLowerCase() !== fromName) return pName;
        }
      }

      return "";
    }

    // 우측 패널 조그레스 파트너 미리보기 칩 렌더러 (쉼표로 구분된 복수 파트너 지원)
    function renderJogressPreviewChips(container, rawJogressText) {
      if (!container) return;
      const names = parseJogressNames(rawJogressText);
      if (names.length === 0) {
        container.innerHTML = "";
        return;
      }

      container.innerHTML = `
        <div style="font-size:0.72rem; color:var(--text-sub); margin-bottom:4px;">조그레스 상대 (${names.length}마리, 클릭 시 이동)</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${names.map(name => {
            const partner = findDigimonByNameOrId(name);
            if (partner) {
              return `
                <div class="jogress-sidebar-chip" data-id="${partner.id}" title="클릭하여 [${partner.name}] 도감으로 이동">
                  <img src="${encodeURI(partner.img || '')}" class="jogress-chip-img" onerror="handleDigiImgError(this, '${escapeHtml(partner.name)}', '${escapeHtml(partner.img || '')}', '${partner.id}')">
                  <div style="flex:1;">
                    <div style="font-weight:700; color:#fff; font-size:0.82rem;">${partner.name} <span style="font-size:0.7rem; color:#aaa;">(${partner.stage})</span></div>
                  </div>
                  <span style="font-size:0.85rem; color:var(--primary); font-weight:bold;">➔</span>
                </div>
              `;
            } else {
              return `
                <div style="font-size:0.72rem; color:var(--text-sub); padding:4px 0;">
                  '${escapeHtml(name)}' (도감에 동일한 이름이 등록되면 이미지가 표시됩니다)
                </div>
              `;
            }
          }).join("")}
        </div>
      `;

      container.querySelectorAll(".jogress-sidebar-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          const id = chip.dataset.id;
          if (id) {
            const p = project.digimons[id];
            navigateToDigimon(id, `조그레스 상대 [<strong>${p ? p.name : id}</strong>](으)로 이동했습니다!`);
          }
        });
      });
    }

    function drawConnections() {
      svgLayer.innerHTML = "";
      const jogressLayer = document.getElementById("jogress-layer");
      if (jogressLayer) jogressLayer.innerHTML = "";

      const worldRect = document.getElementById("tree-world").getBoundingClientRect();
      const renderedJogress = new Set();

      project.evolutions.forEach(evo => {
        const pair = findBestNodePair(evo.from, evo.to);
        if (!pair) return;
        const { fromEl, toEl } = pair;
        if (!fromEl || !toEl) return;

        const fromBox = fromEl.querySelector(".sprite-frame").getBoundingClientRect();
        const toBox = toEl.querySelector(".sprite-frame").getBoundingClientRect();

        const x1 = (fromBox.right - worldRect.left) / currentScale;
        const y1 = (fromBox.top + fromBox.height / 2 - worldRect.top) / currentScale;
        const x2 = (toBox.left - worldRect.left) / currentScale;
        const y2 = (toBox.top + toBox.height / 2 - worldRect.top) / currentScale;

        const toDigi = project.digimons[evo.to];
        const jogressVal = getEvolutionJogressPartner(evo);
        // 조그레스 입력칸에 직접 명시된 경우에만 조그레스로 판정 (일반 다중 진화 루트 오인 방지)
        const hasJogress = Boolean(jogressVal && jogressVal !== "-" && jogressVal !== "없음");

        const partner = hasJogress ? findDigimonByNameOrId(jogressVal) : null;
        const toDimSection = toEl.closest(".dim-tree-section");
        const isPartnerInSameDim = Boolean(
          hasJogress && (
            (partner && toDimSection && toDimSection.querySelector(`.card-node[data-id="${partner.id}"]`)) ||
            (toDimSection && toDimSection.querySelector(`.card-node[data-name="${jogressVal}"]`)) ||
            (!toDimSection && partner && document.querySelector(`.card-node[data-id="${partner.id}"]`))
          )
        );

        const fromDigi = project.digimons[evo.from];
        const defaultColor = attrColors[fromDigi ? fromDigi.attr : "free"] || "#888";
        // 개별 분기선 지정 색상(evo.lineColor) 우선, 없으면 출발 디지몬 색상(fromDigi.lineColor), 없으면 기본 속성색
        const strokeColor = evo.lineColor || (fromDigi && fromDigi.lineColor) || defaultColor;

        let targetX = x2;
        let boxLeft = 0, boxRight = 0, boxTop = 0, boxWidth = 54, boxHeight = 38;

        if (hasJogress && !isPartnerInSameDim) {
          const boxMargin = 6;
          boxRight = x2 - boxMargin;
          boxLeft = boxRight - boxWidth;
          boxTop = y2 - boxHeight / 2;
          targetX = boxLeft;
        }

        let pathData = "";
        if (lineStyle === "step") {
          if (Math.abs(y1 - y2) < 2) {
            pathData = `M ${x1} ${y1} L ${targetX} ${y2}`;
          } else {
            const midX = (x1 + targetX) / 2;
            const r = Math.min(8, Math.abs(midX - x1) * 0.7, Math.abs(y2 - y1) / 2);
            const dirY = y2 > y1 ? 1 : -1;
            pathData = `M ${x1} ${y1} ` +
                       `L ${midX - r} ${y1} ` +
                       `Q ${midX} ${y1}, ${midX} ${y1 + dirY * r} ` +
                       `L ${midX} ${y2 - dirY * r} ` +
                       `Q ${midX} ${y2}, ${midX + r} ${y2} ` +
                       `L ${targetX} ${y2}`;
          }
        } else {
          const dx = Math.max((targetX - x1) * 0.5, 15);
          pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${targetX - dx} ${y2}, ${targetX} ${y2}`;
        }

        const isOutgoing = Boolean(selectedDigiId && evo.from === selectedDigiId);
        const isIncoming = Boolean(selectedDigiId && evo.to === selectedDigiId);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        let pathClass = "branch-path";
        if (selectedDigiId) {
          if (isOutgoing) {
            pathClass += " active active-outgoing";
          } else if (isIncoming) {
            pathClass += " active active-incoming";
          } else {
            pathClass += " dimmed";
          }
        }
        path.setAttribute("class", pathClass);
        path.setAttribute("stroke", strokeColor);
        path.dataset.from = evo.from;
        path.dataset.to = evo.to;
        path.setAttribute("title", `클릭하여 [${fromDigi?.name || evo.from} ➔ ${toDigi?.name || evo.to}] 진화선 선택`);

        path.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedDigiId = evo.to;
          activeIncomingFromId = evo.from;
          renderTree();
          updateSidebar();
          const fName = fromDigi?.name || evo.from;
          const tName = toDigi?.name || evo.to;
          showToast(`[${fName} ➔ ${tName}] 진화 루트가 선택되었습니다.<br>우측 패널에서 이 루트의 달성 조건을 확인 및 편집할 수 있습니다.`);
        });

        svgLayer.appendChild(path);

        // 도착 지점 방향 화살표 (Arrowhead) 생성
        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const aSize = 6;
        arrow.setAttribute("points", `${targetX},${y2} ${targetX - aSize * 1.6},${y2 - aSize} ${targetX - aSize * 1.6},${y2 + aSize}`);
        arrow.setAttribute("fill", strokeColor);
        let arrowClass = "branch-arrow";
        if (selectedDigiId) {
          if (isOutgoing) arrowClass += " active-outgoing";
          else if (isIncoming) arrowClass += " active-incoming";
          else arrowClass += " dimmed";
        }
        arrow.setAttribute("class", arrowClass);
        svgLayer.appendChild(arrow);

        // 조그레스 렌더링 (동일 DiM 조그레스는 JOGRESS 텍스트 뱃지, 타 DiM 조그레스는 파트너 박스)
        if (hasJogress && !renderedJogress.has(toEl)) {
          renderedJogress.add(toEl);

          if (isPartnerInSameDim) {
            // 동일 DiM 내 합체 진화인 경우: 합류 지점에 컴팩트한 JOGRESS 뱃지만 노출
            if (jogressLayer) {
              const badgeEl = document.createElement("div");
              badgeEl.className = "jogress-badge-pill";
              badgeEl.style.left = `${x2 - 30}px`;
              badgeEl.style.top = `${y2}px`;
              badgeEl.title = partner ? `동일 DiM 조그레스: ${partner.name}` : `동일 DiM 조그레스`;
              badgeEl.innerHTML = `JOGRESS`;
              if (partner) {
                badgeEl.style.cursor = "pointer";
                badgeEl.addEventListener("click", (e) => {
                  e.stopPropagation();
                  navigateToDigimon(partner.id, `조그레스 상대 [<strong>${partner.name}</strong>](으)로 이동했습니다!`);
                });
              }
              jogressLayer.appendChild(badgeEl);
            }
          } else {
            // 타 DiM 파트너와의 조그레스인 경우: 박스 및 도착선(boxRight -> x2) 렌더링
            const exitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            exitPath.setAttribute("d", `M ${boxRight} ${y2} L ${x2} ${y2}`);
            let exitClass = "branch-path";
            if (selectedDigiId) {
              if (isOutgoing) exitClass += " active active-outgoing";
              else if (isIncoming) exitClass += " active active-incoming";
              else exitClass += " dimmed";
            }
            exitPath.setAttribute("class", exitClass);
            exitPath.setAttribute("stroke", strokeColor);
            svgLayer.appendChild(exitPath);

            const jogressArrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            jogressArrow.setAttribute("points", `${x2},${y2} ${x2 - aSize * 1.6},${y2 - aSize} ${x2 - aSize * 1.6},${y2 + aSize}`);
            jogressArrow.setAttribute("fill", strokeColor);
            let jogressArrowClass = "branch-arrow";
            if (selectedDigiId) {
              if (isOutgoing) jogressArrowClass += " active-outgoing";
              else if (isIncoming) jogressArrowClass += " active-incoming";
              else jogressArrowClass += " dimmed";
            }
            jogressArrow.setAttribute("class", jogressArrowClass);
            svgLayer.appendChild(jogressArrow);

            // 조그레스 상대 개체 박스 엘리먼트 생성 (이름과 이미지만 표시)
            if (jogressLayer) {
              const boxEl = document.createElement("div");
              boxEl.className = "jogress-node-box";
              boxEl.style.left = `${boxLeft}px`;
              boxEl.style.top = `${boxTop}px`;
              boxEl.style.width = `${boxWidth}px`;
              boxEl.style.height = `${boxHeight}px`;
              boxEl.style.borderColor = strokeColor;

              if (partner) {
                boxEl.title = `조그레스 파트너: ${partner.name}\n클릭하여 [${partner.name}] 도감으로 이동합니다.`;
                boxEl.innerHTML = `
                  <img class="jogress-partner-sprite" src="${encodeURI(partner.img || '')}" alt="${escapeHtml(partner.name)}" onerror="handleDigiImgError(this, '${escapeHtml(partner.name)}', '${escapeHtml(partner.img || '')}', '${partner.id}')">
                  <span class="jogress-partner-name-txt">${partner.name}</span>
                `;
                boxEl.addEventListener("click", (e) => {
                  e.stopPropagation();
                  navigateToDigimon(partner.id, `조그레스 상대 [<strong>${partner.name}</strong>](으)로 이동했습니다!`);
                });
              } else {
                boxEl.title = `미등록 개체: ${jogressVal}\n(도감에 동일한 이름이 등록되면 이미지가 표시됩니다)`;
                boxEl.innerHTML = `
                  
                  <span class="jogress-partner-name-txt" title="${jogressVal}">${jogressVal}</span>
                `;
                boxEl.addEventListener("click", (e) => {
                  e.stopPropagation();
                  showToast(`'${jogressVal}' 디지몬이 아직 도감에 등록되지 않았습니다.`, "warn");
                });
              }
              jogressLayer.appendChild(boxEl);
            }
          }
        }
      });
    }

    function showToast(msg, type = "success") {
      let toast = document.getElementById("global-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "global-toast";
        toast.className = "toast-msg";
        document.body.appendChild(toast);
      }
      toast.className = `toast-msg ${type === "warn" ? "warn" : ""} show`;
      toast.innerHTML = msg;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.classList.remove("show");
      }, 1600);
    }

