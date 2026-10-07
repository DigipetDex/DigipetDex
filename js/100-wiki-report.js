/* 유저 제보/위키 변경역사/GAS 연동/실시간 조건 배포 */
    // -------------------------------------------------------------
    // 유저 진화 조건 제보 & 관리자 1클릭 트리 연동 시스템 (Google Sheets)
    // -------------------------------------------------------------
    const DEFAULT_GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx1XUIl4kVde4m0G1RhLNiNAloJIR7BVpfvqnSV2Eah8scuEA79Bg3fKYTnqEOttjji/exec";
    let activeReportContext = null;
    let currentReportsCache = [];
    let currentTrashCache = [];
    let currentBlockedUidsCache = [];
    let currentReportsTab = "active"; // "active" (접수된 제보) or "trash" (휴지통)

    // 관리자 토큰 (GAS 스크립트 속성 ADMIN_TOKEN 과 같은 값)
    // ⚠ project 에 넣으면 project_data.js 로 저장·배포되어 공개되므로 localStorage 에만 둔다.
    const ADMIN_TOKEN_STORAGE_KEY = "digipet_admin_token";

    function getAdminToken() {
      try {
        return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
      } catch (e) {
        return "";
      }
    }

    function saveAdminToken() {
      const tokenInput = document.getElementById("report-admin-token-input");
      if (!tokenInput) return;
      const token = tokenInput.value.trim();
      if (token) {
        localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
        showToast("관리자 토큰이 저장되었습니다.");
      } else {
        localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        showToast("관리자 토큰이 삭제되었습니다.");
      }
      fetchReportsFromGas();
    }

    // 관리자 전용 GAS 액션 전송. 토큰이 없거나 틀리면 알림 후 false, 서버 오류는 throw.
    // (no-cors 가 아니라 응답을 읽어서 거부 여부를 확인한다)
    async function postAdminToGas(gasUrl, payload) {
      const token = getAdminToken();
      if (!token) {
        alert("관리자 토큰이 설정되지 않았습니다.\n[📬 제보 확인] 창 상단의 '관리자 토큰' 칸에 토큰을 입력하고 저장해 주세요.");
        return false;
      }
      const res = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ ...payload, adminToken: token })
      });
      const data = await res.json();
      if (data.status === "unauthorized") {
        alert("관리자 토큰이 일치하지 않아 서버가 요청을 거부했습니다.\n토큰을 확인해 주세요. (변경 사항은 서버에 반영되지 않았습니다)");
        return false;
      }
      if (data.status !== "success") {
        throw new Error(data.message || "서버 응답 오류");
      }
      return true;
    }

    // 클라이언트 지속 UID 생성/조회 (분탕 유저 식별 및 차단용)
    function getClientUid() {
      let uid = localStorage.getItem("digipet_client_uid");
      if (!uid) {
        const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
        const time = Date.now().toString(36).slice(-3).toUpperCase();
        uid = `UID-${rand}${time}`;
        localStorage.setItem("digipet_client_uid", uid);
      }
      return uid;
    }

    let cachedMaskedIp = null;

    function maskIpAddress(ip) {
      if (!ip || typeof ip !== "string") return "";
      ip = ip.trim();
      if (ip.includes(".")) {
        const parts = ip.split(".");
        if (parts.length >= 2) {
          return `${parts[0]}.${parts[1]}.*.*`;
        }
      }
      if (ip.includes(":")) {
        const parts = ip.split(":");
        if (parts.length >= 2) {
          return `${parts[0]}:${parts[1]}:*:*`;
        }
      }
      return ip;
    }

    async function getClientMaskedIp() {
      if (cachedMaskedIp !== null) return cachedMaskedIp;

      try {
        const stored = sessionStorage.getItem("digipet_masked_ip");
        if (stored) {
          cachedMaskedIp = stored;
          return cachedMaskedIp;
        }
      } catch (e) {}

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && data.ip) {
            cachedMaskedIp = maskIpAddress(data.ip);
            try {
              sessionStorage.setItem("digipet_masked_ip", cachedMaskedIp);
            } catch (e) {}
            return cachedMaskedIp;
          }
        }
      } catch (err) {
        try {
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 2000);
          const res2 = await fetch("https://api64.ipify.org?format=json", { signal: controller2.signal });
          clearTimeout(timeoutId2);
          if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.ip) {
              cachedMaskedIp = maskIpAddress(data2.ip);
              try {
                sessionStorage.setItem("digipet_masked_ip", cachedMaskedIp);
              } catch (e) {}
              return cachedMaskedIp;
            }
          }
        } catch (e2) {}
      }

      cachedMaskedIp = "";
      return "";
    }

    function getClientFullIdentifier() {
      const uid = getClientUid();
      const ip = cachedMaskedIp;
      return ip ? `${uid} (${ip})` : uid;
    }

    async function updateClientUidDisplays() {
      const fullId = getClientFullIdentifier();
      const headerMyUid = document.getElementById("editor-header-my-uid");
      if (headerMyUid) headerMyUid.textContent = fullId;
      const editorCurrentUid = document.getElementById("editor-current-client-uid");
      if (editorCurrentUid) editorCurrentUid.textContent = fullId;
      const reportModalUid = document.getElementById("report-modal-client-uid");
      if (reportModalUid) reportModalUid.textContent = `UID: ${fullId}`;
    }

    // 뷰어: 특정 디지몬의 진화 조건 제보 모달 열기
    function openReportModalForDigi(digi) {
      if (!digi) return;
      const modal = document.getElementById("report-condition-modal");
      if (!modal) return;

      const currentDim = document.getElementById("filter-dim")?.value || digi.dim || "아구몬 EX";
      const activeEvo = getActiveIncomingEvo(digi.id, activeIncomingFromId);
      let fromDigi = activeEvo ? project.digimons[activeEvo.from] : null;

      if (!fromDigi) {
        const inc = getIncomingEvolutionsForDigi(digi.id);
        if (inc.length > 0) {
          fromDigi = project.digimons[inc[0].from];
        }
      }

      activeReportContext = {
        dim: currentDim,
        fromDigi: fromDigi,
        toDigi: digi,
        fromName: fromDigi ? fromDigi.name : "",
        toName: digi.name
      };

      // 출발 및 진화 디지몬 정보 표시
      const fromNameEl = document.getElementById("report-target-from-name");
      const fromImgEl = document.getElementById("report-target-from-img");
      const toNameEl = document.getElementById("report-target-to-name");
      const toImgEl = document.getElementById("report-target-to-img");
      const dimBadgeEl = document.getElementById("report-target-dim-badge");

      if (fromNameEl) fromNameEl.textContent = fromDigi ? fromDigi.name : "이전 단계 (불명)";
      if (fromImgEl) {
        fromImgEl.src = fromDigi ? (fromDigi.img || "") : "";
        fromImgEl.style.display = fromDigi?.img ? "block" : "none";
      }
      if (toNameEl) toNameEl.textContent = digi.name;
      if (toImgEl) {
        toImgEl.src = digi.img || "";
        toImgEl.style.display = digi.img ? "block" : "none";
      }
      if (dimBadgeEl) dimBadgeEl.textContent = currentDim;

      // 기존 조건 및 기본 스탯 값 사전 채우기 (사용자가 수정하기 편리하도록)
      const inputTime = document.getElementById("report-input-time");
      const inputVital = document.getElementById("report-input-vital");
      const inputPp = document.getElementById("report-input-pp");
      const inputBattle = document.getElementById("report-input-battle");
      const inputWinrate = document.getElementById("report-input-winrate");
      const inputHp = document.getElementById("report-input-hp");
      const inputAp = document.getElementById("report-input-ap");
      const inputSpd = document.getElementById("report-input-spd");
      const inputJogress = document.getElementById("report-input-jogress");
      const inputItem = document.getElementById("report-input-item");
      const inputNote = document.getElementById("report-input-note");

      const req = getEvoRequirements(activeEvo, digi);
      if (inputTime) inputTime.value = (req.time && req.time !== "-") ? req.time : "";
      if (inputVital) inputVital.value = (req.vital !== "" && req.vital !== undefined && req.vital !== null && req.vital !== 0) ? req.vital : (req.vital === 0 ? "0" : "");
      if (inputPp) inputPp.value = (req.pp !== "" && req.pp !== undefined && req.pp !== null) ? req.pp : "";
      if (inputBattle) inputBattle.value = (req.battle && req.battle !== "-") ? req.battle : "";
      if (inputWinrate) inputWinrate.value = (req.winRate && req.winRate !== "-") ? String(req.winRate).replace('%', '') : "";
      if (inputHp) inputHp.value = (digi.baseHp !== undefined && digi.baseHp !== null && digi.baseHp !== "") ? digi.baseHp : "";
      if (inputAp) inputAp.value = (digi.baseAp !== undefined && digi.baseAp !== null && digi.baseAp !== "") ? digi.baseAp : "";
      if (inputSpd) inputSpd.value = (digi.baseSpd !== undefined && digi.baseSpd !== null && digi.baseSpd !== "") ? digi.baseSpd : "";
      if (inputJogress) inputJogress.value = (req.jogress && req.jogress !== "-" && req.jogress !== "없음") ? req.jogress : "";
      if (inputItem) inputItem.value = (req.item && req.item !== "-") ? req.item : "";
      if (inputNote) inputNote.value = req.note || "";
      setReportDungeonSelect(req.dungeon);

      const inputIdle = document.getElementById("report-input-idle");
      if (inputIdle) {
        inputIdle.checked = Boolean(req.isIdle || (req.note && (req.note.includes("방치") || req.note.includes("조건 없음") || req.note.includes("조건없음") || req.note.includes("시간 경과"))));
      }

      const uidEl = document.getElementById("report-modal-client-uid");
      if (uidEl) uidEl.textContent = `UID: ${getClientFullIdentifier()}`;
      getClientMaskedIp().then(() => updateClientUidDisplays());

      modal.style.display = "flex";
    }

    // 던전 값을 화면/비교용으로: "-", "없음", "" → "" / "던전 ★★★" → "★★★"
    function dungeonDisplayValue(val) {
      const v = normalizeDungeonValue(val);
      const str = v === undefined || v === null ? "" : String(v).trim();
      return (str === "-" || str === "없음") ? "" : str;
    }

    // 위키 편집 창의 던전 드롭다운에 현재 값 표시 (별점이 아닌 예전 값은 임시 항목으로)
    function setReportDungeonSelect(val) {
      const sel = document.getElementById("report-input-dungeon");
      if (!sel) return;
      const cur = dungeonDisplayValue(val);
      sel.querySelectorAll("option[data-legacy]").forEach(o => o.remove());
      if (cur && !Array.from(sel.options).some(o => o.value === cur)) {
        const opt = document.createElement("option");
        opt.value = cur;
        opt.textContent = `${cur} (예전 값)`;
        opt.dataset.legacy = "1";
        sel.appendChild(opt);
      }
      sel.value = cur || "-";
    }

    function closeReportModal() {
      const modal = document.getElementById("report-condition-modal");
      if (modal) modal.style.display = "none";
      activeReportContext = null;
    }

    let currentWikiHistoryCache = [];
    try {
      const savedWikiHist = localStorage.getItem("digipet_wiki_history_cache");
      if (savedWikiHist) currentWikiHistoryCache = JSON.parse(savedWikiHist);
    } catch (e) {
      currentWikiHistoryCache = [];
    }
    let currentWikiHistoryFilter = { to: "", dim: "" };

    // Diff 비교 시 빈칸 및 '-'를 동일한 미설정 값으로 정규화하는 헬퍼
    function normalizeDiffVal(v) {
      if (v === undefined || v === null) return "";
      const s = String(v).trim();
      if (s === "-" || s === "null" || s === "undefined") return "";
      return s;
    }

    // 위키 편집 저장 & 즉시 반영 핸들러
    async function submitReport() {
      if (!activeReportContext) return;
      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;

      const inputTime = document.getElementById("report-input-time")?.value.trim() || "";
      const inputVital = document.getElementById("report-input-vital")?.value.trim() || "";
      const inputPp = document.getElementById("report-input-pp")?.value.trim() || "";
      const inputBattle = document.getElementById("report-input-battle")?.value.trim() || "";
      const inputWinrate = document.getElementById("report-input-winrate")?.value.trim() || "";
      const inputHp = document.getElementById("report-input-hp")?.value.trim() || "";
      const inputAp = document.getElementById("report-input-ap")?.value.trim() || "";
      const inputSpd = document.getElementById("report-input-spd")?.value.trim() || "";
      const inputJogress = document.getElementById("report-input-jogress")?.value.trim() || "";
      const inputItem = document.getElementById("report-input-item")?.value.trim() || "";
      let inputNote = document.getElementById("report-input-note")?.value.trim() || "";
      const inputComment = document.getElementById("report-input-comment")?.value.trim() || "";
      const inputIdle = document.getElementById("report-input-idle")?.checked || false;
      // 드롭다운 값: "-" = 없음. 시트에는 "-" 로 보내야 "없음으로 바꿈"이 전달된다 (빈칸은 '이전 값 유지')
      const inputDungeonRaw = document.getElementById("report-input-dungeon")?.value || "-";
      const inputDungeon = inputDungeonRaw === "-" ? "" : inputDungeonRaw;

      if (inputIdle && !inputNote) {
        inputNote = "방치 진화";
      }

      const toDigi = activeReportContext.toDigi;
      const fromDigi = activeReportContext.fromDigi;
      const activeEvo = getActiveIncomingEvo(toDigi.id, activeIncomingFromId);
      const req = getEvoRequirements(activeEvo, toDigi);
      const prevDungeon = dungeonDisplayValue(req.dungeon);
      const dungeonChanged = inputDungeon !== prevDungeon;

      if (!inputTime && !inputVital && !inputPp && !inputBattle && !inputWinrate && !inputJogress && !inputItem && !inputNote && !inputHp && !inputAp && !inputSpd && !inputIdle && !dungeonChanged) {
        alert("최소 하나 이상의 진화 조건, 기본 스탯, 또는 비고 내용을 입력해 주세요.");
        return;
      }

      // 1. 이전 상태 스냅샷 저장 (위키 롤백 및 diff 생성용)
      const prevSnapshot = {
        dim: activeReportContext.dim,
        from: activeReportContext.fromName,
        to: activeReportContext.toName,
        time: req.time || "",
        vital: req.vital !== undefined && req.vital !== null ? req.vital : "",
        pp: req.pp !== undefined && req.pp !== null ? req.pp : "",
        battle: req.battle !== undefined && req.battle !== null ? req.battle : "",
        winRate: req.winRate !== undefined && req.winRate !== null ? req.winRate : "",
        baseHp: toDigi.baseHp !== undefined && toDigi.baseHp !== null ? toDigi.baseHp : "",
        baseAp: toDigi.baseAp !== undefined && toDigi.baseAp !== null ? toDigi.baseAp : "",
        baseSpd: toDigi.baseSpd !== undefined && toDigi.baseSpd !== null ? toDigi.baseSpd : "",
        jogress: req.jogress || "",
        item: req.item || "",
        note: req.note || "",
        dungeon: prevDungeon
      };

      // 2. [즉시 반영] 로컬 인메모리 도감 및 에디터에 변경사항 실시간 적용
      if (inputHp !== "") {
        const hpVal = parseInt(inputHp, 10);
        if (!isNaN(hpVal)) toDigi.baseHp = hpVal;
      }
      if (inputAp !== "") {
        const apVal = parseInt(inputAp, 10);
        if (!isNaN(apVal)) toDigi.baseAp = apVal;
      }
      if (inputSpd !== "") {
        const spdVal = parseInt(inputSpd, 10);
        if (!isNaN(spdVal)) toDigi.baseSpd = spdVal;
      }
      autoSyncAllSameNameDigimons();

      if (activeEvo) {
        if (inputTime !== "") activeEvo.time = inputTime;
        if (inputVital !== "") activeEvo.vital = Number(inputVital);
        if (inputPp !== "") activeEvo.pp = Number(inputPp);
        if (inputBattle !== "") activeEvo.battle = inputBattle;
        if (inputWinrate !== "") activeEvo.winRate = inputWinrate;
        if (inputJogress !== "") activeEvo.jogress = inputJogress;
        if (inputItem !== "") activeEvo.item = inputItem;
        if (inputNote !== "") activeEvo.note = inputNote;
        if (inputIdle) activeEvo.isIdle = true;
        if (dungeonChanged) activeEvo.dungeon = inputDungeon;
      } else {
        if (!toDigi.req) toDigi.req = getDefaultReqForStage(toDigi.stage);
        if (inputTime !== "") toDigi.req.time = inputTime;
        if (inputVital !== "") toDigi.req.vital = Number(inputVital);
        if (inputPp !== "") toDigi.req.pp = Number(inputPp);
        if (inputBattle !== "") toDigi.req.battle = inputBattle;
        if (inputWinrate !== "") toDigi.req.winRate = inputWinrate;
        if (inputJogress !== "") toDigi.req.jogress = inputJogress;
        if (inputItem !== "") toDigi.req.item = inputItem;
        if (inputNote !== "") toDigi.req.note = inputNote;
        if (dungeonChanged) toDigi.req.dungeon = inputDungeon;
      }

      // 모든 incoming 루트를 재평가하여 공개/일부불명/조건불명 상태 정확히 산출
      // (한 루트만 밝혀져도 전체 공개로 뜨는 버그 방지)
      updateDigimonConditionStatus(toDigi);

      saveState();
      renderTree();
      drawConnections();
      if (selectedDigiId) updateSidebar();

      // 1-B. 컨텍스트 보존 및 변경 diff 요약 계산
      const targetCtx = {
        dim: activeReportContext.dim,
        fromName: activeReportContext.fromName,
        toName: activeReportContext.toName
      };

      const diffParts = [];
      const fieldNameMap = {
        time: "진화시간",
        vital: "바이탈",
        pp: "PP",
        battle: "배틀",
        winRate: "승률",
        baseHp: "체력",
        baseAp: "전투력",
        baseSpd: "속도",
        dungeon: "던전",
        jogress: "조그레스",
        item: "아이템",
        note: "비고"
      };

      const newSnapshot = {
        dim: targetCtx.dim,
        from: targetCtx.fromName,
        to: targetCtx.toName,
        time: inputTime !== "" ? inputTime : prevSnapshot.time,
        vital: inputVital !== "" ? Number(inputVital) : prevSnapshot.vital,
        pp: inputPp !== "" ? Number(inputPp) : prevSnapshot.pp,
        battle: inputBattle !== "" ? inputBattle : prevSnapshot.battle,
        winRate: inputWinrate !== "" ? inputWinrate : prevSnapshot.winRate,
        baseHp: inputHp !== "" ? Number(inputHp) : prevSnapshot.baseHp,
        baseAp: inputAp !== "" ? Number(inputAp) : prevSnapshot.baseAp,
        baseSpd: inputSpd !== "" ? Number(inputSpd) : prevSnapshot.baseSpd,
        jogress: inputJogress !== "" ? inputJogress : prevSnapshot.jogress,
        item: inputItem !== "" ? inputItem : prevSnapshot.item,
        note: inputNote !== "" ? inputNote : prevSnapshot.note,
        dungeon: inputDungeon
      };

      for (const k in fieldNameMap) {
        const pV = normalizeDiffVal(prevSnapshot[k]);
        const nV = normalizeDiffVal(newSnapshot[k]);
        if (pV !== nV) {
          diffParts.push(`${fieldNameMap[k]}: ${pV || "-"} → ${nV || "-"}`);
        }
      }
      const localDiffSummary = diffParts.length > 0 ? diffParts.join(", ") : "조건/스탯 갱신";

      // 2. 즉시 낙관적(Optimistic) 로컬 히스토리 기록 (0ms 즉시 역사 반영)
      const localRevId = "R" + (currentWikiHistoryCache.length + 1) + " (방금)";
      const nowStr = new Date().toLocaleString();
      const clientFullId = getClientFullIdentifier();

      const optimisticHistoryItem = {
        revisionId: localRevId,
        timestamp: nowStr,
        dim: targetCtx.dim,
        fromName: targetCtx.fromName,
        toName: targetCtx.toName,
        diffSummary: localDiffSummary,
        prevData: prevSnapshot,
        newData: newSnapshot,
        uid: clientFullId,
        comment: inputComment
      };

      currentWikiHistoryCache.unshift(optimisticHistoryItem);
      try {
        localStorage.setItem("digipet_wiki_history_cache", JSON.stringify(currentWikiHistoryCache.slice(0, 100)));
      } catch (e) {}

      closeReportModal();
      showToast(`[<strong>${escapeHtml(targetCtx.toName)}</strong>] 정보가 도감에 즉시 반영되었습니다!`);

      // 3. [구글 시트 연동] 비동기로 위키 변경 역사 및 실시간 조건 시트에 저장
      if (gasUrl) {
        const ipWait = new Promise(resolve => setTimeout(resolve, 500));
        Promise.race([getClientMaskedIp(), ipWait]).then(() => {
          const payload = {
            action: "wiki_edit",
            uid: getClientFullIdentifier(),
            rawUid: getClientUid(),
            maskedIp: cachedMaskedIp || "",
            dim: targetCtx.dim,
            fromName: targetCtx.fromName,
            toName: targetCtx.toName,
            time: newSnapshot.time,
            vital: newSnapshot.vital,
            pp: newSnapshot.pp,
            battle: newSnapshot.battle,
            winRate: newSnapshot.winRate,
            baseHp: newSnapshot.baseHp,
            baseAp: newSnapshot.baseAp,
            baseSpd: newSnapshot.baseSpd,
            jogress: newSnapshot.jogress,
            item: newSnapshot.item,
            note: newSnapshot.note,
            dungeon: inputDungeonRaw,
            comment: inputComment,
            diffSummary: localDiffSummary,
            prevData: prevSnapshot
          };

          fetch(gasUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
          }).then(() => {
            // 응답이 왔다 = 서버 저장 완료. 바로 최신 역사 동기화
            fetchWikiHistoryFromGas(true);
          }).catch(err => {
            console.warn("위키 구글 시트 저장 실패:", err);
          });
        });
      }
    }

    // 위키 변경 역사 모달 열기 & 닫기
    function openWikiHistoryModal(targetDigiName = "", targetDim = "") {
      const modal = document.getElementById("wiki-history-modal");
      if (!modal) return;

      currentWikiHistoryFilter = {
        to: targetDigiName || "",
        dim: targetDim || ""
      };

      const badgeEl = document.getElementById("wiki-history-target-badge");
      const clearBtn = document.getElementById("btn-wiki-history-filter-clear");

      if (targetDigiName) {
        if (badgeEl) badgeEl.textContent = `[${targetDigiName}] 변경 내역`;
        if (clearBtn) clearBtn.style.display = "inline-block";
      } else {
        if (badgeEl) badgeEl.textContent = "전체 최근 변경 내역";
        if (clearBtn) clearBtn.style.display = "none";
      }

      modal.style.display = "flex";

      // 속도 극대화: 캐시 데이터를 사용해 즉시 화면 렌더링 (0ms)
      renderWikiHistoryListUI();

      // 백그라운드에서 최신 역사 비동기 동기화 (화면 깜빡임 없음)
      fetchWikiHistoryFromGas(true);
    }

    function closeWikiHistoryModal() {
      const modal = document.getElementById("wiki-history-modal");
      if (modal) modal.style.display = "none";
    }

    // 구글 시트에서 위키 변경 역사 가져오기
    async function fetchWikiHistoryFromGas(isSilent = false) {
      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      const listEl = document.getElementById("wiki-history-list");
      const countEl = document.getElementById("wiki-history-count-text");

      if (!listEl) return;

      if (!gasUrl) {
        if (!isSilent) {
          listEl.innerHTML = `
            <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:20px; color:#F87171; font-size:0.85rem; text-align:center;">
              구글 웹 앱 URL이 설정되지 않아 온라인 변경 역사를 조회할 수 없습니다.
            </div>
          `;
        }
        return;
      }

      // 캐시가 비어있고 silent 모드가 아닐 때만 로딩 문구 표시
      if (!isSilent && (!currentWikiHistoryCache || currentWikiHistoryCache.length === 0)) {
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-sub); font-size:0.85rem;"><span style="display:inline-block; animation: spin 1s linear infinite; margin-right:8px;">⏳</span>위키 변경 역사를 불러오는 중...</div>`;
      }

      try {
        // limit=60으로 전역 최신 변경 내역만 신속하게 가져옴 (GAS 단일 슬라이스 조회로 0.3초 내 응답)
        let url = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=get_wiki_history&limit=60&t=${Date.now()}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "success" && Array.isArray(data.history)) {
          // 서버에서 온 데이터의 diffSummary 정제 (기존 구글 시트에 기록된 '- → -' 등의 잔여 허위 변경 완전 제거)
          data.history.forEach(h => {
            h.diffSummary = sanitizeDiffSummary(h.diffSummary, h.prevData, h.newData);
          });

          // 차단 목록 최신화 (위키 역사 응답에서 함께 반환됨)
          if (Array.isArray(data.blockedUids)) {
            currentBlockedUidsCache = data.blockedUids;
            renderBlockedUidsUI();
          }

          // 낙관적 로컬 리비전 중 서버 데이터와 중복되지 않은 것만 유지하고 서버 데이터와 병합
          const serverRevs = new Set(data.history.map(h => String(h.revisionId || "").trim()));
          const serverRevNums = new Set(data.history.map(h => String(h.revisionId || "").replace(/[^0-9]/g, "")).filter(Boolean));

          const pendingLocal = currentWikiHistoryCache.filter(h => {
            const revStr = String(h.revisionId || "");
            if (!revStr.includes("방금")) return false;
            const baseId = revStr.replace(/\s*\(방금\)/, "").trim();
            const num = baseId.replace(/[^0-9]/g, "");

            if (serverRevs.has(baseId) || (num && serverRevNums.has(num))) return false;

            const alreadySaved = data.history.some(sh => 
              sh.toName === h.toName && 
              sh.dim === h.dim && 
              (sh.diffSummary === h.diffSummary || (h.uid && sh.uid && (sh.uid.includes(h.uid) || h.uid.includes(sh.uid))))
            );
            return !alreadySaved;
          });

          currentWikiHistoryCache = [...pendingLocal, ...data.history];
          try {
            localStorage.setItem("digipet_wiki_history_cache", JSON.stringify(currentWikiHistoryCache.slice(0, 100)));
          } catch (e) {}
          renderWikiHistoryListUI();
        } else {
          throw new Error(data.message || "응답 형식이 올바르지 않습니다.");
        }
      } catch (err) {
        if (!isSilent) {
          console.error("위키 역사 로드 실패:", err);
          if (!currentWikiHistoryCache || currentWikiHistoryCache.length === 0) {
            listEl.innerHTML = `
              <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:20px; color:#F87171; font-size:0.85rem; text-align:center;">
                변경 내역을 불러오지 못했습니다: ${escapeHtml(err.message)}
              </div>
            `;
          }
        }
      }
    }

    // 불필요한 "- → -" 및 동일 값 변경을 제거하는 Diff 요약 정제 헬퍼
    function sanitizeDiffSummary(diffStr, prevData, newData) {
      if (!diffStr) return "조건/스탯 갱신";
      if (diffStr.startsWith("[되돌림]")) return diffStr;

      // 1. prevData와 newData 스냅샷이 존재하는 경우, 스냅샷 기준으로 정확하게 diff 재계산
      if (prevData && newData) {
        let pObj = typeof prevData === "string" ? null : prevData;
        let nObj = typeof newData === "string" ? null : newData;
        try { if (!pObj && typeof prevData === "string") pObj = JSON.parse(prevData); } catch (e) {}
        try { if (!nObj && typeof newData === "string") nObj = JSON.parse(newData); } catch (e) {}

        if (pObj && nObj) {
          const fieldNameMap = {
            time: "진화시간",
            vital: "바이탈",
            pp: "PP",
            battle: "배틀",
            winRate: "승률",
            baseHp: "체력",
            baseAp: "전투력",
            baseSpd: "속도",
            jogress: "조그레스",
            item: "아이템",
            note: "비고"
          };
          const parts = [];
          for (const k in fieldNameMap) {
            const pV = normalizeDiffVal(pObj[k]);
            const nV = normalizeDiffVal(nObj[k]);
            if (pV !== nV) {
              parts.push(`${fieldNameMap[k]}: ${pV || "-"} → ${nV || "-"}`);
            }
          }
          if (parts.length > 0) return parts.join(", ");
        }
      }

      // 2. 문자열 단위에서 "- → -" 및 동일한 값 변경 패턴 필터링
      const parts = diffStr.split(",").map(s => s.trim()).filter(Boolean);
      const cleanParts = parts.filter(p => {
        const m = p.match(/^([^:]+):\s*(.+?)\s*→\s*(.+?)$/);
        if (!m) return true;
        const fromVal = normalizeDiffVal(m[2]);
        const toVal = normalizeDiffVal(m[3]);
        if (fromVal === toVal) return false;
        return true;
      });

      return cleanParts.length > 0 ? cleanParts.join(", ") : "조건/스탯 갱신";
    }

    // 타임스탬프 포맷팅 헬퍼
    function formatHistoryTimestamp(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString("ko-KR", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
      });
    }

    // 위키 변경 역사 목록 UI 렌더링
    function renderWikiHistoryListUI() {
      const listEl = document.getElementById("wiki-history-list");
      const countEl = document.getElementById("wiki-history-count-text");
      if (!listEl) return;

      let itemsToRender = currentWikiHistoryCache || [];
      if (currentWikiHistoryFilter.to) {
        const filterToLower = currentWikiHistoryFilter.to.trim().toLowerCase();
        itemsToRender = itemsToRender.filter(h => (h.toName || "").toLowerCase().includes(filterToLower));
      }
      if (currentWikiHistoryFilter.dim) {
        const filterDimLower = currentWikiHistoryFilter.dim.trim().toLowerCase();
        itemsToRender = itemsToRender.filter(h => !h.dim || h.dim.toLowerCase().includes(filterDimLower));
      }

      if (itemsToRender.length === 0) {
        listEl.innerHTML = `
          <div style="text-align:center; padding:50px 20px; color:var(--text-sub); font-size:0.85rem;">
            등록된 위키 변경 내역이 없습니다.
          </div>
        `;
        if (countEl) countEl.textContent = "총 0건의 기록";
        return;
      }

      if (countEl) countEl.textContent = `총 ${itemsToRender.length}건의 기록`;

      let html = "";
      itemsToRender.forEach((item, idx) => {
        let prevDataObj = {};
        try {
          if (item.prevData) prevDataObj = typeof item.prevData === "string" ? JSON.parse(item.prevData) : item.prevData;
        } catch (e) {}

        const targetDigi = findDigimonByNameOrId(item.toName);
        const fromDigi = item.fromName ? findDigimonByNameOrId(item.fromName) : null;
        const targetImg = targetDigi?.img || "";
        const fromImg = fromDigi?.img || "";

        const isRevertLog = item.diffSummary && item.diffSummary.startsWith("[되돌림]");
        const histItemUid = (item.uid || "").trim();
        const isBlockedEditor = histItemUid && histItemUid !== "익명" && currentBlockedUidsCache.some(b => {
          const bStr = String(b || "").trim();
          return bStr && (histItemUid.includes(bStr) || bStr.includes(histItemUid));
        });
        const cardBorderColor = isBlockedEditor ? 'rgba(220,38,38,0.55)' : (isRevertLog ? '#6366F1' : 'rgba(255,255,255,0.08)');

        html += `
          <div style="background: ${isBlockedEditor ? '#231A1A' : '#23272A'}; border: 1px solid ${cardBorderColor}; border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
            <!-- 상단 헤더 행 -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="background: ${isRevertLog ? '#4F46E5' : '#374151'}; color: #FFF; font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${escapeHtml(item.revisionId || ('#' + (idx+1)))}</span>
                <span style="font-size: 0.75rem; color: #94A3B8;">${escapeHtml(formatHistoryTimestamp(item.timestamp || ''))}</span>
                <span style="background: rgba(88,101,242,0.2); color: #C4B5FD; font-size: 0.72rem; padding: 1px 6px; border-radius: 4px; font-weight: 600;">${escapeHtml(item.dim || '-')}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 0.72rem; color: ${isBlockedEditor ? '#FCA5A5' : '#38BDF8'}; font-family: monospace; background: ${isBlockedEditor ? 'rgba(220,38,38,0.2)' : 'rgba(56,189,248,0.1)'}; border: 1px solid ${isBlockedEditor ? 'rgba(220,38,38,0.45)' : 'rgba(56,189,248,0.25)'}; padding: 2px 8px; border-radius: 4px;" title="편집자 식별 번호">
                  ${escapeHtml(histItemUid || '익명')}
                </span>
                ${isBlockedEditor ? '<span style="font-size:0.68rem; background:#DC2626; color:#FFF; padding:2px 6px; border-radius:3px; font-weight:700;">차단됨</span>' : ''}
              </div>
            </div>

            <!-- 디지몬 진화 경로 및 변경 요약 -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${fromImg ? `<img src="${encodeURI(fromImg)}" style="width:24px; height:24px; object-fit:contain; image-rendering:pixelated;">` : ''}
                <span style="font-size: 0.85rem; color: #E2E8F0; font-weight: 600;">${escapeHtml(item.fromName || '시작')}</span>
                <span style="color: #64748B;">➔</span>
                ${targetImg ? `<img src="${encodeURI(targetImg)}" style="width:24px; height:24px; object-fit:contain; image-rendering:pixelated;">` : ''}
                <strong style="font-size: 0.9rem; color: #57F287;">${escapeHtml(item.toName || '-')}</strong>
              </div>

              <!-- 변경 Diff 요약 -->
              <div style="font-size: 0.8rem; color: ${isRevertLog ? '#A5B4FC' : '#FDE047'}; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <span>${escapeHtml(sanitizeDiffSummary(item.diffSummary || '수정', item.prevData, item.newData))}</span>
              </div>
            </div>

            <!-- 편집 코멘트 및 버튼 영역 -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 2px;">
              <div style="font-size: 0.75rem; color: #CBD5E1; font-style: ${item.comment ? 'normal' : 'italic'};">
                ${item.comment ? `사유: <span style="color:#FFF; font-weight:600;">${escapeHtml(item.comment)}</span>` : '<span style="color:#64748B;">사유 미기재</span>'}
              </div>

              <div style="display: flex; gap: 6px; align-items: center;">
                ${histItemUid && histItemUid !== '익명' ? (isBlockedEditor ? `
                  <button type="button" class="btn-wiki-unblock-uid editor-only" data-uid="${escapeHtml(histItemUid)}" style="padding: 4px 9px; font-size: 0.73rem; background: #065F46; color: #A7F3D0; border: 1px solid #059669; border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 3px;" title="이 편집자 UID 차단 해제">
                    🔓 차단 해제
                  </button>
                ` : `
                  <button type="button" class="btn-wiki-block-uid editor-only" data-uid="${escapeHtml(histItemUid)}" style="padding: 4px 9px; font-size: 0.73rem; background: rgba(220,38,38,0.18); color: #FCA5A5; border: 1px solid rgba(220,38,38,0.5); border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 3px;" title="이 편집자 UID 차단 (이후 위키 편집 및 제보 불가)">
                    🚫 UID 차단
                  </button>
                `) : ''}
                <button type="button" class="btn-wiki-delete-action editor-only" data-rev-id="${escapeHtml(item.revisionId)}" style="padding: 4px 8px; font-size: 0.73rem; background: #2B2D31; color: #FCA5A5; border: 1px solid rgba(239,68,68,0.4); border-radius: 4px; cursor: pointer; font-weight: 600;" title="이 변경 내역 항목을 삭제합니다 (에디터 전용)">
                  <span>내역 삭제</span>
                </button>
                <button type="button" class="btn-wiki-restore-version" data-rev-id="${escapeHtml(item.revisionId)}" style="padding: 4px 10px; font-size: 0.75rem; background: #2563EB; color: #FFF; border: none; border-radius: 4px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(37,99,235,0.35);" title="이 리비전(버전)에 입력되었던 데이터 내용으로 도감을 복원합니다.">
                  <span>↺ 이 버전으로 복구</span>
                </button>
                ${idx === 0 ? `<button type="button" class="btn-wiki-revert-action" data-rev-id="${escapeHtml(item.revisionId)}" style="padding: 4px 9px; font-size: 0.73rem; background: #2B2D31; color: #FCA5A5; border: 1px solid rgba(220,38,38,0.4); border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 3px;" title="가장 최근 편집이 발생하기 전 상태로 되돌립니다.">
                  <span>↩ 최근 편집 취소</span>
                </button>` : ''}
              </div>
            </div>

          </div>
        `;
      });

      listEl.innerHTML = html;

      // 이 버전으로 복구 버튼 이벤트 연결 (해당 리비전의 입력 데이터로 복원)
      const restoreBtns = listEl.querySelectorAll(".btn-wiki-restore-version");
      restoreBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const revId = btn.dataset.revId;
          revertWikiRevision(revId, "restore");
        });
      });

      // 이 편집 취소 버튼 이벤트 연결 (해당 리비전 직전 상태로 되돌리기)
      const revertBtns = listEl.querySelectorAll(".btn-wiki-revert-action");
      revertBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const revId = btn.dataset.revId;
          revertWikiRevision(revId, "undo");
        });
      });

      // 내역 개별 삭제 버튼 이벤트 연결 (에디터 전용)
      const deleteBtns = listEl.querySelectorAll(".btn-wiki-delete-action");
      deleteBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const revId = btn.dataset.revId;
          deleteWikiRevision(revId);
        });
      });

      // UID 차단 버튼 이벤트 연결 (에디터 전용)
      listEl.querySelectorAll(".btn-wiki-block-uid").forEach(btn => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.uid;
          handleBlockUid(uid);
        });
      });

      // UID 차단 해제 버튼 이벤트 연결 (에디터 전용)
      listEl.querySelectorAll(".btn-wiki-unblock-uid").forEach(btn => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.uid;
          handleUnblockUid(uid);
        });
      });
    }

    // 에디터 전용: 특정 위키 변경 내역 개별 삭제
    async function deleteWikiRevision(revId) {
      if (!confirm(`리비전 [${revId}] 변경 내역을 삭제하시겠습니까?\n\n※ 테스트용 내역 등을 정리할 때 사용하며, 디지몬의 현재 조건 상태는 유지됩니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;

      // 로컬 캐시 즉시 제거 및 UI 갱신 (0ms 체감)
      currentWikiHistoryCache = currentWikiHistoryCache.filter(h => String(h.revisionId) !== String(revId));
      try {
        localStorage.setItem("digipet_wiki_history_cache", JSON.stringify(currentWikiHistoryCache.slice(0, 100)));
      } catch (e) {}
      renderWikiHistoryListUI();
      showToast(`리비전 [${revId}] 내역이 삭제되었습니다.`);

      // 구글 시트 연동 삭제 전송
      if (gasUrl) {
        try {
          await postAdminToGas(gasUrl, { action: "delete_wiki_history", revisionId: revId });
        } catch (e) {
          console.warn("구글 시트 위키 내역 삭제 전송 실패:", e);
        }
      }
    }

    // 에디터 전용: 위키 변경 내역 전체 비우기
    async function clearAllWikiHistory() {
      if (!currentWikiHistoryCache || currentWikiHistoryCache.length === 0) {
        alert("삭제할 위키 변경 내역이 없습니다.");
        return;
      }
      if (!confirm(`현재 기록된 총 ${currentWikiHistoryCache.length}건의 위키 변경 내역을 모두 비우시겠습니까?\n\n⚠️ 구글 시트의 위키 역사 시트에서도 모든 변경 기록이 영구 삭제됩니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;

      currentWikiHistoryCache = [];
      try {
        localStorage.removeItem("digipet_wiki_history_cache");
      } catch (e) {}
      renderWikiHistoryListUI();
      showToast("모든 위키 변경 내역이 비워졌습니다.");

      if (gasUrl) {
        try {
          await postAdminToGas(gasUrl, { action: "clear_all_wiki_history" });
        } catch (e) {
          console.warn("구글 시트 위키 내역 전체 비우기 실패:", e);
        }
      }
    }

    // 특정 리비전 복구 또는 편집 취소
    async function revertWikiRevision(revId, mode = "restore") {
      const item = currentWikiHistoryCache.find(h => String(h.revisionId) === String(revId));
      if (!item) {
        alert("리비전 정보를 찾을 수 없습니다.");
        return;
      }

      let dataToApply = null;
      if (mode === "restore") {
        // [이 버전으로 복구]: 해당 리비전이 생성/입력한 newData 적용
        try {
          dataToApply = typeof item.newData === "string" ? JSON.parse(item.newData) : item.newData;
        } catch (e) { dataToApply = null; }
        if (!dataToApply && item.prevData) {
          try { dataToApply = typeof item.prevData === "string" ? JSON.parse(item.prevData) : item.prevData; } catch (e) {}
        }
      } else {
        // [이 편집 취소]: 해당 리비전 이전의 prevData 적용
        try {
          dataToApply = typeof item.prevData === "string" ? JSON.parse(item.prevData) : item.prevData;
        } catch (e) { dataToApply = null; }
      }

      if (!dataToApply || Object.keys(dataToApply).length === 0) {
        alert("복원할 데이터가 보존되어 있지 않습니다.");
        return;
      }

      const targetDigi = findDigimonByNameOrId(item.toName);
      if (!targetDigi) {
        alert(`도감에서 [${item.toName}] 디지몬을 찾을 수 없습니다.`);
        return;
      }

      const formattedTs = formatHistoryTimestamp(item.timestamp);
      let confirmMsg = "";
      if (mode === "restore") {
        const hpStr = dataToApply.baseHp !== undefined && dataToApply.baseHp !== "" ? dataToApply.baseHp : "-";
        const apStr = dataToApply.baseAp !== undefined && dataToApply.baseAp !== "" ? dataToApply.baseAp : "-";
        const spdStr = dataToApply.baseSpd !== undefined && dataToApply.baseSpd !== "" ? dataToApply.baseSpd : "-";
        confirmMsg = `[${item.toName}] 디지몬을 리비전 #${item.revisionId} (${formattedTs}, 작성자: ${item.uid}) 당시의 입력 내용으로 복구하시겠습니까?\n\n복구될 주요 내용:\n` +
          `체력(HP): ${hpStr}, 전투력(AP): ${apStr}, 속도(SPD): ${spdStr}\n` +
          `진화시간: ${dataToApply.time || '-'}, 바이탈: ${dataToApply.vital || '-'}, PP: ${dataToApply.pp || '-'}, 배틀: ${dataToApply.battle || '-'}, 승률: ${dataToApply.winRate || '-'}`;
      } else {
        confirmMsg = `[${item.toName}] 디지몬의 리비전 #${item.revisionId} (${formattedTs}) 편집을 취소하고, 편집 직전 상태로 되돌리시겠습니까?\n\n취소될 변경 내용:\n${item.diffSummary}`;
      }

      if (!confirm(confirmMsg)) return;

      // 1. [로컬 즉시 복원]
      const targetNameLower = (item.toName || "").trim().toLowerCase();
      const normalizeStat = (v) => {
        if (v === undefined || v === null) return "";
        const s = String(v).trim();
        return (s === "" || s === "-" || s === "null" || s === "undefined" || isNaN(Number(s))) ? "" : Number(s);
      };

      const restoredHp = dataToApply.baseHp !== undefined ? normalizeStat(dataToApply.baseHp) : (targetDigi.baseHp !== undefined ? targetDigi.baseHp : "");
      const restoredAp = dataToApply.baseAp !== undefined ? normalizeStat(dataToApply.baseAp) : (targetDigi.baseAp !== undefined ? targetDigi.baseAp : "");
      const restoredSpd = dataToApply.baseSpd !== undefined ? normalizeStat(dataToApply.baseSpd) : (targetDigi.baseSpd !== undefined ? targetDigi.baseSpd : "");

      // 동명 디지몬 전체 스탯 복원 및 동기화 (autoSyncAllSameNameDigimons의 donor 덮어쓰기 방지)
      const targetDigis = Object.values(project.digimons).filter(d => d.name && d.name.trim().toLowerCase() === targetNameLower);
      targetDigis.forEach(d => {
        d.baseHp = restoredHp;
        d.baseAp = restoredAp;
        d.baseSpd = restoredSpd;
      });

      const normalizeVal = (v) => {
        if (v === undefined || v === null) return "";
        const s = String(v).trim();
        return (s === "-" || s === "null" || s === "undefined") ? "" : s;
      };

      // 매칭되는 진화선 찾기
      const targetDigiIds = new Set(targetDigis.map(d => d.id));
      let matchedEvos = [];
      if (item.fromName) {
        const fromLower = item.fromName.trim().toLowerCase();
        matchedEvos = project.evolutions.filter(ev => {
          if (!targetDigiIds.has(ev.to)) return false;
          const fD = project.digimons[ev.from];
          return fD && fD.name && fD.name.trim().toLowerCase() === fromLower;
        });
      }
      if (matchedEvos.length === 0) {
        matchedEvos = project.evolutions.filter(ev => targetDigiIds.has(ev.to));
      }

      const restoredTime = dataToApply.time !== undefined ? dataToApply.time : (targetDigi.req?.time || "");
      const restoredVital = dataToApply.vital !== undefined ? normalizeVal(dataToApply.vital) : (targetDigi.req?.vital !== undefined ? targetDigi.req.vital : "");
      const restoredPp = dataToApply.pp !== undefined ? normalizeVal(dataToApply.pp) : (targetDigi.req?.pp !== undefined ? targetDigi.req.pp : "");
      const restoredBattle = dataToApply.battle !== undefined ? normalizeVal(dataToApply.battle) : (targetDigi.req?.battle || "");
      const restoredWinRate = dataToApply.winRate !== undefined ? normalizeVal(dataToApply.winRate) : (targetDigi.req?.winRate || "");
      const restoredJogress = dataToApply.jogress !== undefined ? normalizeVal(dataToApply.jogress) : (targetDigi.req?.jogress || "");
      const restoredItem = dataToApply.item !== undefined ? normalizeVal(dataToApply.item) : (targetDigi.req?.item || "");
      const restoredNote = dataToApply.note !== undefined ? dataToApply.note : (targetDigi.req?.note || "");
      const restoredDungeon = dataToApply.dungeon !== undefined ? dungeonDisplayValue(dataToApply.dungeon) : null;

      matchedEvos.forEach(ev => {
        ev.time = restoredTime;
        ev.vital = restoredVital !== "" ? Number(restoredVital) : "";
        ev.pp = restoredPp !== "" ? Number(restoredPp) : "";
        ev.battle = restoredBattle;
        ev.winRate = restoredWinRate;
        ev.jogress = restoredJogress;
        ev.item = restoredItem;
        ev.note = restoredNote;
        if (restoredDungeon !== null) ev.dungeon = restoredDungeon;
      });

      targetDigis.forEach(d => {
        if (!d.req) d.req = getDefaultReqForStage(d.stage);
        d.req.time = restoredTime;
        d.req.vital = restoredVital !== "" ? Number(restoredVital) : "";
        d.req.pp = restoredPp !== "" ? Number(restoredPp) : "";
        d.req.battle = restoredBattle;
        d.req.winRate = restoredWinRate;
        d.req.jogress = restoredJogress;
        d.req.item = restoredItem;
        d.req.note = restoredNote;
        if (restoredDungeon !== null) d.req.dungeon = restoredDungeon;
      });

      // 복원된 디지몬의 DiM으로 전환 및 디지몬 자동 선택하여 사이드바에 즉각 반영
      if (item.dim && project.dims && project.dims.includes(item.dim) && filterDim !== item.dim) {
        filterDim = item.dim;
        const filterSelect = document.getElementById("filter-dim");
        if (filterSelect) filterSelect.value = filterDim;
      }
      selectedDigiId = targetDigi.id;

      saveState();
      renderTree();
      drawConnections();
      updateSidebar();

      showToast(`[<strong>${escapeHtml(item.toName)}</strong>] 디지몬이 성공적으로 복구되었습니다!`);

      // 1-C. 롤백 이력 즉시 낙관적 로컬 반영 (0ms 화면 갱신)
      const revertLocalId = "R" + (currentWikiHistoryCache.length + 1) + " (방금)";
      const revertHistItem = {
        revisionId: revertLocalId,
        timestamp: new Date().toLocaleString(),
        dim: item.dim,
        fromName: item.fromName,
        toName: item.toName,
        diffSummary: `[되돌림] 리비전 #${item.revisionId} ${mode === "restore" ? "버전 복구" : "편집 취소"}`,
        prevData: item.newData,
        newData: dataToApply,
        uid: getClientFullIdentifier(),
        comment: `리비전 #${item.revisionId} (${formattedTs}) ${mode === "restore" ? "버전 내용으로 복구" : "편집 직전 상태로 복구"}`
      };
      currentWikiHistoryCache.unshift(revertHistItem);
      try {
        localStorage.setItem("digipet_wiki_history_cache", JSON.stringify(currentWikiHistoryCache.slice(0, 100)));
      } catch (e) {}
      renderWikiHistoryListUI();

      // 2. [구글 시트 연동] wiki_revert 전송
      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      if (gasUrl) {
        await getClientMaskedIp();
        const payload = {
          action: "wiki_revert",
          revisionId: item.revisionId,
          dim: item.dim,
          fromName: item.fromName,
          toName: item.toName,
          targetData: dataToApply,
          uid: getClientFullIdentifier(),
          rawUid: getClientUid(),
          maskedIp: cachedMaskedIp || "",
          comment: `리비전 #${item.revisionId} (${formattedTs}) ${mode === "restore" ? "버전 내용으로 복구" : "편집 직전 상태로 복구"}`
        };

        try {
          await fetch(gasUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
          });
          fetchWikiHistoryFromGas(true);
          fetchAndApplyLiveConditions();
        } catch (e) {
          console.warn("구글 시트 롤백 전송 실패:", e);
        }
      }
    }

    // 에디터: 제보 확인 모달 열기 & 닫기
    function openReviewReportsModal() {
      const modal = document.getElementById("review-reports-modal");
      if (!modal) return;
      modal.style.display = "flex";

      const myUidEl = document.getElementById("editor-current-client-uid");
      if (myUidEl) myUidEl.textContent = getClientFullIdentifier();
      getClientMaskedIp().then(() => updateClientUidDisplays());

      const urlInput = document.getElementById("report-gas-url-input");
      const savedUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      if (urlInput) {
        urlInput.value = savedUrl;
      }
      const tokenInput = document.getElementById("report-admin-token-input");
      if (tokenInput) {
        tokenInput.value = getAdminToken();
      }

      switchReportsTab(currentReportsTab || "active");

      if (savedUrl) {
        fetchReportsFromGas();
      }
    }

    function closeReviewReportsModal() {
      const modal = document.getElementById("review-reports-modal");
      if (modal) modal.style.display = "none";
    }

    // 구글 시트 웹 앱 URL 저장
    function saveGasWebhookUrl() {
      const urlInput = document.getElementById("report-gas-url-input");
      if (!urlInput) return;
      const url = urlInput.value.trim();
      if (!url) {
        if (confirm("등록된 웹 앱 URL을 삭제하시겠습니까?")) {
          delete project.gasWebhookUrl;
          localStorage.removeItem("digipet_gas_webhook_url");
          saveState();
          showToast("구글 웹 앱 URL이 삭제되었습니다.");
        }
        return;
      }

      if (!url.startsWith("https://script.google.com/")) {
        alert("올바른 Google Apps Script 웹 앱 URL 형식이 아닙니다.\n(https://script.google.com/macros/s/.../exec)");
        return;
      }

      project.gasWebhookUrl = url;
      localStorage.setItem("digipet_gas_webhook_url", url);
      saveState();
      showToast("구글 웹 앱 URL이 저장되었습니다!");
      fetchReportsFromGas();
    }

    // 구글 시트에서 제보 목록 가져오기 (GET)
    async function fetchReportsFromGas() {
      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      const listEl = document.getElementById("review-reports-list");
      const countEl = document.getElementById("review-reports-count");
      const badgeEl = document.getElementById("report-badge-count");

      if (!listEl) return;

      if (!gasUrl) {
        listEl.innerHTML = `
          <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:16px; color:#F87171; font-size:0.85rem; text-align:center;">
            ⚠️ 구글 웹 앱 URL이 설정되지 않았습니다.<br>
            상단 입력창에 Google Apps Script 웹 앱 배포 URL을 입력하고 [저장]을 눌러주세요.
          </div>
        `;
        return;
      }

      const adminToken = getAdminToken();
      if (!adminToken) {
        listEl.innerHTML = `
          <div style="background:rgba(250,204,21,0.12); border:1px solid rgba(250,204,21,0.35); border-radius:8px; padding:16px; color:#FDE68A; font-size:0.85rem; text-align:center;">
            🔑 관리자 토큰이 설정되지 않았습니다.<br>
            상단 '관리자 토큰' 칸에 GAS 스크립트 속성 ADMIN_TOKEN 과 같은 값을 입력하고 [저장]을 눌러주세요.
          </div>
        `;
        return;
      }

      listEl.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-sub); font-size:0.85rem;">⏳ 구글 시트에서 제보 내역을 불러오는 중...</div>`;

      try {
        const listUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}adminToken=${encodeURIComponent(adminToken)}`;
        const res = await fetch(listUrl);
        const data = await res.json();

        if (data.status === "unauthorized") {
          throw new Error("관리자 토큰이 일치하지 않습니다. 토큰을 확인해 주세요.");
        }
        if (data.status === "success" && Array.isArray(data.reports)) {
          currentReportsCache = data.reports;
          currentTrashCache = Array.isArray(data.trash) ? data.trash : [];
          currentBlockedUidsCache = Array.isArray(data.blockedUids) ? data.blockedUids : [];
          renderReportsListUI();
          renderBlockedUidsUI();
        } else {
          throw new Error(data.message || "응답 데이터 형식이 올바르지 않습니다.");
        }
      } catch (err) {
        console.error("제보 불러오기 에러:", err);
        listEl.innerHTML = `
          <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:16px; color:#F87171; font-size:0.85rem; text-align:center;">
            ❌ 제보 목록을 불러오지 못했습니다.<br>
            <span style="font-size:0.75rem; color:#DDD;">사유: ${escapeHtml(err.message)}</span><br><br>
            <span style="font-size:0.75rem; color:#94A3B8;">구글 앱 스크립트 배포 시 액세스 권한이 <strong>'모든 사용자(Anyone)'</strong>로 설정되어 있는지 확인하세요.</span>
          </div>
        `;
      }
    }

    // 탭 전환 핸들러 ([📥 접수된 제보] vs [🗑️ 휴지통])
    function switchReportsTab(tabName) {
      currentReportsTab = tabName;
      const activeTabBtn = document.getElementById("tab-btn-active-reports");
      const trashTabBtn = document.getElementById("tab-btn-trash-reports");
      const trashToolbar = document.getElementById("trash-tab-toolbar");
      const clearAllBtn = document.getElementById("btn-clear-all-reports");

      if (tabName === "trash") {
        if (trashTabBtn) {
          trashTabBtn.style.borderBottom = "2px solid #F87171";
          trashTabBtn.style.color = "#F87171";
          trashTabBtn.style.fontWeight = "700";
        }
        if (activeTabBtn) {
          activeTabBtn.style.borderBottom = "2px solid transparent";
          activeTabBtn.style.color = "#94A3B8";
          activeTabBtn.style.fontWeight = "600";
        }
        if (trashToolbar) trashToolbar.style.display = "flex";
        if (clearAllBtn) clearAllBtn.style.display = "none";
      } else {
        if (activeTabBtn) {
          activeTabBtn.style.borderBottom = "2px solid #38BDF8";
          activeTabBtn.style.color = "#38BDF8";
          activeTabBtn.style.fontWeight = "700";
        }
        if (trashTabBtn) {
          trashTabBtn.style.borderBottom = "2px solid transparent";
          trashTabBtn.style.color = "#94A3B8";
          trashTabBtn.style.fontWeight = "600";
        }
        if (trashToolbar) trashToolbar.style.display = "none";
        if (clearAllBtn) clearAllBtn.style.display = "inline-flex";
      }

      renderReportsListUI();
    }

    // 차단된 UID 관리 패널 UI 렌더링
    function renderBlockedUidsUI() {
      const badge = document.getElementById("blocked-count-badge");
      const tagsContainer = document.getElementById("blocked-uids-tags");
      if (badge) badge.textContent = currentBlockedUidsCache.length;
      if (!tagsContainer) return;

      if (currentBlockedUidsCache.length === 0) {
        tagsContainer.innerHTML = `<span style="font-size:0.74rem; color:#94A3B8;">차단된 UID가 없습니다.</span>`;
        return;
      }

      tagsContainer.innerHTML = currentBlockedUidsCache.map(uid => `
        <span style="display:inline-flex; align-items:center; gap:5px; background:rgba(220,38,38,0.22); border:1px solid rgba(220,38,38,0.55); color:#FECACA; padding:2px 8px; border-radius:4px; font-size:0.74rem; font-family:monospace;">
          <span>👤 ${escapeHtml(uid)}</span>
          <button type="button" class="btn-unblock-tag" data-uid="${escapeHtml(uid)}" style="background:none; border:none; color:#F87171; cursor:pointer; font-weight:bold; padding:0 2px; font-size:0.85rem; line-height:1;" title="차단 해제">✕</button>
        </span>
      `).join("");

      tagsContainer.querySelectorAll(".btn-unblock-tag").forEach(btn => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.uid;
          if (uid) handleUnblockUid(uid);
        });
      });
    }

    // UID 차단 실행 핸들러
    async function handleBlockUid(uid) {
      if (!uid) return;
      if (!confirm(`제보자 [${uid}] 를 차단하시겠습니까?\n\n차단된 UID는 더 이상 새로운 제보를 제출할 수 없게 됩니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      if (!currentBlockedUidsCache.includes(uid)) {
        currentBlockedUidsCache.push(uid);
      }
      renderBlockedUidsUI();
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (!(await postAdminToGas(gasUrl, { action: "block_uid", uid: uid, reason: "관리자 차단" }))) return;
        } catch (e) {
          console.error("UID 차단 요청 실패:", e);
        }
      }

      // 해당 UID가 남긴 다른 제보도 함께 휴지통으로 이동할지 확인
      const sameUidReports = currentReportsCache.filter(r => r.uid === uid);
      if (sameUidReports.length > 0) {
        if (confirm(`차단된 [${uid}] 사용자가 작성한 기존 제보(${sameUidReports.length}건)도 모두 휴지통으로 이동하시겠습니까?`)) {
          const nowStr = new Date().toLocaleString();
          sameUidReports.forEach(r => {
            currentTrashCache.push({ ...r, deletedAt: nowStr });
          });
          currentReportsCache = currentReportsCache.filter(r => r.uid !== uid);
          renderReportsListUI();
          if (gasUrl) {
            try {
              await postAdminToGas(gasUrl, { action: "delete_by_uid", uid: uid });
            } catch (e) {
              console.error("UID 제보 일괄 휴지통 이동 요청 실패:", e);
            }
          }
          showToast(`[${uid}] 차단 및 기존 제보(${sameUidReports.length}건)가 휴지통으로 이동되었습니다.`);
          return;
        }
      }

      showToast(`제보자 [${uid}] 가 차단되었습니다.`);
    }

    // UID 차단 해제 핸들러
    async function handleUnblockUid(uid) {
      if (!uid) return;
      if (!confirm(`[${uid}] 의 차단을 해제하시겠습니까?`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      currentBlockedUidsCache = currentBlockedUidsCache.filter(u => u !== uid);
      renderBlockedUidsUI();
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (await postAdminToGas(gasUrl, { action: "unblock_uid", uid: uid })) {
            showToast(`[${uid}] 차단이 해제되었습니다.`);
          }
        } catch (e) {
          console.error("UID 차단 해제 요청 실패:", e);
        }
      }
    }

    // 제보 목록 UI 렌더링 함수 (활성 제보 & 휴지통 통합 지원)
    function renderReportsListUI() {
      const listEl = document.getElementById("review-reports-list");
      const countEl = document.getElementById("review-reports-count");
      const badgeEl = document.getElementById("report-badge-count");
      const activeCountBadge = document.getElementById("tab-active-count-badge");
      const trashCountBadge = document.getElementById("tab-trash-count-badge");

      if (!listEl) return;

      const activeTotal = currentReportsCache.length;
      const trashTotal = currentTrashCache.length;
      const isTrash = (currentReportsTab === "trash");
      const currentList = isTrash ? currentTrashCache : currentReportsCache;

      // 상단 탭 뱃지 갱신
      if (activeCountBadge) activeCountBadge.textContent = activeTotal;
      if (trashCountBadge) trashCountBadge.textContent = trashTotal;

      // 에디터 상단 헤더 알림 뱃지 (활성 제보 기준)
      if (badgeEl) {
        if (activeTotal > 0) {
          badgeEl.textContent = activeTotal;
          badgeEl.style.display = "inline-block";
        } else {
          badgeEl.style.display = "none";
        }
      }

      // 하단 카운트 텍스트
      if (countEl) {
        countEl.textContent = isTrash ? `총 ${trashTotal}건의 삭제된 제보 (휴지통)` : `총 ${activeTotal}건의 접수된 제보`;
      }

      // 비어있을 때 메시지
      if (currentList.length === 0) {
        if (isTrash) {
          listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-sub); font-size:0.85rem;">
              🗑️ 휴지통이 비어 있습니다.<br>
              삭제한 제보는 이곳에 모아두며, 언제든 복구하거나 트리에 즉시 적용할 수 있습니다.
            </div>
          `;
        } else {
          listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-sub); font-size:0.85rem;">
              📬 접수된 유저 제보가 없습니다.<br>
              유저들이 뷰어에서 제보를 전송하면 이곳에 실시간으로 표시됩니다.
            </div>
          `;
        }
        return;
      }

      // 최신 제보가 위로 오도록 역순 정렬
      const sortedItems = [...currentList].reverse();

      listEl.innerHTML = sortedItems.map((rep) => {
        const isBlocked = rep.uid && currentBlockedUidsCache.includes(rep.uid);
        const cardBorder = isTrash ? 'rgba(248,113,113,0.35)' : (isBlocked ? 'rgba(220,38,38,0.4)' : 'var(--border-color)');
        const cardBg = isTrash ? '#201E22' : '#23272A';

        return `
          <div class="report-item-card" data-row-id="${rep.id}" style="background:${cardBg}; border:1px solid ${cardBorder}; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:6px;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="background:rgba(88,101,242,0.25); border:1px solid #5865F2; color:#C4B5FD; font-size:0.72rem; padding:2px 7px; border-radius:10px; font-weight:700;">${escapeHtml(rep.dim || '미지정')}</span>
                ${isTrash && rep.deletedAt ? `
                  <span style="background:rgba(239,68,68,0.18); border:1px solid rgba(239,68,68,0.45); color:#FCA5A5; font-size:0.72rem; padding:2px 7px; border-radius:4px; font-weight:700;">
                    🗑️ 삭제: ${escapeHtml(rep.deletedAt)}
                  </span>
                ` : ''}
                <span style="font-size:0.75rem; color:var(--text-sub);">접수: ${escapeHtml(rep.timestamp || '')}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${rep.uid ? `
                  <span style="font-size:0.75rem; font-weight:700; color:${isBlocked ? '#FCA5A5' : '#38BDF8'}; background:${isBlocked ? 'rgba(220,38,38,0.25)' : 'rgba(56,189,248,0.15)'}; border:1px solid ${isBlocked ? 'rgba(220,38,38,0.5)' : 'rgba(56,189,248,0.4)'}; padding:2px 8px; border-radius:4px; font-family:monospace;" title="제보자 식별 ID (UID)">
                    👤 UID: ${escapeHtml(rep.uid)}
                  </span>
                  ${isBlocked ? `<span style="font-size:0.68rem; background:#DC2626; color:#FFF; padding:2px 6px; border-radius:3px; font-weight:700;">차단됨</span>` : ''}
                ` : `
                  <span style="font-size:0.72rem; color:#94A3B8; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.2); padding:2px 7px; border-radius:4px; font-family:monospace;" title="UID 도입 이전에 접수되었거나 구글 앱 스크립트 최신 버전 배포 전에 작성된 제보입니다.">
                    👤 UID 없음 (구버전 제보)
                  </span>
                `}
                <span style="font-size:0.75rem; color:${isTrash ? '#F87171' : '#A78BFA'}; font-weight:600;">
                  ${isTrash ? '휴지통 #' : '시트 #'}${rep.id || ''}
                </span>
              </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <strong style="color:#FFF; font-size:0.95rem;">${escapeHtml(rep.fromName || '-')}</strong>
                <span style="color:#5865F2; font-weight:800;">➔</span>
                <strong style="color:#57F287; font-size:0.95rem;">${escapeHtml(rep.toName || '-')}</strong>
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn-apply-report-to-tree btn-success" data-id="${rep.id}" data-is-trash="${isTrash ? '1' : '0'}" style="padding:5px 12px; font-size:0.8rem; font-weight:700; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:5px;" title="휴지통에 있는 제보도 트리에 즉시 적용할 수 있습니다.">
                  <span>⚡ 트리에 즉시 적용</span>
                </button>
                ${rep.uid ? (isBlocked ? `
                  <button type="button" class="btn-unblock-report-uid" data-uid="${escapeHtml(rep.uid)}" style="padding:5px 9px; font-size:0.78rem; font-weight:600; background:#065F46; border:1px solid #059669; color:#A7F3D0; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:4px;" title="이 UID 차단 해제">
                    <span>🔓 차단 해제</span>
                  </button>
                ` : `
                  <button type="button" class="btn-block-report-uid" data-uid="${escapeHtml(rep.uid)}" style="padding:5px 9px; font-size:0.78rem; font-weight:600; background:rgba(220,38,38,0.2); border:1px solid rgba(220,38,38,0.5); color:#FCA5A5; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:4px;" title="이 제보자 UID 차단">
                    <span>🚫 UID 차단</span>
                  </button>
                `) : `
                  <span style="font-size:0.72rem; color:#6B7280; padding:4px 6px;" title="이 제보는 UID가 기록되어 있지 않아 특정 사용자 차단이 불가합니다.">(UID 미기록)</span>
                `}

                ${isTrash ? `
                  <button type="button" class="btn-restore-trash-item" data-id="${rep.id}" style="padding:5px 10px; font-size:0.8rem; font-weight:600; background:#1E293B; border:1px solid #38BDF8; color:#38BDF8; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:4px;" title="활성 제보함으로 복구">
                    <span>↩️ 복구</span>
                  </button>
                  <button type="button" class="btn-perm-delete-trash-item" data-id="${rep.id}" style="padding:5px 10px; font-size:0.8rem; font-weight:600; background:#374151; border:1px solid #EF4444; color:#F87171; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:4px;" title="휴지통에서 영구 삭제">
                    <span>🔥 영구 삭제</span>
                  </button>
                ` : `
                  <button type="button" class="btn-delete-report-item" data-id="${rep.id}" style="padding:5px 10px; font-size:0.8rem; font-weight:600; background:#374151; border:1px solid #4B5563; color:#F87171; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:4px;" title="이 제보를 휴지통으로 이동">
                    <span>🗑️ 삭제</span>
                  </button>
                `}
              </div>
            </div>

            <!-- 제보 조건 상세 표시 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:6px; background:#18191C; padding:8px 10px; border-radius:6px; font-size:0.78rem;">
              <div><span style="color:var(--text-sub);">시간:</span> <strong style="color:#FFF;">${escapeHtml(rep.time || '-')}</strong></div>
              <div><span style="color:var(--text-sub);">바이탈:</span> <strong style="color:#57F287;">${rep.vital !== "" && rep.vital !== undefined ? rep.vital : '-'}</strong></div>
              <div><span style="color:var(--text-sub);">PP:</span> <strong style="color:#FEE75C;">${rep.pp !== "" && rep.pp !== undefined ? rep.pp : '-'}</strong></div>
              <div><span style="color:var(--text-sub);">배틀:</span> <strong style="color:#FFF;">${escapeHtml(rep.battle || '-')}</strong></div>
              <div><span style="color:var(--text-sub);">승률:</span> <strong style="color:#FFF;">${escapeHtml(rep.winRate ? (String(rep.winRate).includes('%') ? rep.winRate : rep.winRate + '%') : '-')}</strong></div>
              ${(rep.baseHp || rep.baseAp || rep.baseSpd) ? `
                <div style="grid-column: 1 / -1; display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.06);">
                  <span style="color:#A5B4FC; font-weight:700; font-size:0.75rem;">기본스탯:</span>
                  <span style="color:#34D399; font-weight:700;">HP ${escapeHtml(String(rep.baseHp || '-'))}</span>
                  <span style="color:#F87171; font-weight:700;">AP ${escapeHtml(String(rep.baseAp || '-'))}</span>
                  <span style="color:#38BDF8; font-weight:700;">SPD ${escapeHtml(String(rep.baseSpd || '-'))}</span>
                </div>
              ` : ''}
              ${rep.jogress ? `<div style="grid-column:span 2;"><span style="color:var(--text-sub);">조그레스:</span> <strong style="color:#C4B5FD;">${escapeHtml(rep.jogress)}</strong></div>` : ''}
              ${rep.item ? `<div style="grid-column:span 2;"><span style="color:var(--text-sub);">아이템:</span> <strong style="color:#FFF;">${escapeHtml(rep.item)}</strong></div>` : ''}
              ${rep.note ? `<div style="grid-column:span 2;"><span style="color:var(--text-sub);">비고:</span> <span style="color:#CBD5E1;">${escapeHtml(rep.note)}</span></div>` : ''}
            </div>
          </div>
        `;
      }).join("");

      // 1클릭 적용 이벤트 바인딩 (활성 제보 & 휴지통 모두 지원)
      listEl.querySelectorAll(".btn-apply-report-to-tree").forEach(btn => {
        btn.addEventListener("click", () => {
          const repId = parseInt(btn.dataset.id, 10);
          const sourceList = (btn.dataset.isTrash === "1") ? currentTrashCache : currentReportsCache;
          const report = sourceList.find(r => r.id === repId);
          if (report) {
            applyReportToTree(report, btn);
          }
        });
      });

      // UID 차단 버튼 바인딩
      listEl.querySelectorAll(".btn-block-report-uid").forEach(btn => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.uid;
          if (uid) handleBlockUid(uid);
        });
      });

      // UID 차단 해제 버튼 바인딩
      listEl.querySelectorAll(".btn-unblock-report-uid").forEach(btn => {
        btn.addEventListener("click", () => {
          const uid = btn.dataset.uid;
          if (uid) handleUnblockUid(uid);
        });
      });

      // 개별 삭제 이벤트 바인딩 (휴지통으로 이동)
      listEl.querySelectorAll(".btn-delete-report-item").forEach(btn => {
        btn.addEventListener("click", () => {
          const repId = parseInt(btn.dataset.id, 10);
          deleteSingleReport(repId, btn);
        });
      });

      // 휴지통 복구 버튼 바인딩
      listEl.querySelectorAll(".btn-restore-trash-item").forEach(btn => {
        btn.addEventListener("click", () => {
          const repId = parseInt(btn.dataset.id, 10);
          restoreTrashReport(repId, btn);
        });
      });

      // 휴지통 개별 영구 삭제 버튼 바인딩
      listEl.querySelectorAll(".btn-perm-delete-trash-item").forEach(btn => {
        btn.addEventListener("click", () => {
          const repId = parseInt(btn.dataset.id, 10);
          deleteTrashPermanent(repId, btn);
        });
      });
    }

    // 개별 제보 삭제 (휴지통으로 이동)
    async function deleteSingleReport(repId, btnEl) {
      if (!confirm(`시트 #${repId} 제보 항목을 삭제하시겠습니까?\n\n※ 삭제된 제보는 상단 [🗑️ 휴지통] 탭에 안전하게 보관되며 필요 시 언제든 복구할 수 있습니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      
      // 로컬 캐시에서 휴지통으로 이동 및 UI 즉시 갱신
      const repItem = currentReportsCache.find(r => r.id === repId);
      if (repItem) {
        const nowStr = new Date().toLocaleString();
        currentTrashCache.push({ ...repItem, deletedAt: nowStr });
      }
      currentReportsCache = currentReportsCache.filter(r => r.id !== repId);
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (await postAdminToGas(gasUrl, { action: "delete", row: repId })) {
            showToast(`시트 #${repId} 제보가 휴지통으로 이동되었습니다.`);
          }
        } catch (e) {
          console.error("제보 삭제 요청 실패:", e);
        }
      }
    }

    // 전체 제보 비우기 (모두 휴지통으로 이동)
    async function clearAllReports() {
      if (!currentReportsCache || currentReportsCache.length === 0) {
        alert("삭제할 제보가 없습니다.");
        return;
      }
      if (!confirm(`현재 접수된 총 ${currentReportsCache.length}건의 제보를 모두 삭제(휴지통 이동)하시겠습니까?\n\n삭제된 제보들은 [🗑️ 휴지통] 탭에 보관됩니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      
      const nowStr = new Date().toLocaleString();
      currentReportsCache.forEach(r => {
        currentTrashCache.push({ ...r, deletedAt: nowStr });
      });
      currentReportsCache = [];
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (await postAdminToGas(gasUrl, { action: "clear_all" })) {
            showToast("모든 제보가 휴지통으로 이동되었습니다.");
          }
        } catch (e) {
          console.error("전체 제보 삭제 요청 실패:", e);
        }
      }
    }

    // 휴지통에서 제보 복구
    async function restoreTrashReport(trashId, btnEl) {
      if (!confirm(`휴지통 #${trashId} 제보를 다시 [📥 접수된 제보] 목록으로 복구하시겠습니까?`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;

      const item = currentTrashCache.find(r => r.id === trashId);
      if (item) {
        currentTrashCache = currentTrashCache.filter(r => r.id !== trashId);
        currentReportsCache.push(item);
      }
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (await postAdminToGas(gasUrl, { action: "restore_trash", row: trashId })) {
            showToast(`휴지통 #${trashId} 제보가 성공적으로 복구되었습니다.`);
          }
        } catch (e) {
          console.error("휴지통 복구 요청 실패:", e);
        }
      }
    }

    // 휴지통에서 개별 영구 삭제
    async function deleteTrashPermanent(trashId, btnEl) {
      if (!confirm(`휴지통 #${trashId} 제보를 영구 삭제하시겠습니까?\n\n⚠️ 이 작업은 구글 시트에서도 완전히 삭제되며 되돌릴 수 없습니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;

      currentTrashCache = currentTrashCache.filter(r => r.id !== trashId);
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (await postAdminToGas(gasUrl, { action: "delete_trash_permanent", row: trashId })) {
            showToast(`휴지통 #${trashId} 제보가 영구 삭제되었습니다.`);
          }
        } catch (e) {
          console.error("휴지통 영구 삭제 요청 실패:", e);
        }
      }
    }

    // 휴지통 전체 영구 비우기
    async function emptyTrashAll() {
      if (!currentTrashCache || currentTrashCache.length === 0) {
        alert("휴지통이 이미 비어 있습니다.");
        return;
      }
      if (!confirm(`휴지통의 모든 제보(총 ${currentTrashCache.length}건)를 완전히 비우시겠습니까?\n\n⚠️ 이 작업은 구글 시트의 [제보_휴지통]에서도 완전히 영구 삭제되며 되돌릴 수 없습니다.`)) return;

      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;

      currentTrashCache = [];
      renderReportsListUI();

      if (gasUrl) {
        try {
          if (await postAdminToGas(gasUrl, { action: "empty_trash" })) {
            showToast("휴지통의 모든 제보가 영구 삭제되었습니다.");
          }
        } catch (e) {
          console.error("휴지통 비우기 요청 실패:", e);
        }
      }
    }

    // 제보 조건을 트리에 즉시 적용
    function applyReportToTree(report, btnEl) {
      if (!report) return;

      // DiM 문자열 정규화 (공백, 대소문자, 상태 이모지 🚧, ❌ 등 제거하여 비교)
      const cleanDim = (s) => (s || "").replace(/[🚧❌⚠️\s]/g, "").toLowerCase();
      const repDimClean = cleanDim(report.dim);
      const toNameClean = (report.toName || "").trim().toLowerCase();
      const fromNameClean = (report.fromName || "").trim().toLowerCase();

      // 1. 진화 대상 디지몬(toDigi) 및 출발 디지몬(fromDigi) 정밀 매칭
      let toDigi = null;
      let fromDigi = null;

      // 1순위: report.dim이 일치하는 디지몬 우선 탐색
      if (repDimClean) {
        toDigi = Object.values(project.digimons).find(d => {
          if (!d.name || d.name.trim().toLowerCase() !== toNameClean) return false;
          return cleanDim(d.dim) === repDimClean;
        });
        if (fromNameClean) {
          fromDigi = Object.values(project.digimons).find(d => {
            if (!d.name || d.name.trim().toLowerCase() !== fromNameClean) return false;
            return cleanDim(d.dim) === repDimClean;
          });
        }
      }

      // 2순위: 현재 에디터 화면에 열려있는 filterDim 안에서 탐색
      if (!toDigi && filterDim) {
        const curDimClean = cleanDim(filterDim);
        toDigi = Object.values(project.digimons).find(d => {
          if (!d.name || d.name.trim().toLowerCase() !== toNameClean) return false;
          return cleanDim(d.dim) === curDimClean;
        });
        if (!fromDigi && fromNameClean) {
          fromDigi = Object.values(project.digimons).find(d => {
            if (!d.name || d.name.trim().toLowerCase() !== fromNameClean) return false;
            return cleanDim(d.dim) === curDimClean;
          });
        }
      }

      // 3순위: 전체 디지몬 목록에서 매칭 (동일 DiM을 가진 쌍 우선)
      if (!toDigi) {
        const toCandidates = Object.values(project.digimons).filter(d => d.name && d.name.trim().toLowerCase() === toNameClean);
        if (toCandidates.length === 1) {
          toDigi = toCandidates[0];
        } else if (toCandidates.length > 1) {
          toDigi = toCandidates.find(d => cleanDim(d.dim).includes(repDimClean) || repDimClean.includes(cleanDim(d.dim))) || toCandidates[0];
        }
      }

      if (!fromDigi && fromNameClean) {
        const targetDimClean = toDigi ? cleanDim(toDigi.dim) : repDimClean;
        const fromCandidates = Object.values(project.digimons).filter(d => d.name && d.name.trim().toLowerCase() === fromNameClean);
        fromDigi = fromCandidates.find(d => cleanDim(d.dim) === targetDimClean) || fromCandidates[0];
      }

      if (!toDigi) {
        alert(`트리에서 진화 대상 디지몬 [${report.toName}]을 찾을 수 없습니다.\n(DiM: ${report.dim || '미지정'})`);
        return;
      }

      // 2. 진화선(evo) 매칭 및 부재 시 자동 연결
      let targetEvo = null;
      if (fromDigi) {
        targetEvo = project.evolutions.find(ev => ev.from === fromDigi.id && ev.to === toDigi.id);
        if (!targetEvo) {
          // 둘 사이에 진화선이 아직 없다면 신규 진화선 생성
          const stageDefault = getDefaultReqForStage(toDigi.stage);
          targetEvo = {
            from: fromDigi.id,
            to: toDigi.id,
            lineColor: fromDigi.lineColor || undefined,
            ...stageDefault
          };
          project.evolutions.push(targetEvo);
        }
      }

      if (!targetEvo) {
        const incoming = project.evolutions.filter(ev => ev.to === toDigi.id);
        if (incoming.length > 0) targetEvo = incoming[0];
      }

      if (!toDigi.req) {
        toDigi.req = getDefaultReqForStage(toDigi.stage);
      }

      const parseNumOrStr = (val) => {
        if (val === "" || val === undefined || val === null || val === "-") return "";
        const n = Number(val);
        return isNaN(n) ? val : n;
      };

      // 3. 조건 값 갱신 (진화선 및 디지몬 기본 조건 동시 반영)
      if (report.time && report.time !== "-") {
        if (targetEvo) targetEvo.time = report.time;
        toDigi.req.time = report.time;
      }
      if (report.vital !== "" && report.vital !== undefined && report.vital !== "-") {
        const v = parseNumOrStr(report.vital);
        if (targetEvo) targetEvo.vital = v;
        toDigi.req.vital = v;
      }
      if (report.pp !== "" && report.pp !== undefined && report.pp !== "-") {
        const p = parseNumOrStr(report.pp);
        if (targetEvo) targetEvo.pp = p;
        toDigi.req.pp = p;
      }
      if (report.battle !== "" && report.battle !== undefined && report.battle !== "-") {
        if (targetEvo) targetEvo.battle = report.battle;
        toDigi.req.battle = report.battle;
      }
      if (report.winRate !== "" && report.winRate !== undefined && report.winRate !== "-") {
        const wr = String(report.winRate).replace('%', '');
        if (targetEvo) targetEvo.winRate = wr;
        toDigi.req.winRate = wr;
      }
      if (report.jogress && report.jogress !== "-") {
        if (targetEvo) targetEvo.jogress = report.jogress;
        toDigi.req.jogress = report.jogress;
      }
      if (report.item && report.item !== "-") {
        if (targetEvo) targetEvo.item = report.item;
        toDigi.req.item = report.item;
      }
      if (report.note) {
        if (targetEvo) targetEvo.note = report.note;
        toDigi.req.note = report.note;
      }

      // 기본 스탯 갱신 (체력 HP, 전투력 AP, 속도 SPD)
      if (report.baseHp !== undefined && report.baseHp !== "" && report.baseHp !== null && report.baseHp !== "-") {
        const hpNum = Number(report.baseHp);
        if (!isNaN(hpNum)) toDigi.baseHp = hpNum;
      }
      if (report.baseAp !== undefined && report.baseAp !== "" && report.baseAp !== null && report.baseAp !== "-") {
        const apNum = Number(report.baseAp);
        if (!isNaN(apNum)) toDigi.baseAp = apNum;
      }
      if (report.baseSpd !== undefined && report.baseSpd !== "" && report.baseSpd !== null && report.baseSpd !== "-") {
        const spdNum = Number(report.baseSpd);
        if (!isNaN(spdNum)) toDigi.baseSpd = spdNum;
      }

      // 다중 루트 상태 종합 판정 (A>D, B>D, C>D 등 모든 루트가 밝혀져야 전체 공개, 하나라도 비어있으면 일부 불명)
      updateDigimonConditionStatus(toDigi);
      syncSameNameDigimons(toDigi);

      // 4. 화면 전환 & 포커스 (해당 디지몬이 속한 DiM으로 즉시 이동)
      if (toDigi.dim && filterDim !== toDigi.dim) {
        filterDim = toDigi.dim;
        const filterSelect = document.getElementById("filter-dim");
        if (filterSelect) filterSelect.value = filterDim;
      }

      selectedDigiId = toDigi.id;
      if (fromDigi) {
        activeIncomingFromId = fromDigi.id;
      }

      saveState();
      renderTree();
      drawConnections();
      updateSidebar();

      setTimeout(() => {
        const nodeEl = document.getElementById(`node-${toDigi.id}`);
        if (nodeEl) {
          nodeEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          nodeEl.classList.add("highlight-flash");
          setTimeout(() => nodeEl.classList.remove("highlight-flash"), 1500);
        }
      }, 100);

      if (btnEl) {
        btnEl.innerHTML = "✅ 적용 완료";
        btnEl.style.background = "#10B981";
        btnEl.style.cursor = "default";
        btnEl.disabled = true;
      }

      const statusSuffix = toDigi.partialUnknown ? " (다른 미확인 루트가 있어 '일부 불명 🌓' 상태 유지)" : (toDigi.unknownTime ? " (조건 불명 상태)" : " (모든 루트 확인 완료 🟢)");
      showToast(`[${fromDigi ? fromDigi.name : (report.fromName || '-')} ➔ ${toDigi.name}] 진화 조건이 [${toDigi.dim || filterDim}] 트리에 즉시 반영되었습니다!${statusSuffix}`);
    }

    // 에디터: 현재 모든 진화 조건을 구글 시트에 실시간 배포 (깃허브 배포 불필요)
    async function syncLiveConditionsToGas() {
      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      if (!gasUrl) {
        alert("구글 스프레드시트 연동 URL이 등록되지 않았습니다.");
        return;
      }

      const syncBtn = document.getElementById("btn-sync-live-conditions");
      const origHtml = syncBtn ? syncBtn.innerHTML : "";

      if (!confirm("현재 에디터의 모든 진화 조건을 구글 시트에 실시간으로 배포하시겠습니까?\n뷰어 유저들은 깃 배포를 기다릴 필요 없이 즉시 업데이트된 조건을 확인하게 됩니다.")) {
        return;
      }

      if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = "<span>🔄 최신 유저 제보 병합 중... ⏳</span>";
      }

      try {
        // [안전장치] 배포 전 서버의 최신 유저 제보/수정 내역을 먼저 가져와 로컬 데이터에 안전하게 병합
        await fetchAndApplyLiveConditions();
        recalculateAllDigimonConditionStatuses();

        if (syncBtn) {
          syncBtn.innerHTML = "<span>📡 구글 시트 배포 중... ⏳</span>";
        }

        const conditions = [];

        // 1. 모든 진화선 수집
        (project.evolutions || []).forEach(ev => {
          const fromD = project.digimons[ev.from];
          const toD = project.digimons[ev.to];
          if (!toD) return;
          const req = getEvoRequirements(ev, toD);
          const dimVal = (toD.dim || (fromD ? fromD.dim : "") || "").split(",")[0].trim();
          const condStatus = toD.partialUnknown ? "일부 불명" : (toD.unknownTime ? "조건 불명" : "공개");
          conditions.push({
            dim: dimVal,
            from: fromD ? fromD.name : "",
            to: toD.name,
            attr: toD.attr || "",
            status: condStatus,
            time: req.time || "",
            vital: req.vital !== undefined && req.vital !== null ? req.vital : "",
            pp: req.pp !== undefined && req.pp !== null ? req.pp : "",
            battle: req.battle !== undefined && req.battle !== null ? req.battle : "",
            winRate: req.winRate !== undefined && req.winRate !== null ? req.winRate : "",
            baseHp: toD.baseHp !== undefined && toD.baseHp !== null ? toD.baseHp : "",
            baseAp: toD.baseAp !== undefined && toD.baseAp !== null ? toD.baseAp : "",
            baseSpd: toD.baseSpd !== undefined && toD.baseSpd !== null ? toD.baseSpd : "",
            jogress: req.jogress || "",
            item: req.item || "",
            note: req.note || "",
            dungeon: dungeonDisplayValue(req.dungeon)
          });
        });

        // 2. 디지타마(알) 및 진화 도착점으로 등록되지 않은 최초 세대 디지몬들의 속성 및 공개상태 수집 (진화선 대상 외 디지몬)
        const evolvedToIds = new Set((project.evolutions || []).map(ev => ev.to));
        Object.values(project.digimons || {}).forEach(d => {
          if (!d || !d.name) return;
          if (d.stage === "디지타마" || !evolvedToIds.has(d.id)) {
            const dimVal = (d.dim || "").split(",")[0].trim();
            const condStatus = d.partialUnknown ? "일부 불명" : (d.unknownTime ? "조건 불명" : "공개");
            conditions.push({
              dim: dimVal,
              from: "(시작/알)",
              to: d.name,
              attr: d.attr || "",
              status: condStatus,
              time: (d.req && d.req.time) ? d.req.time : "-",
              vital: "",
              pp: "",
              battle: "",
              winRate: "",
              baseHp: d.baseHp !== undefined && d.baseHp !== null ? d.baseHp : "",
              baseAp: d.baseAp !== undefined && d.baseAp !== null ? d.baseAp : "",
              baseSpd: d.baseSpd !== undefined && d.baseSpd !== null ? d.baseSpd : "",
              jogress: "",
              item: "",
              note: ""
            });
          }
        });

        if (!(await postAdminToGas(gasUrl, { action: "sync_live_conditions", conditions: conditions }))) return;
        resetLiveBaselineToLocal();

        showToast(`🎉 최신 유저 제보를 안전하게 병합한 후, 총 <strong>${conditions.length}개</strong>의 진화 조건이 구글 시트에 실시간 배포되었습니다!<br>이제 뷰어에서 깃 배포 없이 즉시 최신 조건이 표시됩니다.`);
      } catch (err) {
        console.error("실시간 조건 배포 실패:", err);
        alert("실시간 조건 배포 중 오류가 발생했습니다: " + err.message);
      } finally {
        if (syncBtn) {
          syncBtn.disabled = false;
          syncBtn.innerHTML = origHtml;
        }
      }
    }

    // 뷰어 및 에디터: 구글 시트에서 최신 진화 조건 실시간 로드 및 트리 덮어쓰기
    // -------------------------------------------------------------
    // 에디터 수동 수정 보호 (시트 병합이 에디터에서 고친 값을 덮어쓰지 않도록)
    // 마지막으로 시트에서 받아 적용한 값(기준값)을 기억해 두고, 지금 값이 기준값과 다르면
    // 에디터에서 고친 것으로 보고 시트 값을 적용하지 않는다. [실시간 배포]에 성공하면 기준값을 현재 값으로 맞춘다.
    // -------------------------------------------------------------
    // v2: 성장기 조건 강제 삭제 버그 수정 때 키를 바꿔, 그 버그로 지워진 값이 "에디터 수정"으로 보호되지 않게 초기화
    // v3: 던전 필드 추가로 서명 형식이 바뀌어 초기화
    const LIVE_BASELINE_STORAGE_KEY = "digipet_live_baseline_v3";
    const LIVE_CONDITION_FIELDS = ["time", "vital", "pp", "battle", "winRate", "jogress", "item", "note", "dungeon"];

    function conditionSignature(obj) {
      return LIVE_CONDITION_FIELDS.map(f => {
        const v = obj ? obj[f] : "";
        const str = (v === undefined || v === null) ? "" : String(v).trim();
        return str === "-" ? "" : str;
      }).join("␟");
    }

    function loadLiveBaseline() {
      try {
        return JSON.parse(localStorage.getItem(LIVE_BASELINE_STORAGE_KEY) || "{}") || {};
      } catch (e) {
        return {};
      }
    }

    function saveLiveBaseline(baseline) {
      try {
        localStorage.setItem(LIVE_BASELINE_STORAGE_KEY, JSON.stringify(baseline));
      } catch (e) {}
    }

    // 키별 현재 값의 서명: 진화선/req 는 조건 필드들, attr|<id> 는 속성 값
    function liveTargetSignature(key, obj) {
      return key.startsWith("attr|") ? String((obj && obj.attr) || "") : conditionSignature(obj);
    }

    function forEachLiveConditionTarget(fn) {
      (project.evolutions || []).forEach(ev => fn(`${ev.from}|${ev.to}`, ev));
      Object.values(project.digimons || {}).forEach(d => {
        fn(`req|${d.id}`, d.req);
        fn(`attr|${d.id}`, d);
      });
    }

    // 실시간 배포 성공 후: 지금 값이 곧 시트 값이므로 기준값으로 저장
    function resetLiveBaselineToLocal() {
      const baseline = {};
      forEachLiveConditionTarget((key, obj) => { baseline[key] = liveTargetSignature(key, obj); });
      saveLiveBaseline(baseline);
    }

    // -------------------------------------------------------------
    // 최신 조건 자동 갱신: 다른 유저의 위키 편집이 새로고침 없이 보이도록
    //  - 탭으로 돌아왔을 때 마지막 갱신 후 1분 이상 지났으면
    //  - 탭을 보고 있는 동안 5분마다
    //  입력 중이거나 창(모달)이 열려 있으면 화면이 바뀌지 않도록 건너뛴다.
    // -------------------------------------------------------------
    let lastLiveFetchAt = 0;
    let liveFetchInFlight = false;
    const LIVE_REFRESH_ON_RETURN_MS = 60 * 1000;
    const LIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

    function isUserBusyForLiveRefresh() {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
      return Array.from(document.querySelectorAll(".modal-overlay")).some(m => m.style.display === "flex");
    }

    function refreshLiveConditionsIfStale(maxAgeMs) {
      if (document.hidden || liveFetchInFlight) return;
      if (Date.now() - lastLiveFetchAt < maxAgeMs) return;
      if (isUserBusyForLiveRefresh()) return;
      fetchAndApplyLiveConditions();
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshLiveConditionsIfStale(LIVE_REFRESH_ON_RETURN_MS);
    });
    setInterval(() => refreshLiveConditionsIfStale(LIVE_REFRESH_INTERVAL_MS), 30 * 1000);

    async function fetchAndApplyLiveConditions() {
      const gasUrl = project.gasWebhookUrl || localStorage.getItem("digipet_gas_webhook_url") || DEFAULT_GAS_WEBHOOK_URL;
      if (!gasUrl) return;
      lastLiveFetchAt = Date.now();
      liveFetchInFlight = true;

      try {
        const fetchUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=get_live_conditions&t=${Date.now()}`;
        const res = await fetch(fetchUrl);
        const data = await res.json();

        if (data.status === "success" && Array.isArray(data.conditions) && data.conditions.length > 0) {
          let updatedCount = 0;

          // 에디터에서 고친(기준값과 달라진) 진화선/조건 키. 뷰어는 보호하지 않고 항상 시트 값을 따른다.
          const protectEdits = !isViewerMode;
          const baseline = protectEdits ? loadLiveBaseline() : {};
          const locallyEdited = new Set();
          if (protectEdits) {
            forEachLiveConditionTarget((key, obj) => {
              if (baseline[key] !== undefined && baseline[key] !== liveTargetSignature(key, obj)) locallyEdited.add(key);
            });
          }

          data.conditions.forEach(c => {
            if (!c.to) return;
            const toNameLower = c.to.trim().toLowerCase();
            const fromNameLower = (c.from || "").trim().toLowerCase();
            const cDim = (c.dim || "").trim();

            // 1. 진화선(evo) 매칭 및 오버라이드
            // DiM이 지정된 경우 해당 DiM에 속한 디지몬 쌍의 진화선만 매칭하여 타 DiM 덮어쓰기 방지
            if (fromNameLower !== "(시작/알)" && fromNameLower !== "(디지타마)") {
              let matchedEvos = (project.evolutions || []).filter(ev => {
                const tD = project.digimons[ev.to];
                const fD = project.digimons[ev.from];
                if (!tD || tD.name.trim().toLowerCase() !== toNameLower) return false;
                if (fromNameLower && fD && fD.name.trim().toLowerCase() !== fromNameLower) return false;
                if (cDim) {
                  const dimMatch = isDigimonVisibleInDim(tD, cDim) || (fD && isDigimonVisibleInDim(fD, cDim));
                  if (!dimMatch) return false;
                }
                return true;
              });

              matchedEvos.forEach(ev => {
                if (locallyEdited.has(`${ev.from}|${ev.to}`)) return;
                if (c.time !== undefined && c.time !== "") ev.time = c.time;
                if (c.vital !== undefined) ev.vital = (c.vital === "" || c.vital === "-") ? "" : Number(c.vital);
                if (c.pp !== undefined) ev.pp = (c.pp === "" || c.pp === "-") ? "" : Number(c.pp);
                if (c.battle !== undefined) ev.battle = c.battle === "-" ? "" : c.battle;
                if (c.winRate !== undefined) ev.winRate = c.winRate === "-" ? "" : c.winRate;
                if (c.jogress !== undefined) ev.jogress = c.jogress === "-" ? "" : c.jogress;
                if (c.item !== undefined) ev.item = c.item === "-" ? "" : c.item;
                if (c.dungeon !== undefined) ev.dungeon = dungeonDisplayValue(c.dungeon);
                if (c.note !== undefined) ev.note = c.note;
                updatedCount++;
              });
            }

            // 2. 디지몬 기본 조건(req), 속성(attr), 조건공개상태(status) 매칭 및 오버라이드
            Object.values(project.digimons || {}).forEach(d => {
              if (d.name.trim().toLowerCase() === toNameLower) {
                if (cDim && !isDigimonVisibleInDim(d, cDim)) return;

                // 속성(attr) 갱신 (에디터에서 바꾼 속성은 유지)
                if (c.attr && c.attr.trim() && !locallyEdited.has(`attr|${d.id}`)) {
                  const cleanAttr = c.attr.trim().toLowerCase();
                  if (d.attr !== cleanAttr) {
                    d.attr = cleanAttr;
                    updatedCount++;
                  }
                }

                // 조건공개상태 (status: 공개, 조건 불명, 일부 불명) 갱신
                if (c.status && String(c.status).trim()) {
                  const rawStatus = String(c.status).trim().toLowerCase();
                  let newUnknown = false;
                  let newPartial = false;
                  if (rawStatus === "조건 불명" || rawStatus === "unknown" || rawStatus === "불명") {
                    newUnknown = true;
                  } else if (rawStatus === "일부 불명" || rawStatus === "partial") {
                    newPartial = true;
                  } else if (rawStatus === "공개" || rawStatus === "known" || rawStatus === "정상") {
                    newUnknown = false;
                    newPartial = false;
                  }

                  if (Boolean(d.unknownTime) !== newUnknown || Boolean(d.partialUnknown) !== newPartial) {
                    d.unknownTime = newUnknown;
                    d.partialUnknown = newPartial;
                    updatedCount++;
                  }
                }

                // 기본 요구조건(req) 갱신 (에디터에서 고친 조건은 유지)
                if (!d.req) d.req = getDefaultReqForStage(d.stage);
                if (!locallyEdited.has(`req|${d.id}`)) {
                  if (c.time !== undefined && c.time !== "" && c.time !== "-") d.req.time = c.time;
                  if (c.vital !== undefined) d.req.vital = (c.vital === "" || c.vital === "-") ? "" : Number(c.vital);
                  if (c.pp !== undefined) d.req.pp = (c.pp === "" || c.pp === "-") ? "" : Number(c.pp);
                  if (c.battle !== undefined) d.req.battle = c.battle === "-" ? "" : c.battle;
                  if (c.winRate !== undefined) d.req.winRate = c.winRate === "-" ? "" : c.winRate;
                  if (c.jogress !== undefined) d.req.jogress = c.jogress === "-" ? "" : c.jogress;
                  if (c.item !== undefined) d.req.item = c.item === "-" ? "" : c.item;
                  if (c.dungeon !== undefined) d.req.dungeon = dungeonDisplayValue(c.dungeon);
                  if (c.note !== undefined) d.req.note = c.note;
                }

                // 기본 스탯(baseHp, baseAp, baseSpd) 갱신
                if (c.baseHp !== undefined && c.baseHp !== "") {
                  const hpNum = parseInt(c.baseHp, 10);
                  if (!isNaN(hpNum) && d.baseHp !== hpNum) {
                    d.baseHp = hpNum;
                    updatedCount++;
                  }
                }
                if (c.baseAp !== undefined && c.baseAp !== "") {
                  const apNum = parseInt(c.baseAp, 10);
                  if (!isNaN(apNum) && d.baseAp !== apNum) {
                    d.baseAp = apNum;
                    updatedCount++;
                  }
                }
                if (c.baseSpd !== undefined && c.baseSpd !== "") {
                  const spdNum = parseInt(c.baseSpd, 10);
                  if (!isNaN(spdNum) && d.baseSpd !== spdNum) {
                    d.baseSpd = spdNum;
                    updatedCount++;
                  }
                }
              }
            });
          });

          // 시트에서 받은 값을 새 기준값으로 기억 (에디터에서 고친 항목은 이전 기준값 유지 → 계속 보호)
          if (protectEdits) {
            const newBaseline = {};
            forEachLiveConditionTarget((key, obj) => {
              newBaseline[key] = locallyEdited.has(key) ? baseline[key] : liveTargetSignature(key, obj);
            });
            saveLiveBaseline(newBaseline);
            if (locallyEdited.size > 0) {
              console.log(`[라이브 조건 동기화] 에디터에서 수정한 ${locallyEdited.size}건은 시트 값으로 덮어쓰지 않았습니다 (실시간 배포 시 시트에 반영).`);
            }
          }

          // 시트에 남아 있는 1200/8 더미값이 병합으로 되살아나지 않도록 다시 정리
          // (기준값 저장 뒤에 정리하므로 에디터 수정으로 취급되어, 다음 실시간 배포 때 시트에서도 지워진다)
          const dummyCleared = clearAllLegacyDummyValues();
          if (dummyCleared > 0) {
            console.log(`[라이브 조건 동기화] 시트의 1200/8 더미값 ${dummyCleared}건 정리`);
            updatedCount += dummyCleared;
          }
          // 시트에 디지타마~유년기 II 속성이 백신 등으로 남아 있어도 "-" 로 되돌림
          updatedCount += enforceEarlyStageAttr();

          if (updatedCount > 0) {
            renderTree();
            drawConnections();
            if (selectedDigiId) updateSidebar();
            console.log(`[라이브 조건 동기화] ${updatedCount}개 조건 갱신 완료.`);
          }
        }
      } catch (err) {
        console.warn("실시간 조건 동기화 스킵 (로컬 데이터 사용):", err);
      } finally {
        liveFetchInFlight = false;
      }
    }

    // 제보 시스템 이벤트 리스너 바인딩 초기화
    function initReportsSystem() {
      // 뷰어 제보 모달 닫기
      const closeReportBtn = document.getElementById("report-condition-close");
      const cancelReportBtn = document.getElementById("btn-report-cancel");
      if (closeReportBtn) closeReportBtn.addEventListener("click", closeReportModal);
      if (cancelReportBtn) cancelReportBtn.addEventListener("click", closeReportModal);

      // 시간 프리셋 칩 클릭
      document.querySelectorAll(".btn-report-time-preset").forEach(chip => {
        chip.addEventListener("click", () => {
          const tInput = document.getElementById("report-input-time");
          if (tInput) tInput.value = chip.dataset.time || "";
        });
      });

      // 제보 전송 버튼
      const submitReportBtn = document.getElementById("btn-report-submit");
      if (submitReportBtn) submitReportBtn.addEventListener("click", submitReport);

      // 위키 변경역사 모달 열기 & 닫기 & 새로고침 버튼들
      const openWikiHistBtn = document.getElementById("btn-open-wiki-history");
      if (openWikiHistBtn) openWikiHistBtn.addEventListener("click", () => openWikiHistoryModal());

      const mobileWikiHistBtn = document.getElementById("btn-mobile-wiki-history");
      if (mobileWikiHistBtn) mobileWikiHistBtn.addEventListener("click", () => openWikiHistoryModal());

      const reportViewHistBtn = document.getElementById("btn-report-view-history");
      if (reportViewHistBtn) {
        reportViewHistBtn.addEventListener("click", () => {
          if (activeReportContext) {
            openWikiHistoryModal(activeReportContext.toName, activeReportContext.dim);
          } else {
            openWikiHistoryModal();
          }
        });
      }

      const closeWikiHistBtn = document.getElementById("btn-wiki-history-close");
      const closeWikiHistBottomBtn = document.getElementById("btn-wiki-history-close-bottom");
      if (closeWikiHistBtn) closeWikiHistBtn.addEventListener("click", closeWikiHistoryModal);
      if (closeWikiHistBottomBtn) closeWikiHistBottomBtn.addEventListener("click", closeWikiHistoryModal);

      const refreshWikiHistBtn = document.getElementById("btn-wiki-history-refresh");
      if (refreshWikiHistBtn) refreshWikiHistBtn.addEventListener("click", fetchWikiHistoryFromGas);

      const filterClearBtn = document.getElementById("btn-wiki-history-filter-clear");
      if (filterClearBtn) {
        filterClearBtn.addEventListener("click", () => {
          currentWikiHistoryFilter = { to: "", dim: "" };
          const badgeEl = document.getElementById("wiki-history-target-badge");
          if (badgeEl) badgeEl.textContent = "전체 최근 변경 내역";
          filterClearBtn.style.display = "none";
          renderWikiHistoryListUI();
          fetchWikiHistoryFromGas(true);
        });
      }

      // 위키 변경 역사 전체 비우기 (에디터 전용)
      const clearAllWikiHistBtn = document.getElementById("btn-wiki-history-clear-all");
      if (clearAllWikiHistBtn) clearAllWikiHistBtn.addEventListener("click", clearAllWikiHistory);

      // 에디터 제보 확인 버튼
      const openReviewBtn = document.getElementById("btn-open-reports");
      if (openReviewBtn) openReviewBtn.addEventListener("click", openReviewReportsModal);

      // 에디터 조건 실시간 배포 버튼
      const syncLiveBtn = document.getElementById("btn-sync-live-conditions");
      if (syncLiveBtn) syncLiveBtn.addEventListener("click", syncLiveConditionsToGas);

      // 에디터 제보 확인 모달 닫기
      const closeReviewBtn = document.getElementById("review-reports-close");
      const closeReviewBottomBtn = document.getElementById("btn-review-reports-close-bottom");
      if (closeReviewBtn) closeReviewBtn.addEventListener("click", closeReviewReportsModal);
      if (closeReviewBottomBtn) closeReviewBottomBtn.addEventListener("click", closeReviewReportsModal);

      // URL 저장 및 새로고침 버튼
      const saveGasBtn = document.getElementById("btn-save-gas-url");
      if (saveGasBtn) saveGasBtn.addEventListener("click", saveGasWebhookUrl);

      const saveAdminTokenBtn = document.getElementById("btn-save-admin-token");
      if (saveAdminTokenBtn) saveAdminTokenBtn.addEventListener("click", saveAdminToken);

      const refreshReportsBtn = document.getElementById("btn-refresh-reports");
      if (refreshReportsBtn) refreshReportsBtn.addEventListener("click", fetchReportsFromGas);

      const clearAllBtn = document.getElementById("btn-clear-all-reports");
      if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllReports);

      // 탭 전환 이벤트 리스너 ([📥 접수된 제보] vs [🗑️ 휴지통])
      const tabActiveBtn = document.getElementById("tab-btn-active-reports");
      if (tabActiveBtn) {
        tabActiveBtn.addEventListener("click", () => switchReportsTab("active"));
      }

      const tabTrashBtn = document.getElementById("tab-btn-trash-reports");
      if (tabTrashBtn) {
        tabTrashBtn.addEventListener("click", () => switchReportsTab("trash"));
      }

      // 휴지통 전체 비우기 버튼
      const emptyTrashBtn = document.getElementById("btn-empty-trash");
      if (emptyTrashBtn) {
        emptyTrashBtn.addEventListener("click", emptyTrashAll);
      }

      // 차단 패널 열고 닫기
      const toggleBlockedBtn = document.getElementById("btn-toggle-blocked-panel");
      if (toggleBlockedBtn) {
        toggleBlockedBtn.addEventListener("click", () => {
          const panel = document.getElementById("blocked-uids-panel");
          if (panel) {
            panel.style.display = panel.style.display === "none" ? "flex" : "none";
          }
        });
      }

      // 수동 UID 차단 입력
      const manualBlockBtn = document.getElementById("btn-manual-block");
      if (manualBlockBtn) {
        manualBlockBtn.addEventListener("click", () => {
          const input = document.getElementById("input-manual-block-uid");
          const val = input ? input.value.trim() : "";
          if (!val) return alert("차단할 UID를 입력해주세요.");
          input.value = "";
          handleBlockUid(val);
        });
      }
    }

    window.addEventListener("resize", () => {
      if (window.innerWidth <= 768 && !isViewerMode) {
        isViewerMode = true;
        applyViewerModeUI();
        renderTree();
        updateSidebar();
      }
      drawConnections();
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        fitEditorView();
        drawConnections();
      }, 200);
    });
