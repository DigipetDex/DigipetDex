/* 조건 공개 현황판 (DiM별 진화 루트 공개율, 미공개 루트 목록 → 트리 이동/제보) */
    // -------------------------------------------------------------
    // 조건 공개 현황판
    // 집계 단위는 "진화 루트"(A>D, B>D, C>D 는 3개). 디지몬 하나에 여러 루트가 들어올 수 있어서
    // 디지몬 단위로 세면 미공개 루트 수가 가려진다.
    // -------------------------------------------------------------
    let statusBoardOpenDim = null; // 목록이 펼쳐진 DiM

    // 진화 시간만으로 공개되는 세대 (updateDigimonConditionStatus 와 같은 기준) — 집계에서 제외
    const STATUS_BOARD_SKIP_STAGES = ["디지타마", "유년기 I", "유년기 II", "성장기"];

    // 디지몬 하나로 들어오는 루트들과 각 루트의 공개 여부.
    // 관리자가 수동 지정한 conditionStatus(known/unknown)가 있으면 그 디지몬의 모든 루트에 적용.
    function getStatusBoardRoutes(digi) {
      const incoming = (project.evolutions || []).filter(e => e.to === digi.id && project.digimons[e.from]);
      const judge = evo => {
        if (digi.conditionStatus === "known") return true;
        if (digi.conditionStatus === "unknown") return false;
        return isEvoRevealed(evo, digi.stage);
      };
      if (incoming.length === 0) {
        // 들어오는 루트가 없는 디지몬은 자체 조건(req)으로 판정된 결과를 루트 1개로 취급
        return [{ from: null, revealed: !digi.unknownTime }];
      }
      return incoming.map(evo => ({ from: project.digimons[evo.from], revealed: judge(evo) }));
    }

    function collectConditionStats() {
      recalculateAllDigimonConditionStatuses();
      const targets = Object.values(project.digimons || {})
        .filter(d => !STATUS_BOARD_SKIP_STAGES.includes(d.stage))
        .map(d => {
          const routes = getStatusBoardRoutes(d);
          return { digi: d, routes, missing: routes.filter(r => !r.revealed) };
        });

      const summarize = list => {
        const stat = { known: 0, unknown: 0, missingTargets: [] };
        list.forEach(t => {
          stat.known += t.routes.length - t.missing.length;
          stat.unknown += t.missing.length;
          if (t.missing.length > 0) stat.missingTargets.push(t);
        });
        stat.missingTargets.sort((a, b) => {
          const sa = stageOrder.indexOf(a.digi.stage), sb = stageOrder.indexOf(b.digi.stage);
          if (sa !== sb) return sa - sb;
          return (a.digi.order || 0) - (b.digi.order || 0);
        });
        return stat;
      };

      // 전체는 디지몬 단위로 한 번만 센다 (여러 DiM 에 속한 디지몬 중복 방지)
      const total = summarize(targets);
      const perDim = (project.dims || [])
        .map(dim => ({ dim, ...summarize(targets.filter(t => isDigimonVisibleInDim(t.digi, dim))) }))
        .filter(s => s.known + s.unknown > 0);

      return { total, perDim };
    }

    function renderStatusBar(stat) {
      const sum = stat.known + stat.unknown || 1;
      const pct = n => (n / sum * 100).toFixed(1);
      return `
        <div class="status-bar" title="공개 루트 ${stat.known} · 미공개 루트 ${stat.unknown}">
          <span class="status-bar-known" style="width:${pct(stat.known)}%"></span>
          <span class="status-bar-unknown" style="width:${pct(stat.unknown)}%"></span>
        </div>`;
    }

    function statusBoardImg(digi) {
      return `<img src="${encodeURI(digi.img || '')}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;
    }

    function renderMissingTarget(t, dim) {
      const d = t.digi;
      const total = t.routes.length;
      const routeLabel = total > 1
        ? `루트 ${total}개 중 <strong>${t.missing.length}개</strong> 미공개`
        : `조건 미공개`;
      const routes = t.missing.map(r => `
        <div class="status-route-item">
          ${r.from ? `${statusBoardImg(r.from)}<span class="status-route-name">${escapeHtml(r.from.name)} <b>→</b> ${escapeHtml(d.name)}</span>`
                   : `<span class="status-route-name">${escapeHtml(d.name)} 자체 조건</span>`}
          <button type="button" class="status-btn-report" data-id="${escapeHtml(d.id)}" data-from="${r.from ? escapeHtml(r.from.id) : ''}" data-dim="${escapeHtml(dim)}" title="이 루트의 진화 조건 제보하기">제보</button>
        </div>`).join("");
      return `
        <div class="status-missing-item">
          <div class="status-missing-head">
            ${statusBoardImg(d)}
            <div class="status-missing-info">
              <strong>${escapeHtml(d.name)}</strong>
              <span>${escapeHtml(d.stage || '')} · ${routeLabel}</span>
            </div>
            <button type="button" class="status-btn-goto" data-id="${escapeHtml(d.id)}" data-dim="${escapeHtml(dim)}" title="트리에서 이 디지몬 보기">트리에서 보기</button>
          </div>
          <div class="status-route-list">${routes}</div>
        </div>`;
    }

    function renderStatusBoard() {
      const body = document.getElementById("status-board-body");
      if (!body) return;
      const { total, perDim } = collectConditionStats();
      const totalSum = total.known + total.unknown;
      const totalPct = totalSum ? Math.round(total.known / totalSum * 100) : 0;

      const summary = `
        <div class="status-summary">
          <div class="status-summary-head">
            <span>진화 루트 공개율 <strong>${totalPct}%</strong></span>
            <span class="status-legend">
              <span><i class="dot known"></i>공개 ${total.known}</span>
              <span><i class="dot unknown"></i>미공개 ${total.unknown}</span>
              <span>· 조건이 남은 디지몬 ${total.missingTargets.length}종</span>
            </span>
          </div>
          ${renderStatusBar(total)}
          <div class="status-hint">성숙기 이상 진화 루트 기준입니다 (A→D, B→D 는 2개). DiM을 누르면 아직 밝혀지지 않은 루트가 보입니다. 알고 계신 조건이 있다면 제보해 주세요!</div>
        </div>`;

      const rows = perDim.map(stat => {
        const sum = stat.known + stat.unknown;
        const pct = Math.round(stat.known / sum * 100);
        const isOpen = statusBoardOpenDim === stat.dim;
        const done = stat.unknown === 0;
        const list = isOpen ? `
          <div class="status-missing-list">
            ${done ? `<div class="status-done">🎉 이 DiM은 모든 진화 루트의 조건이 공개되었습니다!</div>`
                   : stat.missingTargets.map(t => renderMissingTarget(t, stat.dim)).join("")}
          </div>` : "";
        return `
          <div class="status-dim-row${isOpen ? ' open' : ''}">
            <button type="button" class="status-dim-head" data-dim="${escapeHtml(stat.dim)}">
              <span class="status-dim-name">${isOpen ? '▾' : '▸'} ${escapeHtml(stat.dim)}</span>
              <span class="status-dim-count">${done ? '✅ 완료' : `루트 ${stat.unknown}개 남음`} · <strong>${pct}%</strong></span>
            </button>
            ${renderStatusBar(stat)}
            ${list}
          </div>`;
      }).join("");

      body.innerHTML = summary + `<div class="status-dim-list">${rows}</div>`;

      body.querySelectorAll(".status-dim-head").forEach(btn => {
        btn.addEventListener("click", () => {
          statusBoardOpenDim = statusBoardOpenDim === btn.dataset.dim ? null : btn.dataset.dim;
          renderStatusBoard();
        });
      });
      body.querySelectorAll(".status-btn-goto").forEach(btn => {
        btn.addEventListener("click", () => goToDigimonFromStatusBoard(btn.dataset.id, btn.dataset.dim, null, false));
      });
      body.querySelectorAll(".status-btn-report").forEach(btn => {
        btn.addEventListener("click", () => goToDigimonFromStatusBoard(btn.dataset.id, btn.dataset.dim, btn.dataset.from || null, true));
      });
    }

    // 해당 DiM으로 전환 후 디지몬 선택. fromId 가 있으면 그 루트를 활성화하고, openReport=true 면 제보 창까지 연다.
    function goToDigimonFromStatusBoard(id, dim, fromId, openReport) {
      const digi = project.digimons[id];
      if (!digi) return;
      closeStatusBoardModal();
      if (dim && filterDim !== dim) {
        filterDim = dim;
        const filterSelect = document.getElementById("filter-dim");
        if (filterSelect) filterSelect.value = dim;
      }
      if (fromId) activeIncomingFromId = fromId;
      handleNodeClick(id, dim);
      if (openReport) openReportModalForDigi(digi);
    }

    function openStatusBoardModal() {
      const modal = document.getElementById("status-board-modal");
      if (!modal) return;
      statusBoardOpenDim = null;
      renderStatusBoard();
      modal.style.display = "flex";
    }

    function closeStatusBoardModal() {
      const modal = document.getElementById("status-board-modal");
      if (modal) modal.style.display = "none";
    }

    function initStatusBoard() {
      ["btn-open-status-board", "btn-mobile-status-board"].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener("click", openStatusBoardModal);
      });
      ["status-board-close", "btn-status-board-close-bottom"].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener("click", closeStatusBoardModal);
      });
      const modal = document.getElementById("status-board-modal");
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) closeStatusBoardModal();
        });
      }
    }

    initStatusBoard();
