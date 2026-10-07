/* 전체 디지몬 목록 (이름·이미지·세대·속성·스탯, 정렬/필터/검색, 누르면 트리로 이동) */
    // -------------------------------------------------------------
    // 같은 이름의 디지몬은 스탯·이미지·속성·세대가 공통이라 한 줄로 묶고, 등장 DiM 을 함께 보여 준다.
    // 정렬/필터 선택은 이 브라우저에만 기억한다 (localStorage).
    // -------------------------------------------------------------
    const DIGI_LIST_PREF_KEY = "digipet_digimon_list_prefs";
    const DIGI_LIST_DEFAULT_STAGES = ["궁극체", "궁극체2", "초궁극체", "초궁극체II"];
    const DIGI_LIST_ATTRS = ["vaccine", "data", "virus", "free", "unknown", "none"];
    const DIGI_LIST_ATTR_LABELS = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", unknown: "불명", none: "-" };
    const DIGI_LIST_SORTS = {
      stage: "세대", attr: "속성", name: "이름", hp: "체력", ap: "전투력", spd: "속도", total: "스탯 합계"
    };

    let digiListPrefs = { stages: DIGI_LIST_DEFAULT_STAGES.slice(), attrs: DIGI_LIST_ATTRS.slice(), sort: "stage", desc: false, query: "" };
    try {
      const saved = JSON.parse(localStorage.getItem(DIGI_LIST_PREF_KEY) || "null");
      if (saved && Array.isArray(saved.stages) && Array.isArray(saved.attrs)) digiListPrefs = { ...digiListPrefs, ...saved, query: "" };
    } catch (e) {}

    function saveDigiListPrefs() {
      try { localStorage.setItem(DIGI_LIST_PREF_KEY, JSON.stringify({ ...digiListPrefs, query: "" })); } catch (e) {}
    }

    function statNum(v) {
      if (v === undefined || v === null || String(v).trim() === "") return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    }

    // 이름별로 묶은 목록. 스탯은 값이 들어 있는 항목을 대표로 쓴다.
    function collectDigimonListEntries() {
      const byName = {};
      Object.values(project.digimons || {}).forEach(d => {
        if (!d || !d.name) return;
        const key = d.name.trim();
        (byName[key] = byName[key] || []).push(d);
      });
      return Object.entries(byName).map(([name, list]) => {
        const rep = list.find(d => statNum(d.baseHp) !== null || statNum(d.baseAp) !== null || statNum(d.baseSpd) !== null) || list[0];
        const hp = statNum(rep.baseHp), ap = statNum(rep.baseAp), spd = statNum(rep.baseSpd);
        const dims = [];
        list.forEach(d => String(d.dim || "").split(",").map(s => s.trim()).filter(Boolean).forEach(x => { if (!dims.includes(x)) dims.push(x); }));
        return {
          name, rep, list, dims,
          stage: rep.stage || "", attr: rep.attr || "none",
          hp, ap, spd,
          total: (hp === null && ap === null && spd === null) ? null : (hp || 0) + (ap || 0) + (spd || 0)
        };
      });
    }

    function sortDigimonListEntries(entries) {
      const { sort, desc } = digiListPrefs;
      const dir = desc ? -1 : 1;
      const byName = (a, b) => a.name.localeCompare(b.name, "ko");
      const byStage = (a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
      return entries.sort((a, b) => {
        if (["hp", "ap", "spd", "total"].includes(sort)) {
          // 스탯이 없는 디지몬은 정렬 방향과 상관없이 맨 뒤
          if (a[sort] === null && b[sort] === null) return byName(a, b);
          if (a[sort] === null) return 1;
          if (b[sort] === null) return -1;
          return (a[sort] - b[sort]) * dir || byName(a, b);
        }
        if (sort === "name") return byName(a, b) * dir;
        if (sort === "attr") return ((DIGI_LIST_ATTRS.indexOf(a.attr) - DIGI_LIST_ATTRS.indexOf(b.attr)) * dir) || byStage(a, b) || byName(a, b);
        return (byStage(a, b) * dir) || byName(a, b); // stage
      });
    }

    function renderDigimonList() {
      const body = document.getElementById("digimon-list-body");
      const countEl = document.getElementById("digimon-list-count");
      if (!body) return;

      const q = digiListPrefs.query.trim().toLowerCase();
      const all = collectDigimonListEntries();
      const shown = sortDigimonListEntries(all.filter(e =>
        digiListPrefs.stages.includes(e.stage) &&
        digiListPrefs.attrs.includes(DIGI_LIST_ATTRS.includes(e.attr) ? e.attr : "none") &&
        (!q || e.name.toLowerCase().includes(q))
      ));
      if (countEl) countEl.textContent = `${shown.length}종 / 전체 ${all.length}종`;

      const arrow = key => digiListPrefs.sort === key ? (digiListPrefs.desc ? " ▼" : " ▲") : "";
      const head = `
        <div class="digi-list-row digi-list-head">
          <span></span>
          <button type="button" data-sort="name">이름${arrow("name")}</button>
          <button type="button" data-sort="stage" class="col-stage">세대${arrow("stage")}</button>
          <button type="button" data-sort="attr" class="col-attr">속성${arrow("attr")}</button>
          <button type="button" data-sort="hp" class="col-stat">체력${arrow("hp")}</button>
          <button type="button" data-sort="ap" class="col-stat">전투력${arrow("ap")}</button>
          <button type="button" data-sort="spd" class="col-stat">속도${arrow("spd")}</button>
        </div>`;

      const statCell = (v, cls) => `<span class="col-stat ${cls}${v === null ? " empty" : ""}">${v === null ? "-" : v}</span>`;
      const rows = shown.map(e => {
        const attrKey = DIGI_LIST_ATTRS.includes(e.attr) ? e.attr : "none";
        const icon = typeof attrIconSvg === "function" ? attrIconSvg(attrKey, 18) : "";
        return `
          <div class="digi-list-row" data-id="${escapeHtml(e.rep.id)}" title="${escapeHtml(e.dims.join(", "))}">
            <span class="col-img"><img src="${encodeURI(e.rep.img || "")}" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'"></span>
            <span class="col-name"><strong>${escapeHtml(e.name)}</strong><span class="col-meta">${escapeHtml(e.stage)} · ${icon}${DIGI_LIST_ATTR_LABELS[attrKey]}</span><small>${escapeHtml(e.dims.join(" · "))}</small></span>
            <span class="col-stage">${escapeHtml(e.stage)}</span>
            <span class="col-attr" style="--attr-c:${attrColors[attrKey] || "#888"}">${icon}<em>${DIGI_LIST_ATTR_LABELS[attrKey]}</em></span>
            ${statCell(e.hp, "hp")}${statCell(e.ap, "ap")}${statCell(e.spd, "spd")}
          </div>`;
      }).join("");

      body.innerHTML = head + (rows || `<div class="digi-list-empty">조건에 맞는 디지몬이 없습니다.</div>`);

      body.querySelectorAll(".digi-list-head button").forEach(btn => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.sort;
          if (digiListPrefs.sort === key) digiListPrefs.desc = !digiListPrefs.desc;
          else { digiListPrefs.sort = key; digiListPrefs.desc = ["hp", "ap", "spd", "total"].includes(key); }
          syncDigimonListControls();
          saveDigiListPrefs();
          renderDigimonList();
        });
      });
      body.querySelectorAll(".digi-list-row[data-id]").forEach(row => {
        row.addEventListener("click", () => goToDigimonFromList(row.dataset.id));
      });
    }

    // 디지몬을 누르면 그 디지몬이 있는 DiM 트리로 이동해 선택
    function goToDigimonFromList(id) {
      const digi = project.digimons[id];
      if (!digi) return;
      closeDigimonListModal();
      const dim = String(digi.dim || "").split(",")[0].trim();
      if (dim && filterDim !== dim) {
        filterDim = dim;
        const sel = document.getElementById("filter-dim");
        if (sel) sel.value = dim;
      }
      handleNodeClick(id, dim);
    }

    // 정렬 선택/필터 칩의 표시를 현재 설정에 맞춤
    function syncDigimonListControls() {
      const sortSel = document.getElementById("digimon-list-sort");
      if (sortSel) sortSel.value = digiListPrefs.sort;
      const dirBtn = document.getElementById("digimon-list-dir");
      if (dirBtn) dirBtn.textContent = digiListPrefs.desc ? "▼ 높은순" : "▲ 낮은순";
      document.querySelectorAll("#digimon-list-stage-chips .digi-chip").forEach(c => c.classList.toggle("active", digiListPrefs.stages.includes(c.dataset.stage)));
      document.querySelectorAll("#digimon-list-attr-chips .digi-chip").forEach(c => c.classList.toggle("active", digiListPrefs.attrs.includes(c.dataset.attr)));
    }

    function buildDigimonListControls() {
      const stageWrap = document.getElementById("digimon-list-stage-chips");
      if (stageWrap && !stageWrap.childElementCount) {
        stageWrap.innerHTML = stageOrder.map(s => `<button type="button" class="digi-chip" data-stage="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("");
        stageWrap.querySelectorAll(".digi-chip").forEach(chip => chip.addEventListener("click", () => {
          const s = chip.dataset.stage;
          digiListPrefs.stages = digiListPrefs.stages.includes(s) ? digiListPrefs.stages.filter(x => x !== s) : digiListPrefs.stages.concat(s);
          syncDigimonListControls(); saveDigiListPrefs(); renderDigimonList();
        }));
      }
      const attrWrap = document.getElementById("digimon-list-attr-chips");
      if (attrWrap && !attrWrap.childElementCount) {
        attrWrap.innerHTML = DIGI_LIST_ATTRS.map(a => `<button type="button" class="digi-chip" data-attr="${a}">${typeof attrIconSvg === "function" ? attrIconSvg(a, 14) : ""}${DIGI_LIST_ATTR_LABELS[a] === "-" ? "없음(-)" : DIGI_LIST_ATTR_LABELS[a]}</button>`).join("");
        attrWrap.querySelectorAll(".digi-chip").forEach(chip => chip.addEventListener("click", () => {
          const a = chip.dataset.attr;
          digiListPrefs.attrs = digiListPrefs.attrs.includes(a) ? digiListPrefs.attrs.filter(x => x !== a) : digiListPrefs.attrs.concat(a);
          syncDigimonListControls(); saveDigiListPrefs(); renderDigimonList();
        }));
      }
      const sortSel = document.getElementById("digimon-list-sort");
      if (sortSel && !sortSel.childElementCount) {
        sortSel.innerHTML = Object.entries(DIGI_LIST_SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
      }
    }

    function openDigimonListModal() {
      const modal = document.getElementById("digimon-list-modal");
      if (!modal) return;
      buildDigimonListControls();
      syncDigimonListControls();
      const search = document.getElementById("digimon-list-search");
      if (search) search.value = digiListPrefs.query;
      renderDigimonList();
      modal.style.display = "flex";
    }

    function closeDigimonListModal() {
      const modal = document.getElementById("digimon-list-modal");
      if (modal) modal.style.display = "none";
    }

    function initDigimonList() {
      ["btn-open-digimon-list", "btn-mobile-digimon-list"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", openDigimonListModal);
      });
      ["digimon-list-close", "btn-digimon-list-close-bottom"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", closeDigimonListModal);
      });
      const modal = document.getElementById("digimon-list-modal");
      if (modal) modal.addEventListener("click", e => { if (e.target === modal) closeDigimonListModal(); });

      const sortSel = document.getElementById("digimon-list-sort");
      if (sortSel) sortSel.addEventListener("change", () => {
        digiListPrefs.sort = sortSel.value;
        digiListPrefs.desc = ["hp", "ap", "spd", "total"].includes(sortSel.value); // 스탯은 높은순이 기본
        syncDigimonListControls(); saveDigiListPrefs(); renderDigimonList();
      });
      const dirBtn = document.getElementById("digimon-list-dir");
      if (dirBtn) dirBtn.addEventListener("click", () => {
        digiListPrefs.desc = !digiListPrefs.desc;
        syncDigimonListControls(); saveDigiListPrefs(); renderDigimonList();
      });
      const search = document.getElementById("digimon-list-search");
      if (search) search.addEventListener("input", () => { digiListPrefs.query = search.value; renderDigimonList(); });
      const reset = document.getElementById("digimon-list-reset");
      if (reset) reset.addEventListener("click", () => {
        digiListPrefs = { stages: DIGI_LIST_DEFAULT_STAGES.slice(), attrs: DIGI_LIST_ATTRS.slice(), sort: "stage", desc: false, query: "" };
        if (search) search.value = "";
        syncDigimonListControls(); saveDigiListPrefs(); renderDigimonList();
      });
    }

    initDigimonList();
