/* 전투 시뮬레이터 (프로토타입: 추정 모델로 1,000/5,000회 모의 전투, 연산은 브라우저에서) */
    // -------------------------------------------------------------
    // 계산식은 디스코드 전투 로그를 모아 역산한 추정치다 (계산/전투 공식 정리.md, 계산/sim/sim.js 와 같은 값).
    // 데미지: round((k*전투력 + c) * (1 + dRel*상성) * 100/(100 + g*(방어자 체력-100))) ± spread
    // 명중:   h0 + h1 * 100 * 내속/(내속+상대속) + hRel * 상성 + hMirror * 같은 종
    // 선공:   속도가 높은 쪽, 같으면 무작위
    // -------------------------------------------------------------
    const BSIM_MODEL = { k: 0.8748, c: -3.17, dRel: 0.049, g: 0.05, spread: 4, h0: 32.75, h1: 0.87, hRel: 6.2, hMirror: -8.6 };
    const BSIM_PREF_KEY = "digipet_battle_sim_v1";
    // 훈련 1회당 오르는 수치 (성공 / 대성공)
    const BSIM_TRAIN = { hp: [15, 25], ap: [5, 10], spd: [5, 10] };
    const BSIM_STAT_LABELS = { hp: "체력", ap: "전투력", spd: "속도" };
    const BSIM_BEATS = { vaccine: "virus", virus: "data", data: "vaccine" };
    // 문장 (성장기부터 발현). 전투 화면 스탯에 이미 들어가는지, 소수점 처리(일단 버림)는 미확인
    // mul: 항상 적용되는 배율, hope: 체력 50% 이하일 때 전투력·속도 배율. 나머지 문장은 정규전에 영향 없음
    const BSIM_CRESTS = {
      "": { label: "없음" },
      courage: { label: "용기 (전투력 +5%)", mul: { ap: 1.05 } },
      friendship: { label: "우정 (속도 +5%)", mul: { spd: 1.05 } },
      miracles: { label: "기적 (체력 +5%)", mul: { hp: 1.05 } },
      love: { label: "사랑 (우호도 90 이상 가정, 모든 능력치 +3%)", mul: { hp: 1.03, ap: 1.03, spd: 1.03 } },
      hope: { label: "희망 (체력 50% 이하에서 전투력·속도 +3%)", hope: 1.03 },
      other: { label: "그 외 (순수·지식·성실·친절·빛: 전투 영향 없음)" },
    };

    // 상성: 백신>바이러스>데이터>백신, 프리는 전부 중립, 불명은 백신·바이러스·데이터에 유리
    function bsimRelation(a, d) {
      if (!a || !d || a === d || a === "free" || d === "free" || a === "none" || d === "none") return 0;
      if (a === "unknown") return 1;
      if (d === "unknown") return -1;
      if (BSIM_BEATS[a] === d) return 1;
      if (BSIM_BEATS[d] === a) return -1;
      return 0;
    }

    function bsimHitP(A, D, m = BSIM_MODEL) {
      const mirror = A.name && A.name === D.name ? 1 : 0;
      const p = m.h0 + m.h1 * 100 * A.spd / (A.spd + D.spd) + m.hRel * bsimRelation(A.attr, D.attr) + m.hMirror * mirror;
      return Math.min(100, Math.max(0, p)) / 100;
    }

    function bsimBaseDmg(A, D, m = BSIM_MODEL) {
      return Math.max(1, Math.round((m.k * A.ap + m.c) * (1 + m.dRel * bsimRelation(A.attr, D.attr)) * 100 / (100 + m.g * (D.hp - 100))));
    }

    // 1회 전투. 반환: { w: "A"|"B"|"D", turns }
    // pa·pb: [A희망][B희망] 명중률, da: [A희망] 데미지, db: [B희망] 데미지 (희망 아니면 두 칸이 같음)
    function bsimFight(A, B, pa, pb, da, db, m = BSIM_MODEL) {
      let ha = A.hp, hb = B.hp;
      const ia = () => (A.hope && ha * 2 <= A.hp ? 1 : 0), ib = () => (B.hope && hb * 2 <= B.hp ? 1 : 0);
      const aFirst = A.spd > B.spd || (A.spd === B.spd && Math.random() < 0.5);
      const roll = () => Math.floor(Math.random() * (2 * m.spread + 1)) - m.spread;
      for (let t = 1; t <= 500; t++) {
        for (const side of aFirst ? "AB" : "BA") {
          if (side === "A") { if (Math.random() < pa[ia()][ib()]) hb -= Math.max(1, da[ia()] + roll()); if (hb <= 0) return { w: "A", turns: t }; }
          else { if (Math.random() < pb[ia()][ib()]) ha -= Math.max(1, db[ib()] + roll()); if (ha <= 0) return { w: "B", turns: t }; }
        }
      }
      return { w: "D", turns: 500 };
    }

    function bsimRun(A, B, n) {
      const pa = [0, 1].map(i => [0, 1].map(j => bsimHitP(bsimHope(A, i), bsimHope(B, j))));
      const pb = [0, 1].map(i => [0, 1].map(j => bsimHitP(bsimHope(B, j), bsimHope(A, i))));
      const da = [0, 1].map(i => bsimBaseDmg(bsimHope(A, i), B)), db = [0, 1].map(j => bsimBaseDmg(bsimHope(B, j), A));
      let wa = 0, wb = 0, dr = 0, turns = 0;
      for (let i = 0; i < n; i++) {
        const r = bsimFight(A, B, pa, pb, da, db);
        if (r.w === "A") wa++; else if (r.w === "B") wb++; else dr++;
        turns += r.turns;
      }
      return { n, wa, wb, dr, turns: turns / n };
    }

    // 희망 발동 상태의 스탯 (on=0이면 그대로)
    function bsimHope(X, on) {
      if (!on || !X.hope) return X;
      return { ...X, ap: Math.floor(X.ap * X.hope), spd: Math.floor(X.spd * X.hope) };
    }

    // 최종 스탯에 문장 배율 적용
    function bsimApplyCrest(f, crest) {
      const c = BSIM_CRESTS[crest] || BSIM_CRESTS[""];
      f.crest = crest || "";
      if (c.mul) Object.keys(c.mul).forEach(k => { f[k] = Math.floor(f[k] * c.mul[k]); });
      if (c.hope) f.hope = c.hope;
      return f;
    }

    // ---------- 입력 상태 ----------
    // manual: 스탯 직접 입력 (켜면 종족값·훈련 대신 이 값을 그대로 씀)
    const bsimEmptySide = () => ({ name: "", crest: "", train: { hp: [0, 0], ap: [0, 0], spd: [0, 0] }, manual: { on: false, hp: 100, ap: 20, spd: 40, attr: "vaccine" } });
    let bsimState = { A: bsimEmptySide(), B: bsimEmptySide() };
    try {
      const saved = JSON.parse(localStorage.getItem(BSIM_PREF_KEY) || "null");
      if (saved && saved.A && saved.B) {
        ["A", "B"].forEach(k => { saved[k].manual = { ...bsimEmptySide().manual, ...(saved[k].manual || {}) }; });
        bsimState = saved;
      }
    } catch (e) {}
    function saveBsimState() {
      try { localStorage.setItem(BSIM_PREF_KEY, JSON.stringify(bsimState)); } catch (e) {}
    }

    // 스탯 3개가 모두 등록된 디지몬만 (같은 이름은 한 줄, js/107 의 묶음 재사용)
    function bsimEntries() {
      return collectDigimonListEntries().filter(e => e.hp !== null && e.ap !== null && e.spd !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    function bsimFindEntry(name) {
      const n = String(name || "").trim();
      return n ? bsimEntries().find(e => e.name === n) || null : null;
    }
    // 스탯 등록 여부와 관계없이 이름으로 찾기 (직접 입력 때 이미지·속성용)
    function bsimFindAnyEntry(name) {
      const n = String(name || "").trim();
      return n ? collectDigimonListEntries().find(e => e.name === n) || null : null;
    }

    // 종족값 + 훈련으로 최종 스탯 계산. 종족값이 없으면 null
    function bsimFighter(sideKey) {
      const s = bsimState[sideKey];
      if (s.manual.on) {
        const m = s.manual, any = bsimFindAnyEntry(s.name);
        if (!(m.hp > 0 && m.ap > 0 && m.spd > 0)) return null;
        return bsimApplyCrest({ name: s.name || "직접 입력", attr: m.attr, stage: any ? any.stage : "", img: any ? any.rep.img : "", manual: true,
          base: { hp: m.hp, ap: m.ap, spd: m.spd }, hp: m.hp, ap: m.ap, spd: m.spd }, s.crest);
      }
      const e = bsimFindEntry(s.name);
      if (!e) return null;
      const f = { name: e.name, attr: DIGI_LIST_ATTRS.includes(e.attr) ? e.attr : "none", stage: e.stage, img: e.rep.img, base: { hp: e.hp, ap: e.ap, spd: e.spd } };
      ["hp", "ap", "spd"].forEach(k => {
        const [succ, great] = s.train[k];
        f[k] = e[k] + succ * BSIM_TRAIN[k][0] + great * BSIM_TRAIN[k][1];
      });
      return bsimApplyCrest(f, s.crest);
    }

    function renderBsimSide(sideKey) {
      const wrap = document.getElementById(`bsim-side-${sideKey}`);
      if (!wrap) return;
      const s = bsimState[sideKey];
      const f = bsimFighter(sideKey);
      const attrKey = f ? f.attr : "none";
      const icon = f && typeof attrIconSvg === "function" ? attrIconSvg(attrKey, 16) : "";
      const trainRows = ["hp", "ap", "spd"].map(k => `
        <div class="bsim-train-row">
          <span class="bsim-stat-label ${k}">${BSIM_STAT_LABELS[k]}</span>
          <label>성공 <input type="number" min="0" max="99" value="${s.train[k][0]}" data-side="${sideKey}" data-stat="${k}" data-i="0"></label>
          <label>대성공 <input type="number" min="0" max="99" value="${s.train[k][1]}" data-side="${sideKey}" data-i="1" data-stat="${k}"></label>
          <span class="bsim-final">${f ? `${f.base[k]} → <strong>${f[k]}</strong>` : "-"}</span>
        </div>`).join("");
      const trainCount = ["hp", "ap", "spd"].reduce((t, k) => t + s.train[k][0] + s.train[k][1], 0);
      // 아이콘을 누르면 도감 제보 창(종족값 입력)을 엶. 도감에 있는 디지몬만
      const dexDigi = bsimDexDigi(s.name);
      const dexBtn = dexDigi ? `<button type="button" class="bsim-dex-btn" data-side="${sideKey}" title="종족값(기본 스탯) 입력·수정 후 도감에 반영">✎ 종족값</button>` : "";
      wrap.querySelector(".bsim-info").innerHTML = f
        ? `<img src="${encodeURI(f.img || "")}" alt=""${dexDigi ? ` class="bsim-dex-img" data-side="${sideKey}" title="눌러서 종족값 입력·수정"` : ""} onerror="this.style.visibility='hidden'"><div><strong>${escapeHtml(f.name)}</strong> ${dexBtn}
           <div class="bsim-meta">${f.stage ? escapeHtml(f.stage) + " · " : ""}${icon}${DIGI_LIST_ATTR_LABELS[attrKey]}</div>
           <div class="bsim-meta">체력 ${f.hp} · 전투력 ${f.ap} · 속도 ${f.spd} <span class="muted">(${f.manual ? "직접 입력" : `훈련 ${trainCount}회`}${f.crest && f.crest !== "other" ? ` · ${BSIM_CRESTS[f.crest].label.split(" ")[0]} 적용` : ""})</span></div></div>`
        : `<div class="bsim-meta">${s.manual.on ? "체력·전투력·속도를 1 이상으로 입력하세요." : "디지몬을 선택하세요."}</div>`;
      wrap.querySelectorAll(".bsim-dex-img, .bsim-dex-btn").forEach(el => el.addEventListener("click", () => openBsimDexReport(sideKey)));
      const m = s.manual;
      // 도감에 스탯이 없으면 직접 입력만 가능 (체크 고정)
      const noStats = !!s.name && !bsimFindEntry(s.name);
      if (noStats) m.on = true;
      const toggleHtml = noStats
        ? `<div class="bsim-toggle bsim-nostat">도감에 스탯이 미기재된 디지몬 · 스탯을 직접 입력하세요</div>`
        : `<label class="bsim-toggle"><input type="checkbox" data-side="${sideKey}" data-manual-toggle${m.on ? " checked" : ""}> 스탯 직접 입력 <span class="muted">(훈련 후 최종 스탯을 알 때, 문장 효과 제외)</span></label>`;
      const manualRows = `
        <div class="bsim-manual">
          ${["hp", "ap", "spd"].map(k => `<label><span class="bsim-stat-label ${k}">${BSIM_STAT_LABELS[k]}</span><input type="number" min="1" max="9999" value="${m[k]}" data-side="${sideKey}" data-manual="${k}"></label>`).join("")}
          <label><span class="bsim-stat-label">속성</span><select data-side="${sideKey}" data-manual="attr">${["vaccine", "data", "virus", "free", "unknown"].map(a => `<option value="${a}"${m.attr === a ? " selected" : ""}>${DIGI_LIST_ATTR_LABELS[a]}</option>`).join("")}</select></label>
        </div>`;
      const crestHtml = `<label class="bsim-crest"><span class="bsim-stat-label">문장</span><select data-side="${sideKey}" data-crest>${Object.keys(BSIM_CRESTS).map(c => `<option value="${c}"${(s.crest || "") === c ? " selected" : ""}>${BSIM_CRESTS[c].label}</option>`).join("")}</select></label>`;
      wrap.querySelector(".bsim-train").innerHTML = `
        ${toggleHtml}
        ${m.on ? manualRows : trainRows}
        ${crestHtml}`;
      const rerender = () => { saveBsimState(); renderBsimSide(sideKey); renderBsimPreview(); };
      wrap.querySelector("[data-crest]").addEventListener("change", e => { s.crest = e.target.value; rerender(); });
      const toggle = wrap.querySelector("[data-manual-toggle]");
      if (toggle) toggle.addEventListener("change", () => {
        // 켤 때는 지금 보이는 최종 스탯과 속성으로 칸을 채움
        if (toggle.checked && f) Object.assign(m, { hp: f.hp, ap: f.ap, spd: f.spd, attr: DIGI_LIST_ATTRS.includes(f.attr) && f.attr !== "none" ? f.attr : m.attr });
        else if (toggle.checked) { const any = bsimFindAnyEntry(s.name); if (any && ["vaccine", "data", "virus", "free", "unknown"].includes(any.attr)) m.attr = any.attr; }
        m.on = toggle.checked;
        rerender();
      });
      wrap.querySelectorAll("[data-manual]").forEach(inp => inp.addEventListener("change", () => {
        const k = inp.dataset.manual;
        m[k] = k === "attr" ? inp.value : Math.max(0, Math.min(9999, parseInt(inp.value, 10) || 0));
        rerender();
      }));
      wrap.querySelectorAll(".bsim-train input[data-stat]").forEach(inp => inp.addEventListener("change", () => {
        const v = Math.max(0, Math.min(99, parseInt(inp.value, 10) || 0));
        bsimState[inp.dataset.side].train[inp.dataset.stat][+inp.dataset.i] = v;
        saveBsimState();
        renderBsimSide(inp.dataset.side);
        renderBsimPreview();
      }));
    }

    // 실행 전에도 보이는 1타 기준 수치 (명중률, 데미지, 몇 타에 쓰러지는지)
    function renderBsimPreview() {
      const el = document.getElementById("bsim-preview");
      const A = bsimFighter("A"), B = bsimFighter("B");
      document.getElementById("bsim-result").innerHTML = "";
      if (!el) return;
      if (!A || !B) { el.innerHTML = ""; return; }
      const rel = bsimRelation(A.attr, B.attr);
      const line = (X, Y) => {
        const p = bsimHitP(X, Y), d = bsimBaseDmg(X, Y);
        return `<tr><td>${escapeHtml(X.name)}</td><td>${(p * 100).toFixed(1)}%</td><td>${d - BSIM_MODEL.spread}~${d + BSIM_MODEL.spread}</td><td>${Math.ceil(Y.hp / d)}타</td></tr>`;
      };
      const first = A.spd > B.spd ? A.name : B.spd > A.spd ? B.name : "무작위";
      const warns = bsimWarnings(A, B);
      const warnHtml = warns.length ? `<div class="bsim-warn"><b>예측이 불안정할 수 있는 대진</b><ul>${warns.map(w => `<li>${w}</li>`).join("")}</ul><span class="muted">아래 '데이터 수집에 도움을 주세요!'에서 자세히</span></div>` : "";
      el.innerHTML = warnHtml + `<table class="bsim-table"><tr><th>공격</th><th>명중률</th><th>데미지</th><th>상대 쓰러뜨리기</th></tr>${line(A, B)}${line(B, A)}</table>
        <div class="bsim-meta">A 기준 상성: ${rel > 0 ? "유리" : rel < 0 ? "불리" : "중립"} · 선공: ${escapeHtml(first)}${A.name === B.name ? " · 같은 종 보정(명중 −8.6%p) 적용" : ""}</div>
        ${[A, B].filter(X => X.hope).map(X => `<div class="bsim-meta">희망: ${escapeHtml(X.name)} 체력 ${Math.floor(X.hp / 2)} 이하에서 전투력 ${bsimHope(X, 1).ap} · 속도 ${bsimHope(X, 1).spd}</div>`).join("")}`;
    }

    // 공식이 아직 불안정한 조건 (실측이 부족하거나 개발자 수치와 어긋나는 구간)
    function bsimWarnings(A, B) {
      const w = [];
      if (Math.max(A.ap, B.ap) >= 130) w.push("전투력 130 이상: 실제 데미지가 공식보다 높게 나오는 경향");
      // 기대 공격 횟수 = 필요 타수 / 명중률
      const tries = (X, Y) => Y.hp / bsimBaseDmg(X, Y) / Math.max(0.05, bsimHitP(X, Y));
      if (Math.max(A.ap, B.ap) <= 90 && Math.min(tries(A, B), tries(B, A)) >= 10) w.push("저전투력 장기전: 그랜드로코몬처럼 개발자 수치와 어긋난 사례가 있음");
      // 상대 체력이 데미지의 정수배 근처면 타수가 갈려 승률이 크게 흔들림 (타수가 적을수록 영향이 큼)
      const edge = (X, Y) => { const d = bsimBaseDmg(X, Y), n = Math.round(Y.hp / d); return n >= 2 && n <= 5 && Math.abs(Y.hp - n * d) <= Math.max(2, d * 0.03); };
      if (edge(A, B) || edge(B, A)) w.push("타수 경계: 데미지가 1만 달라도 필요 타수가 바뀌어 승률이 크게 변함");
      if (Math.min(A.spd, B.spd) * 2 <= Math.max(A.spd, B.spd)) w.push("속도 차이 2배 이상: 이 구간 명중률 기록이 적음");
      if ([A, B].some(X => X.crest && X.crest !== "other")) w.push("문장: 효과가 전투 화면 스탯에 이미 포함되는지, 소수점 처리, 희망 발동 시점이 미확인");
      return w;
    }

    function runBsim(n) {
      const A = bsimFighter("A"), B = bsimFighter("B");
      const out = document.getElementById("bsim-result");
      if (!out) return;
      if (!A || !B) { out.innerHTML = `<div class="bsim-meta">양쪽 디지몬을 모두 선택하세요.</div>`; return; }
      const t0 = performance.now();
      const r = bsimRun(A, B, n);
      const ms = performance.now() - t0;
      const pct = x => (100 * x / r.n).toFixed(1);
      const ci = x => (196 * Math.sqrt((x / r.n) * (1 - x / r.n) / r.n)).toFixed(1);
      out.innerHTML = `
        <div class="bsim-bar"><span class="a" style="width:${pct(r.wa)}%"></span><span class="b" style="width:${pct(r.wb)}%"></span></div>
        <div class="bsim-wins">
          <div><span class="muted">A ${escapeHtml(A.name)}</span><strong class="a">${pct(r.wa)}%</strong><small>±${ci(r.wa)} · ${r.wa}승</small></div>
          <div><span class="muted">B ${escapeHtml(B.name)}</span><strong class="b">${pct(r.wb)}%</strong><small>±${ci(r.wb)} · ${r.wb}승</small></div>
        </div>
        <div class="bsim-meta">${r.n.toLocaleString()}회 · 평균 ${r.turns.toFixed(1)}턴${r.dr ? ` · 무승부 ${r.dr}` : ""} · ${ms.toFixed(0)}ms</div>`;
    }

    // 이름으로 도감 디지몬(project.digimons 의 한 항목) 찾기. 같은 이름은 제보 때 자동 동기화되므로 아무거나 대표로 씀
    function bsimDexDigi(name) {
      const e = bsimFindAnyEntry(name);
      return e ? e.rep : null;
    }

    // 도감 제보 창으로 종족값 입력. 제보가 끝나 창이 닫히면 시뮬레이터 화면을 새 값으로 갱신
    function openBsimDexReport(sideKey) {
      const digi = bsimDexDigi(bsimState[sideKey].name);
      if (!digi || typeof openReportModalForDigi !== "function") return;
      openReportModalForDigi(digi);
      const modal = document.getElementById("report-condition-modal");
      const hp = document.getElementById("report-input-hp");
      if (hp) { hp.scrollIntoView({ block: "center" }); hp.focus(); }
      if (!modal) return;
      const obs = new MutationObserver(() => {
        if (modal.style.display !== "none") return;
        obs.disconnect();
        // 도감에 스탯이 새로 생겼으면 직접 입력을 끄고 종족값+훈련으로 돌아감
        const s = bsimState[sideKey];
        if (s.manual.on && bsimFindEntry(s.name)) { s.manual.on = false; saveBsimState(); }
        fillBsimDatalist();
        ["A", "B"].forEach(renderBsimSide);
        renderBsimPreview();
      });
      obs.observe(modal, { attributes: true, attributeFilter: ["style"] });
    }

    function fillBsimDatalist() {
      const dl = document.getElementById("bsim-names");
      // 스탯이 없는 디지몬도 넣음 (고르면 직접 입력으로 전환)
      const all = collectDigimonListEntries().sort((a, b) => a.name.localeCompare(b.name, "ko"));
      const stats = e => e.hp !== null && e.ap !== null && e.spd !== null ? `${e.hp}/${e.ap}/${e.spd}` : "스탯 미기재";
      if (dl) dl.innerHTML = all.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.stage)} · ${stats(e)}</option>`).join("");
    }

    function openBattleSimModal() {
      const modal = document.getElementById("battle-sim-modal");
      if (!modal) return;
      fillBsimDatalist();
      ["A", "B"].forEach(k => {
        const inp = document.getElementById(`bsim-name-${k}`);
        if (inp) inp.value = bsimState[k].name;
        renderBsimSide(k);
      });
      renderBsimPreview();
      modal.style.display = "flex";
    }

    function closeBattleSimModal() {
      const modal = document.getElementById("battle-sim-modal");
      if (modal) modal.style.display = "none";
    }

    function initBattleSim() {
      ["btn-open-battle-sim", "btn-mobile-battle-sim"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", openBattleSimModal);
      });
      ["battle-sim-close", "btn-battle-sim-close-bottom"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", closeBattleSimModal);
      });
      const modal = document.getElementById("battle-sim-modal");
      if (modal) modal.addEventListener("click", e => { if (e.target === modal) closeBattleSimModal(); });
      ["A", "B"].forEach(k => {
        const inp = document.getElementById(`bsim-name-${k}`);
        if (inp) inp.addEventListener("change", () => {
          const s = bsimState[k];
          s.name = inp.value.trim();
          // 도감에 스탯이 없는 디지몬이면 직접 입력으로 전환 (속성은 도감 값)
          const any = bsimFindAnyEntry(s.name);
          if (any && !bsimFindEntry(s.name)) {
            s.manual.on = true;
            if (["vaccine", "data", "virus", "free", "unknown"].includes(any.attr)) s.manual.attr = any.attr;
          }
          saveBsimState();
          renderBsimSide(k);
          renderBsimPreview();
        });
      });
      const swap = document.getElementById("bsim-swap");
      if (swap) swap.addEventListener("click", () => {
        bsimState = { A: bsimState.B, B: bsimState.A };
        saveBsimState();
        openBattleSimModal();
      });
      // 데이터 수집 안내 펼치기, 봇 초대 링크 복사
      const helpBtn = document.getElementById("bsim-help-toggle"), help = document.getElementById("bsim-help");
      if (helpBtn && help) helpBtn.addEventListener("click", () => { help.style.display = help.style.display === "none" ? "block" : "none"; });
      const copyBtn = document.getElementById("bsim-invite-copy"), urlInp = document.getElementById("bsim-invite-url");
      if (copyBtn && urlInp) copyBtn.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(urlInp.value); }
        catch (e) { urlInp.select(); document.execCommand("copy"); }
        copyBtn.textContent = "복사됨";
        setTimeout(() => { copyBtn.textContent = "링크 복사"; }, 1500);
      });
      document.querySelectorAll("#battle-sim-modal [data-bsim-run]").forEach(btn =>
        btn.addEventListener("click", () => runBsim(parseInt(btn.dataset.bsimRun, 10))));
    }

    initBattleSim();
