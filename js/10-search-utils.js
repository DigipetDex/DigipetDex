/* 영문-한글 디지몬 이름 매핑 및 바이링구얼 검색 유틸 */
    // -------------------------------------------------------------------------
    // 영문-한글 디지몬 도감 매핑 및 바이링구얼(한/영) 검색 유틸리티
    // -------------------------------------------------------------------------
    const COMMON_ENGLISH_DIGI_ALIASES = {
      "omnimon": "오메가몬",
      "gallantmon": "듀크몬",
      "gatomon": "가트몬",
      "veemon": "브이몬",
      "vmon": "브이몬",
      "daemon": "마왕몬",
      "creepymon": "마왕몬",
      "beelzemon": "베르제브몬",
      "malomyotismon": "베리얼묘티스몬",
      "myotismon": "묘티스몬",
      "venommyotismon": "베놈묘티스몬",
      "megagargomon": "세인트가르고몬",
      "rapidmon": "래피드몬",
      "terriermon": "테리어몬",
      "lopmon": "로프몬",
      "cherubimon": "케루비몬",
      "kerpymon": "케루비몬",
      "renamon": "레나몬",
      "kyubimon": "구미호몬",
      "taomon": "도사몬",
      "sakuyamon": "샤크라몬",
      "kuzuhamon": "쿠즈하몬",
      "guilmon": "길몬",
      "growlmon": "그라우몬",
      "wargrowlmon": "메가로그라우몬",
      "megidramon": "메기드라몬",
      "chaosgallantmon": "카오스듀크몬",
      "patamon": "파타몬",
      "angemon": "엔젤몬",
      "magnaangemon": "홀리엔젤몬",
      "seraphimon": "세라피몬",
      "gargomon": "가르고몬",
      "imperialdramon": "황제드라몬"
    };

    function formatDigiEnglishName(dir) {
      if (!dir) return "";
      return dir
        .replace(/_/g, " ")
        .split(" ")
        .map(word => word.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("-"))
        .join(" ");
    }

    // 공식 한국 디지몬 도감(1,310종)에서 한글 및 영문명으로 디지몬 정보 조회
    function lookupOfficialDigimon(name) {
      if (!name || typeof OFFICIAL_DIGIMON_DB === "undefined") return null;
      let clean = String(name).trim();
      if (!clean) return null;

      // "아구몬 (Agumon)" 같은 괄호 병기 형태 분리
      if (clean.includes("(") && clean.includes(")")) {
        const parts = clean.split("(");
        const p1 = parts[0].trim();
        const p2 = parts[1].replace(")", "").trim();
        const r1 = lookupOfficialDigimon(p1);
        if (r1) return r1;
        const r2 = lookupOfficialDigimon(p2);
        if (r2) return r2;
      }

      // 1. 한국어 정확 일치
      if (OFFICIAL_DIGIMON_DB[clean]) {
        const entry = OFFICIAL_DIGIMON_DB[clean];
        return { name: clean, englishName: formatDigiEnglishName(entry.dir), ...entry };
      }

      const normalized = clean.toLowerCase().replace(/[\s\-_]/g, "");

      // 2. 한국어 정규화 일치
      for (const [k, v] of Object.entries(OFFICIAL_DIGIMON_DB)) {
        if (k.toLowerCase().replace(/[\s\-_]/g, "") === normalized) {
          return { name: k, englishName: formatDigiEnglishName(v.dir), ...v };
        }
      }

      // 3. 영문 별칭 매핑 일치 (예: omnimon -> 오메가몬, veemon -> 브이몬)
      if (COMMON_ENGLISH_DIGI_ALIASES[normalized]) {
        const ko = COMMON_ENGLISH_DIGI_ALIASES[normalized];
        if (OFFICIAL_DIGIMON_DB[ko]) {
          const entry = OFFICIAL_DIGIMON_DB[ko];
          return { name: ko, englishName: formatDigiEnglishName(entry.dir), ...entry };
        }
      }

      // 4. 영문 dir 정확 일치 또는 정규화 일치 (예: agumon -> 아구몬, wargreymon -> 워그레이몬)
      for (const [k, v] of Object.entries(OFFICIAL_DIGIMON_DB)) {
        const dir = String(v.dir || "").toLowerCase();
        if (dir === clean.toLowerCase() || dir.replace(/[\s\-_]/g, "") === normalized) {
          return { name: k, englishName: formatDigiEnglishName(v.dir), ...v };
        }
      }

      // 5. 영문 dir 접두사 일치
      for (const [k, v] of Object.entries(OFFICIAL_DIGIMON_DB)) {
        const dirNorm = String(v.dir || "").toLowerCase().replace(/[\s\-_]/g, "");
        if (dirNorm.startsWith(normalized)) {
          return { name: k, englishName: formatDigiEnglishName(v.dir), ...v };
        }
      }

      return null;
    }

    // 프로젝트 내 동일한 이름을 가진 다른 디지몬 찾기 (한/영 호환, 이미지가 등록된 객체 우선)
    function findExistingDigimonByName(name, excludeId = null) {
      if (!name || typeof name !== "string") return null;
      const clean = name.trim().toLowerCase();
      if (!clean) return null;

      // 영문 입력 시 공식 도감의 한글명으로 매핑 시도
      const official = typeof lookupOfficialDigimon === "function" ? lookupOfficialDigimon(clean) : null;
      const targetKo = official ? official.name.trim().toLowerCase() : clean;

      let fallback = null;
      if (project && project.digimons) {
        for (const [id, d] of Object.entries(project.digimons)) {
          if (excludeId && id === excludeId) continue;
          const dNameLower = (d.name || "").trim().toLowerCase();
          if (dNameLower === clean || dNameLower === targetKo) {
            if (d.img && !d.img.includes("sprites/Agumon.gif")) {
              return d;
            }
            if (!fallback) fallback = d;
          }
        }
      }
      return fallback;
    }

    // 한글 및 영문 입력에 대해 실시간으로 일치하는 디지몬 목록 검색 (최대 maxCount개)
    function searchDigimonBilingual(query, maxCount = 15) {
      if (!query || typeof query !== "string") return [];
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const qNorm = q.replace(/[\s\-_]/g, "");

      const results = [];
      const seenNames = new Set();

      // 1. 기존 프로젝트 내 디지몬 우선 매칭
      if (project && project.digimons) {
        for (const d of Object.values(project.digimons)) {
          if (!d.name || seenNames.has(d.name)) continue;
          if (d.stage === "디지타마" || d.name.includes("알")) continue;

          const koNorm = d.name.toLowerCase().replace(/[\s\-_]/g, "");
          const official = typeof lookupOfficialDigimon === "function" ? lookupOfficialDigimon(d.name) : null;
          const engName = official?.englishName || formatDigiEnglishName(official?.dir || "");
          const engNorm = engName.toLowerCase().replace(/[\s\-_]/g, "");
          const imgNorm = (d.img || "").toLowerCase().replace(/[\s\-_]/g, "");

          let score = 0;
          if (koNorm === qNorm || engNorm === qNorm) score = 100;
          else if (koNorm.startsWith(qNorm) || engNorm.startsWith(qNorm)) score = 80;
          else if (koNorm.includes(qNorm) || engNorm.includes(qNorm) || imgNorm.includes(qNorm)) score = 50;

          if (score > 0) {
            seenNames.add(d.name);
            results.push({
              name: d.name,
              englishName: engName,
              stage: d.stage,
              attr: d.attr,
              source: "project",
              score: score + 5
            });
          }
        }
      }

      // 2. 공식 도감 DB (1,310종) 매칭
      if (typeof OFFICIAL_DIGIMON_DB !== "undefined") {
        for (const [k, v] of Object.entries(OFFICIAL_DIGIMON_DB)) {
          if (seenNames.has(k)) continue;
          const koNorm = k.toLowerCase().replace(/[\s\-_]/g, "");
          const engName = formatDigiEnglishName(v.dir || "");
          const engNorm = engName.toLowerCase().replace(/[\s\-_]/g, "");

          let score = 0;
          if (koNorm === qNorm || engNorm === qNorm) score = 100;
          else if (koNorm.startsWith(qNorm) || engNorm.startsWith(qNorm)) score = 80;
          else if (koNorm.includes(qNorm) || engNorm.includes(qNorm)) score = 50;
          else {
            for (const [alias, targetKo] of Object.entries(COMMON_ENGLISH_DIGI_ALIASES)) {
              if (targetKo === k && (alias.startsWith(qNorm) || alias.includes(qNorm))) {
                score = 65;
                break;
              }
            }
          }

          if (score > 0) {
            seenNames.add(k);
            results.push({
              name: k,
              englishName: engName,
              stage: v.stage,
              attr: v.attr,
              source: "official",
              score: score
            });
          }
        }
      }

      results.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
      return results.slice(0, maxCount);
    }

    // 브라우저 및 Electron 앱 공용 비동기 입력 대화상자 (영문/한글 실시간 검색 목록 지원)
    function showCustomPrompt(title, desc, defaultValue = "", placeholder = "", datalistId = "", disableDigiCheck = false) {
      return new Promise((resolve) => {
        const modal = document.getElementById("custom-prompt-modal");
        const titleEl = document.getElementById("custom-prompt-title");
        const descEl = document.getElementById("custom-prompt-desc");
        const inputEl = document.getElementById("custom-prompt-input");
        const suggBox = document.getElementById("custom-prompt-suggestions");
        const infoEl = document.getElementById("custom-prompt-info");
        const btnConfirm = document.getElementById("custom-prompt-confirm");
        const btnCancel = document.getElementById("custom-prompt-cancel");
        const btnClose = document.getElementById("custom-prompt-close");

        if (!modal || !inputEl) {
          const val = prompt(`${title}\n\n${desc}`, defaultValue);
          return resolve(val);
        }

        modal.style.zIndex = "2500";
        titleEl.textContent = title;
        descEl.textContent = desc;
        inputEl.value = defaultValue;
        inputEl.placeholder = placeholder || "입력하세요...";
        if (datalistId) {
          inputEl.setAttribute("list", datalistId);
        } else {
          inputEl.removeAttribute("list");
        }

        let activeSuggIndex = -1;
        let currentSuggestions = [];

        function renderSuggestions() {
          if (!suggBox || disableDigiCheck) return;
          const query = inputEl.value.trim();
          if (!query) {
            suggBox.style.display = "none";
            suggBox.innerHTML = "";
            currentSuggestions = [];
            activeSuggIndex = -1;
            return;
          }

          currentSuggestions = searchDigimonBilingual(query, 12);
          if (currentSuggestions.length === 0) {
            suggBox.style.display = "none";
            suggBox.innerHTML = "";
            activeSuggIndex = -1;
            return;
          }

          activeSuggIndex = -1;
          const attrColorMap = {
            vaccine: "#38BDF8",
            data: "#34D399",
            virus: "#F87171",
            free: "#FBBF24",
            none: "#94A3B8",
            unknown: "#E5E7EB"
          };
          const attrTextMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-", unknown: "불명" };

          let html = "";
          currentSuggestions.forEach((item, idx) => {
            const attrColor = attrColorMap[item.attr] || "#94A3B8";
            const attrText = attrTextMap[item.attr] || item.attr || "-";
            const stageText = item.stage || "성숙기";
            const engText = item.englishName ? `(${escapeHtml(item.englishName)})` : "";
            const isOfficial = item.source === "official";

            html += `
              <div class="custom-prompt-sugg-item" data-idx="${idx}" style="padding:8px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s ease;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <strong style="color:#FFF; font-size:0.88rem;">${escapeHtml(item.name)}</strong>
                  ${engText ? `<span style="color:#38BDF8; font-size:0.78rem; font-family:monospace;">${engText}</span>` : ""}
                </div>
                <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem;">
                  <span style="background:rgba(255,255,255,0.08); color:#CBD5E1; padding:2px 6px; border-radius:4px;">${escapeHtml(stageText)}</span>
                  <span style="color:${attrColor}; font-weight:600;">${escapeHtml(attrText)}</span>
                  ${!isOfficial ? `<span style="background:rgba(87,242,135,0.15); color:#57F287; font-size:0.7rem; padding:1px 4px; border-radius:3px;">등록됨</span>` : ""}
                </div>
              </div>
            `;
          });

          suggBox.innerHTML = html;
          suggBox.style.display = "block";

          suggBox.querySelectorAll(".custom-prompt-sugg-item").forEach(el => {
            el.addEventListener("mouseenter", () => {
              const idx = parseInt(el.dataset.idx, 10);
              highlightSuggestion(idx);
            });
            el.addEventListener("click", () => {
              const idx = parseInt(el.dataset.idx, 10);
              selectSuggestion(idx);
            });
          });
        }

        function highlightSuggestion(idx) {
          const items = suggBox ? suggBox.querySelectorAll(".custom-prompt-sugg-item") : [];
          items.forEach((item, i) => {
            if (i === idx) {
              item.style.background = "rgba(88,101,242,0.3)";
              item.scrollIntoView({ block: "nearest" });
            } else {
              item.style.background = "transparent";
            }
          });
          activeSuggIndex = idx;
        }

        function selectSuggestion(idx) {
          if (idx >= 0 && idx < currentSuggestions.length) {
            const chosen = currentSuggestions[idx];
            inputEl.value = chosen.name;
            if (suggBox) {
              suggBox.style.display = "none";
              suggBox.innerHTML = "";
            }
            currentSuggestions = [];
            activeSuggIndex = -1;
            updateLiveInfo();
            inputEl.focus();
          }
        }

        function updateLiveInfo() {
          if (!infoEl) return;
          if (disableDigiCheck) {
            infoEl.innerHTML = "";
            return;
          }
          const val = inputEl.value.trim();
          if (!val) {
            infoEl.innerHTML = "";
            return;
          }

          // 1) 공식 도감 확인 (영문/한글 모두 지원)
          const official = lookupOfficialDigimon(val);
          const targetKoName = official ? official.name : val;

          // 2) 기존 프로젝트 내 동일 디지몬 확인
          const existing = findExistingDigimonByName(targetKoName);
          if (existing) {
            infoEl.innerHTML = `<span style="color:#57F287; font-weight:600;">✔ 기존 등록 디지몬:</span> [${existing.name}] (${existing.stage} / ${existing.attr || '-'}) 정보 자동 연동`;
            return;
          }

          if (official) {
            const attrMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-", unknown: "불명" };
            const attrKo = attrMap[official.attr] || official.attr;
            const engNote = official.englishName ? ` <span style="color:#38BDF8; font-size:0.75rem;">(${escapeHtml(official.englishName)})</span>` : "";
            infoEl.innerHTML = `<span style="color:#38BDF8; font-weight:600;">📖 공식 도감 일치:</span> [${official.name}]${engNote} (${official.stage} / ${attrKo}) 정보 자동 적용`;
            return;
          }

          infoEl.innerHTML = `<span style="color:#94A3B8;">✨ 새 고유 디지몬으로 생성됩니다.</span>`;
        }

        function onInputChange() {
          updateLiveInfo();
          renderSuggestions();
        }

        if (disableDigiCheck && infoEl) {
          infoEl.innerHTML = "";
        } else {
          updateLiveInfo();
        }

        modal.classList.add("active");

        setTimeout(() => {
          inputEl.focus();
          inputEl.select();
        }, 50);

        function cleanup() {
          modal.classList.remove("active");
          btnConfirm.removeEventListener("click", onConfirm);
          btnCancel.removeEventListener("click", onCancel);
          btnClose.removeEventListener("click", onCancel);
          modal.removeEventListener("click", onBackdrop);
          inputEl.removeEventListener("keydown", onKeyDown);
          inputEl.removeEventListener("input", onInputChange);
          if (suggBox) {
            suggBox.style.display = "none";
            suggBox.innerHTML = "";
          }
          if (infoEl) infoEl.innerHTML = "";
        }

        function onConfirm() {
          let val = inputEl.value.trim();
          // 영문명을 입력하고 엔터를 친 경우 공식 도감의 한글 이름으로 자동 변환
          if (!disableDigiCheck && val) {
            const official = lookupOfficialDigimon(val);
            if (official && official.name) {
              val = official.name;
            }
          }
          cleanup();
          resolve(val);
        }

        function onCancel() {
          cleanup();
          resolve(null);
        }

        function onBackdrop(e) {
          if (e.target === modal) onCancel();
        }

        function onKeyDown(e) {
          if (e.key === "ArrowDown") {
            if (currentSuggestions.length > 0) {
              e.preventDefault();
              activeSuggIndex = (activeSuggIndex + 1) % currentSuggestions.length;
              highlightSuggestion(activeSuggIndex);
            }
          } else if (e.key === "ArrowUp") {
            if (currentSuggestions.length > 0) {
              e.preventDefault();
              activeSuggIndex = (activeSuggIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
              highlightSuggestion(activeSuggIndex);
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeSuggIndex >= 0 && activeSuggIndex < currentSuggestions.length) {
              selectSuggestion(activeSuggIndex);
            } else {
              onConfirm();
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (suggBox && suggBox.style.display !== "none") {
              suggBox.style.display = "none";
            } else {
              onCancel();
            }
          }
        }

        modal.addEventListener("click", onBackdrop);
        btnConfirm.addEventListener("click", onConfirm);
        btnCancel.addEventListener("click", onCancel);
        btnClose.addEventListener("click", onCancel);
        inputEl.addEventListener("keydown", onKeyDown);
        if (!disableDigiCheck) {
          inputEl.addEventListener("input", onInputChange);
        }
      });
    }

