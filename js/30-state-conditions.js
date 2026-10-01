/* 프로젝트 상태/저장, 세대별 기본 조건, 동명 동기화, 조건 공개 판정, DiM 필터 */

    // project_data.js 의 데이터를 사용. 로드에 실패하면 빈 프로젝트로 시작한다.
    if (!window.DIGIPET_DEFAULT_DATA) {
      console.error("project_data.js 를 불러오지 못했습니다. 빈 프로젝트로 시작합니다.");
    }
    const activeDefaultData = window.DIGIPET_DEFAULT_DATA || { digimons: {}, evolutions: [], dims: [], dimMeta: {} };

    let project = JSON.parse(JSON.stringify(activeDefaultData));

    // localStorage에서 이전 작업 내용 복원 (뷰어 모드에서는 항상 최신 배포 데이터 사용)
    const _isViewerPath = window.location.pathname.toLowerCase();
    const _isViewer = _isViewerPath.endsWith("index.html") || _isViewerPath.endsWith("/") ||
                      _isViewerPath.endsWith("viewer.html") || new URLSearchParams(window.location.search).has("view");
    if (!_isViewer) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.digimons && parsed.evolutions) {
            project = parsed;
          }
        }
      } catch (e) {
        console.error("데이터 복원 실패:", e);
      }
    }

    function saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        const statusEl = document.getElementById("autosave-status");
        if (statusEl) {
          const nowStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          statusEl.innerHTML = `<span style="display:inline-block; width:8px; height:8px; background:#23A55A; border-radius:50%; box-shadow:0 0 6px #23A55A;"></span> 저장됨 (${nowStr})`;
        }
      } catch (e) {
        console.error("자동 저장 실패:", e);
      }
    }

    // 세대별 표준 진화 시간 및 기본 조건 반환
    // - 유년기1, 유년기2, 성장기: 진화시간 1시간, 다른 조건 모두 기본 빈칸
    // - 성숙기: 진화시간 24시간
    // - 완전체: 진화시간 36시간
    // - 궁극체: 진화시간 48시간
    // - 초궁극체/초궁극체II: 진화시간 -
    function getDefaultReqForStage(stage) {
      let defaultTime = "24시간";
      if (["유년기 I", "유년기 II", "성장기"].includes(stage)) {
        defaultTime = "1시간";
      } else if (stage === "성숙기") {
        defaultTime = "24시간";
      } else if (stage === "완전체") {
        defaultTime = "36시간";
      } else if (stage === "궁극체" || stage === "궁극체2") {
        defaultTime = "48시간";
      } else if (["디지타마", "초궁극체", "초궁극체II"].includes(stage)) {
        defaultTime = "-";
      }

      return {
        time: defaultTime,
        vital: "",
        pp: "",
        battle: "",
        winRate: "",
        dungeon: "",
        jogress: "",
        item: "",
        note: ""
      };
    }

    // 과거 템플릿 기본값(바이탈 1200, PP 8)이 다른 조건 없이 남아 있으면 빈칸으로 정리. 정리했으면 true.
    // (진화선 evo 와 디지몬 req 둘 다 같은 필드 이름을 쓴다)
    function clearLegacyDummyReq(req) {
      if (!req) return false;
      const v = String(req.vital || "").trim();
      const p = String(req.pp || "").trim();
      const hasOther = Boolean(req.battle || req.winRate || (req.jogress && req.jogress !== "-" && req.jogress !== "없음") || (req.item && req.item !== "-" && req.item !== "없음") || (req.dungeon && req.dungeon !== "-" && req.dungeon !== "없음"));
      if ((v === "1200" || v === "1,200") && p === "8" && !hasOther) {
        req.vital = "";
        req.pp = "";
        return true;
      }
      return false;
    }

    // 전체 진화선/디지몬의 1200/8 더미값 정리. 정리한 개수를 반환.
    // 구글 시트(실시간 조건)에도 같은 더미값이 남아 있어서, 시트 병합 뒤에도 다시 호출해야 한다.
    function clearAllLegacyDummyValues() {
      let count = 0;
      (project.evolutions || []).forEach(e => { if (clearLegacyDummyReq(e)) count++; });
      Object.values(project.digimons || {}).forEach(d => { if (clearLegacyDummyReq(d.req)) count++; });
      return count;
    }

    function ensureDigimonRequirements() {
      if (!project.dims) project.dims = [];

      // 조그레스 진화선 파트너 보정: 아구몬dim(워그레이몬➔오메가몬: 메탈가루몬), 파피몬dim(메탈가루몬➔오메가몬: 워그레이몬)
      if (project.digimons["metalgarurumon"] && project.digimons["omegamon"]) {
        const metalToOmega = project.evolutions.find(e => e.from === "metalgarurumon" && e.to === "omegamon");
        if (!metalToOmega) {
          project.evolutions.push({
            from: "metalgarurumon",
            to: "omegamon",
            time: "-",
            vital: "",
            pp: "",
            battle: "",
            winRate: "",
            dungeon: "-",
            jogress: "워그레이몬",
            item: "-",
            note: "조그레스 진화"
          });
        } else {
          metalToOmega.time = "-";
          if (!metalToOmega.jogress || metalToOmega.jogress === "-" || metalToOmega.jogress === "메탈가루몬") {
            metalToOmega.jogress = "워그레이몬";
          }
        }

        const warToOmega = project.evolutions.find(e => e.from === "wargreymon" && e.to === "omegamon");
        if (warToOmega) {
          warToOmega.time = "-";
          if (!warToOmega.jogress || warToOmega.jogress === "-" || warToOmega.jogress === "워그레이몬") {
            warToOmega.jogress = "메탈가루몬";
          }
        }
      }

      Object.values(project.digimons).forEach(digi => {
        if (!digi.req) {
          digi.req = getDefaultReqForStage(digi.stage);
        }

        // 세대별 표준 진화 시간 보정
        // (유년기/성장기도 바이탈 등 조건이 있는 DiM 이 있으므로 시간 외 조건은 지우지 않는다. 예: 뿌요요몬→젤리몬 바이탈 350)
        if (["유년기 I", "유년기 II", "성장기"].includes(digi.stage)) {
          digi.req.time = "1시간";
        } else if (digi.stage === "성숙기") {
          if (!digi.req.time || digi.req.time === "12시간" || digi.req.time === "-") {
            digi.req.time = "24시간";
          }
        } else if (digi.stage === "완전체") {
          if (!digi.req.time || digi.req.time === "24시간" || digi.req.time === "12시간" || digi.req.time === "-") {
            digi.req.time = "36시간";
          }
        } else if (digi.stage === "궁극체" || digi.stage === "궁극체2") {
          if (!digi.req.time || digi.req.time === "24시간" || digi.req.time === "36시간" || digi.req.time === "-") {
            digi.req.time = "48시간";
          }
        } else if (digi.stage === "초궁극체" || digi.stage === "초궁극체II") {
          if (!digi.req.time || digi.req.time === "즉시" || digi.req.time === "24시간") {
            digi.req.time = "-";
          }
        }

        clearLegacyDummyReq(digi.req);

        // 해당 디지몬으로 향하는 모든 진화선에 시간과 유년기/성장기 조건 반영 (루트별 고유 시간이 이미 있으면 유지)
        project.evolutions.filter(e => e.to === digi.id).forEach(e => {
          if (!e.time) {
            e.time = digi.req.time;
          }
          clearLegacyDummyReq(e);
        });
      });
    }

    ensureDigimonRequirements();

    function escapeHtml(str) {
      if (!str) return "";
      return String(str).replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[m]));
    }


    // 조그레스 상대 개체 검색 함수 (이름 또는 ID 기준)
    function findDigimonByNameOrId(query) {
      if (!query || typeof query !== "string") return null;
      const q = query.trim().toLowerCase();
      if (!q || q === "-" || q === "없음") return null;

      // 1. Direct ID match
      if (project.digimons[q]) return project.digimons[q];

      // 2. Exact Name match (case-insensitive)
      const digis = Object.values(project.digimons);
      const exact = digis.find(d => d.name && d.name.trim().toLowerCase() === q);
      if (exact) return exact;

      // 3. Partial match
      const partial = digis.find(d => d.name && (d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase())));
      if (partial) return partial;

      return null;
    }


    // 동일 이름을 가진 디지몬 간 외형 정보(이미지, 속성, 세대) 연동
    // ※ 소속 DiM(페이지), 진화조건(req), 진화선은 각 페이지별로 절대 건드리지 않음!
    function syncSameNameDigimons(sourceDigi) {
      if (!sourceDigi || !sourceDigi.name) return;
      const targetName = sourceDigi.name.trim().toLowerCase();
      if (!targetName) return;

      Object.values(project.digimons).forEach(d => {
        if (d.id !== sourceDigi.id && d.name && d.name.trim().toLowerCase() === targetName) {
          if (sourceDigi.img) d.img = sourceDigi.img;
          if (sourceDigi.attr) d.attr = sourceDigi.attr;
          if (sourceDigi.stage) d.stage = sourceDigi.stage;
          if (sourceDigi.baseHp !== undefined) d.baseHp = sourceDigi.baseHp;
          if (sourceDigi.baseAp !== undefined) d.baseAp = sourceDigi.baseAp;
          if (sourceDigi.baseSpd !== undefined) d.baseSpd = sourceDigi.baseSpd;
        }
      });
    }

    // 프로젝트 시작/로드 시 모든 페이지의 동일 이름 디지몬 간 이미지/속성/세대 일괄 동기화 보장
    function autoSyncAllSameNameDigimons() {
      if (!project || !project.digimons) return;
      const nameMap = {};
      Object.values(project.digimons).forEach(d => {
        if (!d.name) return;
        const key = d.name.trim().toLowerCase();
        if (!nameMap[key]) nameMap[key] = [];
        nameMap[key].push(d);
      });

      let updated = false;
      Object.values(nameMap).forEach(list => {
        if (list.length <= 1) return;
        const donorWithImg = list.find(d => d.img && !d.img.includes("sprites/Agumon.gif")) || list.find(d => d.img);
        const donorWithAttr = list.find(d => d.attr && d.attr !== "none");
        const donorWithStage = list.find(d => d.stage && d.stage !== "불명");
        const donorWithHp = list.find(d => d.baseHp !== undefined && d.baseHp !== "" && d.baseHp !== null);
        const donorWithAp = list.find(d => d.baseAp !== undefined && d.baseAp !== "" && d.baseAp !== null);
        const donorWithSpd = list.find(d => d.baseSpd !== undefined && d.baseSpd !== "" && d.baseSpd !== null);

        list.forEach(d => {
          if (donorWithImg && donorWithImg.img && (!d.img || d.img.includes("sprites/Agumon.gif"))) {
            d.img = donorWithImg.img;
            updated = true;
          }
          if (donorWithAttr && donorWithAttr.attr && (!d.attr || d.attr === "none")) {
            d.attr = donorWithAttr.attr;
            updated = true;
          }
          if (donorWithStage && donorWithStage.stage && (!d.stage || d.stage === "불명")) {
            d.stage = donorWithStage.stage;
            updated = true;
          }
          if (donorWithHp && (d.baseHp === undefined || d.baseHp === "" || d.baseHp === null)) {
            d.baseHp = donorWithHp.baseHp;
            updated = true;
          }
          if (donorWithAp && (d.baseAp === undefined || d.baseAp === "" || d.baseAp === null)) {
            d.baseAp = donorWithAp.baseAp;
            updated = true;
          }
          if (donorWithSpd && (d.baseSpd === undefined || d.baseSpd === "" || d.baseSpd === null)) {
            d.baseSpd = donorWithSpd.baseSpd;
            updated = true;
          }
        });
      });
      if (updated) {
        saveState();
      }
    }

    // 공식 도감 및 동일 이름 이미지 연동 배지 갱신
    function updateDigiRefBadge(digi) {
      const noticeEl = document.getElementById("digi-ref-notice");
      if (!noticeEl) return;
      if (!digi || !digi.name) {
        noticeEl.style.display = "none";
        return;
      }

      const cleanName = digi.name.trim();
      if (!cleanName) {
        noticeEl.style.display = "none";
        return;
      }

      const existing = findExistingDigimonByName(cleanName, digi.id);
      if (existing) {
        noticeEl.className = "ref-badge ref-badge-sync";
        noticeEl.style.display = "block";
        noticeEl.innerHTML = `<strong>동일 디지몬 감지:</strong> 기존 '${existing.name}'와 이미지/속성/세대 연동 중`;
        return;
      }

      const official = lookupOfficialDigimon(cleanName);
      if (official) {
        noticeEl.className = "ref-badge ref-badge-official";
        noticeEl.style.display = "block";
        const attrMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-" };
        const attrKo = attrMap[official.attr] || official.attr;
        const link = official.dir ? `<a href="https://digimon.net/reference_ko/detail.php?directory_name=${official.dir}" target="_blank" rel="noopener">도감 보기 ↗</a>` : "";
        noticeEl.innerHTML = `<strong>공식 도감:</strong> ${attrKo} / ${official.stage} ${link}`;
        return;
      }

      noticeEl.style.display = "none";
    }

    // 디지몬 정보 적용 (기존 동일 이름 디지몬의 이미지/속성/세대 우선 가져오기, 없으면 공식 도감)
    function applyDigimonInfoByName(digiId, newName, isExplicitBtn = false) {
      const digi = project.digimons[digiId];
      if (!digi) return;

      const cleanName = (newName || "").trim();
      if (!cleanName) return;

      // 1순위: 다른 페이지에 이미 등록된 동일 이름 디지몬의 이미지/속성/세대 가져오기!
      const existing = findExistingDigimonByName(cleanName, digiId);
      if (existing) {
        if (existing.img) digi.img = existing.img;
        if (existing.attr) digi.attr = existing.attr;
        if (existing.stage) digi.stage = existing.stage;
        if (existing.baseHp !== undefined) digi.baseHp = existing.baseHp;
        if (existing.baseAp !== undefined) digi.baseAp = existing.baseAp;
        if (existing.baseSpd !== undefined) digi.baseSpd = existing.baseSpd;
        syncSameNameDigimons(digi);
        saveState();
        renderTree();
        updateSidebar();
        return;
      }

      // 2순위: 공식 도감에서 속성/세대 조회
      const official = lookupOfficialDigimon(cleanName);
      if (official) {
        if (official.attr && official.attr !== "none") digi.attr = official.attr;
        if (official.stage && official.stage !== "불명" && digi.stage !== "디지타마") digi.stage = official.stage;
        syncSameNameDigimons(digi);
        saveState();
        renderTree();
        updateSidebar();
      } else if (isExplicitBtn) {
        alert(`'${cleanName}'에 대한 정보를 공식 도감에서 찾을 수 없습니다.`);
      }
    }

    // 공식 도감 datalist 초기화 (1,310종 - 한글 및 영문 병기)
    function initOfficialDatalist() {
      if (typeof OFFICIAL_DIGIMON_DB === "undefined") return;
      const dl = document.getElementById("official-digimon-datalist");
      if (!dl || dl.children.length > 0) return;

      const names = Object.keys(OFFICIAL_DIGIMON_DB).sort((a, b) => a.localeCompare(b, "ko"));
      const frag = document.createDocumentFragment();
      const attrMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-" };

      names.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        const info = OFFICIAL_DIGIMON_DB[name];
        const engName = typeof formatDigiEnglishName === "function" ? formatDigiEnglishName(info.dir || "") : (info.dir || "");
        opt.label = `${engName ? engName + " | " : ""}${attrMap[info.attr] || info.attr} | ${info.stage}`;
        opt.textContent = `${name} ${engName} ${info.dir || ""}`;
        frag.appendChild(opt);
      });
      dl.appendChild(frag);
    }

    // 디지몬 바로가기 (포커스 & 하이라이트 애니메이션)
    function navigateToDigimon(targetId, customToast = null) {
      const digi = project.digimons[targetId];
      if (!digi) return;

      if (filterDim !== "ALL" && digi.dim) {
        const dimList = digi.dim.split(",").map(s => s.trim());
        if (!dimList.includes(filterDim)) {
          filterDim = dimList[0] || "ALL";
          const filterSelect = document.getElementById("filter-dim");
          if (filterSelect) filterSelect.value = filterDim;
        }
      }

      selectedDigiId = targetId;
      renderTree();
      updateSidebar();

      setTimeout(() => {
        const nodeEl = document.getElementById(`node-${targetId}`);
        if (nodeEl) {
          nodeEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          nodeEl.classList.add("highlight-flash");
          setTimeout(() => nodeEl.classList.remove("highlight-flash"), 1500);
        }
      }, 80);

      if (customToast !== false) {
        const msg = customToast || `[<strong>${digi.name}</strong>](으)로 이동했습니다!`;
        showToast(msg);
      }
    }

    const stageOrder = ["디지타마", "유년기 I", "유년기 II", "성장기", "성숙기", "완전체", "궁극체", "궁극체2", "초궁극체", "초궁극체II", "아머체"];
    const attrColors = { vaccine: "#E74C3C", data: "#3498DB", virus: "#9B59B6", free: "#F1C40F", none: "#8E9297" };

    const LINE_COLOR_PRESETS = [
      { id: "default", name: "기본(속성색)", color: null, dotBg: "linear-gradient(135deg, #E74C3C 25%, #3498DB 25% 50%, #9B59B6 50% 75%, #F1C40F 75%)" },
      { id: "red",    name: "빨강",   color: "#EF4444", dotBg: "#EF4444" },
      { id: "orange", name: "주황",   color: "#F97316", dotBg: "#F97316" },
      { id: "gold",   name: "황금",   color: "#F59E0B", dotBg: "#F59E0B" },
      { id: "yellow", name: "노랑",   color: "#EAB308", dotBg: "#EAB308" },
      { id: "green",  name: "초록",   color: "#22C55E", dotBg: "#22C55E" },
      { id: "mint",   name: "민트",   color: "#2DD4BF", dotBg: "#2DD4BF" },
      { id: "sky",    name: "하늘",   color: "#38BDF8", dotBg: "#38BDF8" },
      { id: "blue",   name: "파랑",   color: "#2563EB", dotBg: "#2563EB" },
      { id: "purple", name: "보라",   color: "#A855F7", dotBg: "#A855F7" },
      { id: "pink",   name: "핑크",   color: "#EC4899", dotBg: "#EC4899" },
      { id: "white",  name: "화이트", color: "#F8FAFC", dotBg: "#F8FAFC" },
      { id: "gray",   name: "회색",   color: "#94A3B8", dotBg: "#94A3B8" }
    ];

    let selectedDigiId = null;
    let activeIncomingFromId = null; // 현재 선택된 디지몬의 조건 확인/편집 대상 출발 디지몬 ID
    let connectMode = false;
    let connectFromId = null;
    let filterDim = (project.dims && project.dims.includes("아구몬 EX")) ? "아구몬 EX" : ((project.dims && project.dims.length > 0) ? project.dims[0] : "아구몬 EX");

    // 특정 디지몬으로 들어오는 진화선 목록 조회 (현재 DiM 우선 정렬)
    function getIncomingEvolutionsForDigi(targetId, preferDim = null) {
      if (!targetId || !project.evolutions) return [];
      const evos = project.evolutions.filter(e => e.to === targetId);
      if (evos.length <= 1) return evos;

      const currentDim = preferDim || filterDim || selectedDimContext;
      if (currentDim) {
        const curDimLower = currentDim.toLowerCase();
        const dimEvos = evos.filter(e => {
          const fromD = project.digimons[e.from];
          return fromD && fromD.dim && fromD.dim.split(",").map(s => s.trim().toLowerCase()).includes(curDimLower);
        });
        if (dimEvos.length > 0) return dimEvos;
      }
      return evos;
    }

    // 현재 활성화된 특정 진화선 객체(evo) 조회
    function getActiveIncomingEvo(targetId, fromId = null) {
      if (!targetId || !project.evolutions) return null;
      if (fromId) {
        const found = project.evolutions.find(e => e.to === targetId && e.from === fromId);
        if (found) return found;
      }
      const incoming = getIncomingEvolutionsForDigi(targetId);
      return incoming.length > 0 ? incoming[0] : null;
    }

    // 진화선(evo)과 디지몬(digi) 정보를 종합하여 최종 조건 값 산출 (각 진화선별 완전 독립 조건 유지)
    function getEvoRequirements(evo, digi) {
      const stageDefault = getDefaultReqForStage(digi?.stage);
      if (!evo) {
        return (digi && digi.req) ? { ...digi.req } : { ...stageDefault };
      }

      const dReq = digi?.req || {};
      return {
        time: (evo.time !== undefined && evo.time !== null) ? evo.time : (dReq.time || stageDefault?.time || "-"),
        vital: (evo.vital !== undefined && evo.vital !== null) ? evo.vital : (dReq.vital ?? ""),
        pp: (evo.pp !== undefined && evo.pp !== null) ? evo.pp : (dReq.pp ?? ""),
        battle: (evo.battle !== undefined && evo.battle !== null) ? evo.battle : (dReq.battle ?? ""),
        winRate: (evo.winRate !== undefined && evo.winRate !== null) ? evo.winRate : (dReq.winRate ?? ""),
        dungeon: (evo.dungeon !== undefined && evo.dungeon !== null) ? evo.dungeon : (dReq.dungeon || stageDefault?.dungeon || "-"),
        jogress: (evo.jogress !== undefined && evo.jogress !== null) ? evo.jogress : (dReq.jogress || stageDefault?.jogress || "-"),
        item: (evo.item !== undefined && evo.item !== null) ? evo.item : (dReq.item || stageDefault?.item || "-"),
        note: (evo.note !== undefined && evo.note !== null) ? evo.note : (dReq.note || "")
      };
    }

    // 특정 진화선(evo)의 조건이 실제로 밝혀졌는지(입력되었는지) 판별
    function isEvoRevealed(evo, stage = null) {
      if (!evo) return false;
      if (evo.isRevealed === true || evo.isRevealed === "true") return true;
      const fromDigi = (evo.from && typeof project !== "undefined" && project.digimons) ? project.digimons[evo.from] : null;
      const fromStage = fromDigi ? fromDigi.stage : null;
      const hasTime = Boolean(evo.time && evo.time !== "-");

      // 유년기 단계 또는 유년기에서 성장기로의 진화는 진화 시간(time)이 주 조건입니다.
      if (["디지타마", "유년기 I", "유년기 II"].includes(fromStage) || ["디지타마", "유년기 I", "유년기 II"].includes(stage) || stage === "성장기") {
        return hasTime;
      }

      // 비고에 방치 진화 또는 조건 없음이 명시된 경우 공개로 판정
      if (evo.note && (evo.note.includes("방치") || evo.note.includes("조건 없음") || evo.note.includes("조건없음") || evo.note.includes("시간 경과"))) {
        return true;
      }

      const hasVital = evo.vital !== "" && evo.vital !== undefined && evo.vital !== null && evo.vital !== "-";
      const hasPp = evo.pp !== "" && evo.pp !== undefined && evo.pp !== null && evo.pp !== "-";
      const hasBattle = evo.battle !== "" && evo.battle !== undefined && evo.battle !== null && evo.battle !== "-";
      const hasWinRate = evo.winRate !== "" && evo.winRate !== undefined && evo.winRate !== null && evo.winRate !== "-";
      const hasJogress = evo.jogress && evo.jogress !== "-" && evo.jogress !== "없음";
      const hasItem = evo.item && evo.item !== "-" && evo.item !== "없음";
      const hasDungeon = evo.dungeon && evo.dungeon !== "-" && evo.dungeon !== "없음";
      return Boolean(hasVital || hasPp || hasBattle || hasWinRate || hasJogress || hasItem || hasDungeon);
    }

    // 디지몬의 모든 들어오는 진화 루트(A>D, B>D, C>D) 상태를 종합 판정하여 공개/일부불명/조건불명 자동 산출
    function updateDigimonConditionStatus(digi) {
      if (!digi) return;
      if (digi.stage === "디지타마") {
        digi.unknownTime = false;
        digi.partialUnknown = false;
        return;
      }

      // 관리자/유저가 수동 지정한 상태가 있는 경우 최우선 적용
      if (digi.conditionStatus === "known") {
        digi.unknownTime = false;
        digi.partialUnknown = false;
        return;
      } else if (digi.conditionStatus === "unknown") {
        digi.unknownTime = true;
        digi.partialUnknown = false;
        return;
      } else if (digi.conditionStatus === "partial") {
        digi.unknownTime = false;
        digi.partialUnknown = true;
        return;
      }

      // 유년기/성장기는 진화 시간(1시간)만 있으면 조건 공개로 처리
      if (["유년기 I", "유년기 II", "성장기"].includes(digi.stage)) {
        digi.unknownTime = false;
        digi.partialUnknown = false;
        return;
      }

      const incoming = project.evolutions ? project.evolutions.filter(e => e.to === digi.id) : [];
      if (incoming.length === 0) {
        const hasReq = isEvoRevealed(digi.req, digi.stage);
        digi.unknownTime = !hasReq;
        digi.partialUnknown = false;
        return;
      }

      if (incoming.length === 1) {
        const evo = incoming[0];
        const isRev = isEvoRevealed(evo, digi.stage);
        digi.unknownTime = !isRev;
        digi.partialUnknown = false;
        return;
      }

      const totalCount = incoming.length;
      const revealedCount = incoming.filter(e => isEvoRevealed(e, digi.stage)).length;

      if (revealedCount === 0) {
        // 밝혀진 루트가 0개 -> 조건 불명
        digi.unknownTime = true;
        digi.partialUnknown = false;
      } else if (revealedCount < totalCount) {
        // 1개 이상이지만 전체 루트보다 적음 -> 일부 불명! (A>D, B>D, C>D 중 하나라도 비어있으면 일부 불명)
        digi.unknownTime = false;
        digi.partialUnknown = true;
      } else {
        // 모든 루트가 밝혀짐 -> 전체 공개
        digi.unknownTime = false;
        digi.partialUnknown = false;
      }
    }

    // 전체 디지몬의 조건 공개 상태를 일괄 재계산하여 정합성 보정
    function recalculateAllDigimonConditionStatuses() {
      if (!project || !project.digimons) return;
      let fixedCount = 0;
      Object.values(project.digimons).forEach(d => {
        const oldUnknown = Boolean(d.unknownTime);
        const oldPartial = Boolean(d.partialUnknown);
        updateDigimonConditionStatus(d);
        if (oldUnknown !== Boolean(d.unknownTime) || oldPartial !== Boolean(d.partialUnknown)) {
          fixedCount++;
        }
      });
      if (fixedCount > 0) {
        console.log(`[조건 상태 자동 보정] ${fixedCount}개 디지몬의 공개/일부불명 상태 갱신 완료`);
      }
    }

    // DiM 고유 식별자 문자열 변환 (DOM ID용)
    function cleanDimId(dimStr) {
      return (dimStr || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    // 디지몬이 특정 DiM 화면에 표시되어야 하는지 판별
    function isDigimonVisibleInDim(digi, targetDim) {
      if (!targetDim) return true;
      if (!digi || !digi.dim) return false;

      const tDimLower = targetDim.trim().toLowerCase();
      const dims = digi.dim.split(",").map(s => s.trim().toLowerCase());
      if (dims.includes(tDimLower)) return true;

      // 상태 아이콘(🚧, ❌, ⚠️) 차이와 무관하게 안전 비교 지원
      const cleanTarget = tDimLower.replace(/[🚧❌⚠️]/g, '').trim();
      if (cleanTarget) {
        const cleanDims = dims.map(d => d.replace(/[🚧❌⚠️]/g, '').trim());
        if (cleanDims.includes(cleanTarget)) return true;
      }
      return false;
    }

    function updateDimFilterOptions() {
      const select = document.getElementById("filter-dim");
      const datalist = document.getElementById("dim-datalist");
      if (!select) return;

      if (!project.dims) project.dims = [];
      const dims = new Set();
      const allRawDims = [...project.dims];
      Object.values(project.digimons || {}).forEach(d => {
        if (d.dim) {
          d.dim.split(",").map(s => s.trim()).filter(Boolean).forEach(x => allRawDims.push(x));
        }
      });

      // 단일 글자 오타나 공백 항목 필터링
      const cleanRawDims = allRawDims.filter(d => d && d.trim().length > 1);

      // '아구몬 EX'가 존재하면 최상단(0번 인덱스) 우선 고정
      if (cleanRawDims.includes("아구몬 EX")) {
        dims.add("아구몬 EX");
      }
      cleanRawDims.forEach(d => dims.add(d.trim()));
      project.dims = Array.from(dims);

      let selectHtml = '';
      let datalistHtml = '';
      project.dims.forEach(dimName => {
        selectHtml += `<option value="${escapeHtml(dimName)}">${escapeHtml(dimName)}</option>`;
        datalistHtml += `<option value="${escapeHtml(dimName)}">`;
      });
      select.innerHTML = selectHtml;
      if (datalist) datalist.innerHTML = datalistHtml;

      if (!filterDim || !dims.has(filterDim)) {
        filterDim = (project.dims.includes("아구몬 EX") ? "아구몬 EX" : project.dims[0]) || "";
      }
      // 드롭다운 선택값과 filterDim 완벽 일치 보장
      select.value = filterDim;
      if (typeof refreshPlannerDimSelects === 'function') {
        refreshPlannerDimSelects();
      }
    }

    document.getElementById("filter-dim").addEventListener("change", (e) => {
      filterDim = e.target.value;
      renderTree();
    });

    // DiM 추가 버튼
    document.getElementById("btn-add-dim").addEventListener("click", async () => {
      const name = await showCustomPrompt("새 DiM 추가", "새로 추가할 DiM 카테고리 이름을 입력하세요:", "", "예: Gabumon EX, Volcanic Beat 등");
      if (!name || !name.trim()) return;

      const cleanName = name.trim();
      if (!project.dims) project.dims = [];
      if (!project.dims.includes(cleanName)) {
        project.dims.push(cleanName);
      }

      filterDim = cleanName;
      saveState();
      updateDimFilterOptions();
      renderTree();
      updateSidebar();
      showToast(`'${cleanName}' DiM이 추가되었습니다!\n상단 [새 디지몬 추가]를 눌러 디지몬을 등록해 보세요.`);
    });

    // DiM 이름 변경 (Rename) 핵심 통합 함수
    async function renameDim(oldName, customNewName = null) {
      if (!oldName || oldName === "ALL") {
        return alert("이름을 변경할 특정 DiM을 먼저 상단 드롭다운에서 선택하거나, 트리의 DiM 제목 옆 ✏️ 버튼을 눌러주세요.");
      }

      let newName = customNewName;
      if (!newName) {
        newName = await showCustomPrompt("DiM 이름 변경", `현재 선택된 '${oldName}' DiM의 새 이름을 입력하세요:`, oldName);
      }
      if (!newName || !newName.trim() || newName.trim() === oldName) return;

      const cleanNewName = newName.trim();
      const oldLower = oldName.trim().toLowerCase();
      const newLower = cleanNewName.toLowerCase();

      // 1. 해당 DiM에 속한 모든 디지몬의 dim 변경 (단일 DiM 및 쉼표 구분 다중 DiM 모두 안전하게 갱신)
      let count = 0;
      Object.values(project.digimons).forEach(d => {
        if (!d.dim) return;
        const dims = d.dim.split(",").map(s => s.trim()).filter(Boolean);
        let changed = false;
        const updated = dims.map(dm => {
          if (dm.toLowerCase() === oldLower) {
            changed = true;
            return cleanNewName;
          }
          return dm;
        });
        if (changed) {
          d.dim = updated.join(", ");
          count++;
        }
      });

      // 2. dims 목록 업데이트 (기존 순서 위치 그대로 보존)
      if (!project.dims) project.dims = [];
      const idx = project.dims.findIndex(d => d.trim().toLowerCase() === oldLower);
      if (idx !== -1) {
        project.dims[idx] = cleanNewName;
      } else if (!project.dims.some(d => d.trim().toLowerCase() === newLower)) {
        project.dims.push(cleanNewName);
      }

      // 3. ⭐ dimMeta (등장 지역설정 및 메타데이터) 100% 안전 이관 및 보존!
      if (!project.dimMeta) project.dimMeta = {};
      const oldMetaKey = Object.keys(project.dimMeta).find(k => k.trim().toLowerCase() === oldLower) || oldName;
      if (project.dimMeta[oldMetaKey]) {
        project.dimMeta[cleanNewName] = { ...project.dimMeta[oldMetaKey] };
        if (oldMetaKey !== cleanNewName) {
          delete project.dimMeta[oldMetaKey];
        }
      }

      // 4. 필터 및 선택 컨텍스트 갱신
      if (filterDim && filterDim.trim().toLowerCase() === oldLower) {
        filterDim = cleanNewName;
      }
      if (selectedDimContext && selectedDimContext.trim().toLowerCase() === oldLower) {
        selectedDimContext = cleanNewName;
      }

      saveState();
      updateDimFilterOptions();
      renderTree();
      updateSidebar();
      showToast(`DiM 이름이 '${oldName}' ➔ '${cleanNewName}'(으)로 변경되었습니다!<br>등장 지역 설정 및 소속 디지몬(${count}마리)이 안전하게 유지되었습니다.`);
    }

    // DiM 이름 변경 (Rename) 상단 툴바 버튼
    document.getElementById("btn-rename-dim").addEventListener("click", () => {
      if (!filterDim) {
        return alert("이름을 변경할 DiM을 먼저 상단 드롭다운에서 선택해 주세요.");
      }
      renameDim(filterDim);
    });

    // DiM 삭제 (Delete) 버튼
    document.getElementById("btn-delete-dim").addEventListener("click", () => {
      if (!filterDim) {
        return alert("삭제할 DiM을 먼저 상단 드롭다운에서 선택해 주세요.");
      }

      const targetDim = filterDim;
      const tDimLower = targetDim.trim().toLowerCase();

      // 해당 DiM에 속한 디지몬 검색
      const relatedDigis = Object.values(project.digimons).filter(d => {
        if (!d.dim) return false;
        return d.dim.split(",").map(s => s.trim().toLowerCase()).includes(tDimLower);
      });

      let deleteDigimonChoice = false;
      if (relatedDigis.length > 0) {
        const confirmMsg = `'${targetDim}' DiM을 삭제하시겠습니까?\n\n현재 이 DiM에 소속된 디지몬이 ${relatedDigis.length}마리 있습니다.`;
        if (!confirm(confirmMsg)) return;

        deleteDigimonChoice = confirm(`[선택] 소속 디지몬(${relatedDigis.length}마리)도 프로젝트에서 완전히 삭제하시겠습니까?\n\n• [확인] 누름: 디지몬 및 관련 진화선 완전 삭제\n• [취소] 누름: 디지몬은 유지하고 DiM 카테고리만 삭제`);
      } else {
        if (!confirm(`'${targetDim}' DiM을 삭제하시겠습니까?`)) return;
      }

      if (deleteDigimonChoice) {
        // 1) 디지몬 및 진화선 삭제
        relatedDigis.forEach(d => {
          const dims = (d.dim || "").split(",").map(s => s.trim()).filter(Boolean);
          const remainingDims = dims.filter(x => x.toLowerCase() !== tDimLower);
          if (remainingDims.length > 0) {
            d.dim = remainingDims.join(", ");
          } else {
            delete project.digimons[d.id];
            project.evolutions = project.evolutions.filter(e => e.from !== d.id && e.to !== d.id);
          }
        });
      } else {
        // 2) 디지몬은 유지하고 DiM 목록에서만 제거
        relatedDigis.forEach(d => {
          const dims = (d.dim || "").split(",").map(s => s.trim()).filter(Boolean);
          const remainingDims = dims.filter(x => x.toLowerCase() !== tDimLower);
          d.dim = remainingDims.join(", ");
        });
      }

      // dims 목록에서 제거
      if (project.dims) {
        project.dims = project.dims.filter(dim => {
          const subDims = dim.split(",").map(s => s.trim().toLowerCase());
          return !subDims.includes(tDimLower);
        });
      }

      // dimMeta 에서도 삭제
      if (project.dimMeta) {
        delete project.dimMeta[targetDim];
        const matchKey = Object.keys(project.dimMeta).find(k => k.trim().toLowerCase() === tDimLower);
        if (matchKey) delete project.dimMeta[matchKey];
      }

      if (!project.digimons[selectedDigiId]) {
        selectedDigiId = null;
      }

      filterDim = (project.dims && project.dims.length > 0) ? project.dims[0] : "";
      saveState();
      updateDimFilterOptions();
      renderTree();
      updateSidebar();
      showToast(`'${targetDim}' DiM이 성공적으로 삭제되었습니다.`);
    });

    // DIM 순서 위로 이동
    document.getElementById("btn-dim-up").addEventListener("click", () => {
      if (!filterDim || !project.dims) return;
      const idx = project.dims.indexOf(filterDim);
      if (idx <= 0) { showToast("이미 맨 위입니다.", true); return; }
      [project.dims[idx - 1], project.dims[idx]] = [project.dims[idx], project.dims[idx - 1]];
      saveState();
      updateDimFilterOptions();
      const sel = document.getElementById("filter-dim");
      if (sel) sel.value = filterDim;
      renderTree();
      showToast(`'${filterDim}' DiM을 위로 이동했습니다.`);
    });

    // DIM 순서 아래로 이동
    document.getElementById("btn-dim-down").addEventListener("click", () => {
      if (!filterDim || !project.dims) return;
      const idx = project.dims.indexOf(filterDim);
      if (idx < 0 || idx >= project.dims.length - 1) { showToast("이미 맨 아래입니다.", true); return; }
      [project.dims[idx], project.dims[idx + 1]] = [project.dims[idx + 1], project.dims[idx]];
      saveState();
      updateDimFilterOptions();
      const sel = document.getElementById("filter-dim");
      if (sel) sel.value = filterDim;
      renderTree();
      showToast(`'${filterDim}' DiM을 아래로 이동했습니다.`);
    });

    let draggedId = null;
    let isCtrlKeyDown = false;
    window.addEventListener("keydown", (e) => { if (e.key === "Control") isCtrlKeyDown = true; });
    window.addEventListener("keyup", (e) => { if (e.key === "Control") isCtrlKeyDown = false; });
    window.addEventListener("blur", () => { isCtrlKeyDown = false; });

    function clearDropIndicators() {
      document.querySelectorAll(".card-node").forEach(c => c.classList.remove("drop-before", "drop-after", "connect-drop-target"));
      document.querySelectorAll(".nodes-list").forEach(l => l.classList.remove("drag-over"));
    }

    function moveDigimonToStage(dragId, targetStage, targetId, position) {
      const draggedDigi = project.digimons[dragId];
      if (!draggedDigi) return;

      // 세대 변경
      if (draggedDigi.stage !== targetStage) {
        draggedDigi.stage = targetStage;
        const defaultReq = getDefaultReqForStage(targetStage);
        if (!draggedDigi.req) draggedDigi.req = {};
        draggedDigi.req.time = defaultReq.time;
        if (["유년기 I", "유년기 II", "성장기"].includes(targetStage)) {
          draggedDigi.req.vital = "";
          draggedDigi.req.pp = "";
          draggedDigi.req.battle = "";
          draggedDigi.req.winRate = "";
          draggedDigi.req.dungeon = "-";
          draggedDigi.req.jogress = "-";
          draggedDigi.req.item = "-";
        }
        project.evolutions.filter(ev => ev.to === dragId).forEach(ev => {
          ev.time = draggedDigi.req.time;
          if (["유년기 I", "유년기 II", "성장기"].includes(targetStage)) {
            ev.vital = "";
            ev.pp = "";
            ev.battle = "";
            ev.winRate = "";
            ev.dungeon = "-";
            ev.jogress = "-";
            ev.item = "-";
          }
        });
      }

      // 해당 세대의 디지몬들 정렬 (본인 제외)
      let stageDigis = Object.values(project.digimons)
        .filter(d => d.stage === targetStage && d.id !== dragId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      if (position === "end" || !targetId) {
        stageDigis.push(draggedDigi);
      } else {
        const targetIdx = stageDigis.findIndex(d => d.id === targetId);
        if (targetIdx === -1) {
          stageDigis.push(draggedDigi);
        } else if (position === "before") {
          stageDigis.splice(targetIdx, 0, draggedDigi);
        } else {
          stageDigis.splice(targetIdx + 1, 0, draggedDigi);
        }
      }

      // 순서 번호(order) 재할당
      stageDigis.forEach((d, idx) => {
        d.order = idx;
      });

      selectedDigiId = dragId;
      saveState();
      renderTree();
      updateSidebar();
    }

