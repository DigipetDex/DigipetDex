/* 디지몬 추가/삭제/분기 추가 */
    // -------------------------------------------------------------------------
    // 5. 디지몬 추가 / 삭제 / 분기 추가
    // -------------------------------------------------------------------------
    document.getElementById("btn-add-digimon").addEventListener("click", async () => {
      const name = await showCustomPrompt(
        "새 디지몬 추가",
        "추가할 디지몬의 이름을 입력하거나 목록에서 선택하세요:",
        "",
        "디지몬 이름 검색 (예: 아구몬)",
        "official-digimon-datalist"
      );
      if (!name || !name.trim()) return;

      const trimmedName = name.trim();
      let currentDim = filterDim || selectedDimContext || (project.dims && project.dims[0]) || "아구몬 EX";
      if (currentDim && currentDim.includes(',')) currentDim = currentDim.split(',')[0].trim();

      // 1순위: 영문명 입력 시 공식 도감의 한글명으로 자동 변환
      const official = lookupOfficialDigimon(trimmedName);
      const finalName = official ? official.name : trimmedName;

      // 2순위: 기존 등록된 동일 이름 디지몬의 이미지/속성/세대 연동 (유저가 이미지를 다시 올릴 필요 없도록!)
      const existing = findExistingDigimonByName(finalName);

      const initialStage = existing?.stage || ((official && official.stage && official.stage !== "불명") ? official.stage : "성숙기");
      const initialAttr = existing?.attr || ((official && official.attr && official.attr !== "none") ? official.attr : "vaccine");
      const initialImg = existing?.img || (official?.englishName ? `sprites/${official.englishName}.gif` : "sprites/Agumon.gif");
      const initialHp = existing?.baseHp ?? "";
      const initialAp = existing?.baseAp ?? "";
      const initialSpd = existing?.baseSpd ?? "";
      const id = "digi_" + Date.now();

      const isEgg = initialStage === "디지타마";
      project.digimons[id] = {
        id: id,
        name: finalName,
        stage: initialStage,
        attr: initialAttr,
        img: initialImg,
        baseHp: initialHp,
        baseAp: initialAp,
        baseSpd: initialSpd,
        dim: currentDim,
        order: 999,
        independentReq: true,
        unknownTime: !isEgg, // 디지타마(알)를 제외하고 새로 추가하는 디지몬은 기본적으로 '진화조건 불명'
        partialUnknown: false,
        req: getDefaultReqForStage(initialStage)
      };

      selectedDigiId = id;
      saveState();
      updateDimFilterOptions();
      renderTree();
      updateSidebar();
      showToast(`'${finalName}' 디지몬이 [${currentDim}] 페이지에 추가되었습니다!`, "success");
    });

    document.getElementById("btn-delete-digimon").addEventListener("click", () => {
      const digi = project.digimons[selectedDigiId];
      if (!digi) return;

      if (!confirm(`'${digi.name}' 디지몬을 현재 DiM([${digi.dim || '미지정'}])에서 삭제하시겠습니까?\n\n※ 다른 DiM에 있는 동일 이름 디지몬은 절대 삭제되지 않고 100% 안전하게 유지됩니다.`)) return;

      const delId = selectedDigiId;
      delete project.digimons[delId];
      project.evolutions = project.evolutions.filter(e => e.from !== delId && e.to !== delId);

      const curDim = filterDim !== "ALL" ? filterDim : null;
      const remainingDigis = Object.values(project.digimons).filter(d => isDigimonVisibleInDim(d, curDim));
      selectedDigiId = remainingDigis[0]?.id || Object.keys(project.digimons)[0] || null;

      saveState();
      updateDimFilterOptions();
      renderTree();
      updateSidebar();
      showToast(`'${digi.name}' 디지몬이 삭제되었습니다. (다른 DiM은 영향 없음)`);
    });

    document.getElementById("btn-add-branch").addEventListener("click", async () => {
      const curDim = filterDim !== "ALL" ? filterDim : null;
      const otherDigis = Object.values(project.digimons).filter(d => d.id !== selectedDigiId && isDigimonVisibleInDim(d, curDim));
      if (otherDigis.length === 0) return alert("현재 DiM 내에 연결할 다른 디지몬이 없습니다.");

      const options = otherDigis.map((d, i) => `${i + 1}. ${d.name} (${d.stage})`).join("\n");
      const choice = await showCustomPrompt("진화 연결 대상 선택", `진화할 대상 디지몬 번호를 입력하세요:\n\n${options}`, "1", "번호 입력");
      const idx = parseInt(choice) - 1;

      if (!isNaN(idx) && otherDigis[idx]) {
        const target = otherDigis[idx];
        const exists = project.evolutions.some(e => e.from === selectedDigiId && e.to === target.id);
        if (exists) return alert("이미 연결되어 있습니다.");

        const srcDigi = project.digimons[selectedDigiId];
        const stageDefault = getDefaultReqForStage(target?.stage);
        project.evolutions.push({
          from: selectedDigiId,
          to: target.id,
          lineColor: srcDigi?.lineColor || undefined,
          ...stageDefault
        });

        saveState();
        renderTree();
        updateSidebar();
      }
    });

    // 스토리지 초기화 버튼
    document.getElementById("btn-reset-storage").addEventListener("click", () => {
      if (confirm("정말로 모든 수정한 내용을 초기화하고 기본 샘플 데이터로 되돌리시겠습니까?\n(직접 추가/변경한 모든 내용이 초기화됩니다)")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      }
    });

    // 진화 연결 모드
    document.getElementById("btn-connect-mode").addEventListener("click", () => {
      connectMode = !connectMode;
      connectFromId = null;
      const btn = document.getElementById("btn-connect-mode");
      if (connectMode) {
        btn.style.background = "var(--primary)";
        btn.innerHTML = "연결 모드 (ESC:종료)";
        showToast("진화 연결 모드 활성: [출발 디지몬]을 클릭하세요.");
      } else {
        btn.style.background = "#3F4147";
        btn.innerHTML = "진화 연결";
        showToast("연결 모드가 종료되었습니다.");
      }
      renderTree();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (connectMode) {
          connectMode = false;
          connectFromId = null;
          const btn = document.getElementById("btn-connect-mode");
          if (btn) {
            btn.style.background = "#3F4147";
            btn.innerHTML = "진화 연결";
          }
          showToast("연결 모드가 종료되었습니다.");
          renderTree();
        } else if (selectedDigiId) {
          selectedDigiId = null;
          renderTree();
          updateSidebar();
          showToast("선택이 해제되었습니다.");
        }
      }
    });

    document.getElementById("btn-toggle-line-style").addEventListener("click", () => {
      lineStyle = lineStyle === "step" ? "curve" : "step";
      localStorage.setItem("digipet_line_style", lineStyle);
      updateLineStyleButton();
      drawConnections();
      showToast(lineStyle === "step" ? "직각 연결선으로 변경되었습니다." : "곡선 연결선으로 변경되었습니다.");
    });

