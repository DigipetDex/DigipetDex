/* 스프레드시트/엑셀/CSV/JSON 내보내기 및 저장 */
    // -------------------------------------------------------------------------
    // 6. 구글 스프레드시트 연동 (DiM별 탭 분리 복사 & 엑셀(.xlsx) 다중 탭 다운로드 & CSV)
    // -------------------------------------------------------------------------
    let currentModalDim = null;

    function generateTsvForDim(targetDim) {
      const headers = ["진화 전", "현재 세대", "속성", "진화 대상", "목표 세대", "진화 시간", "필요 바이탈", "필요 PP", "배틀 횟수", "필요 승률(%)", "던전 ★★★", "조그레스", "필요 아이템/캡슐", "비고"];
      if (targetDim === "ALL") {
        headers.unshift("DiM");
      }

      const rows = [headers.join("\t")];

      const evos = (project.evolutions || []).filter(e => {
        if (targetDim === "ALL") return true;
        const fromD = project.digimons[e.from];
        const toD = project.digimons[e.to];
        return (toD && isDigimonVisibleInDim(toD, targetDim)) || (fromD && isDigimonVisibleInDim(fromD, targetDim));
      });

      evos.forEach(e => {
        const fromD = project.digimons[e.from] || { name: e.from, stage: "-", attr: "-", dim: "-" };
        const toD = project.digimons[e.to] || { name: e.to, stage: "-" };
        const req = getEvoRequirements(e, toD);

        const attrText = fromD.attr === "none" ? "-" : (fromD.attr ? fromD.attr.toUpperCase() : "-");

        let winRateText = "";
        if (req.winRate !== undefined && req.winRate !== null && String(req.winRate).trim() !== "") {
          const val = String(req.winRate).trim();
          winRateText = val.endsWith("%") ? val : `${val}%`;
        }

        let battleText = "";
        if (req.battle !== undefined && req.battle !== null && String(req.battle).trim() !== "") {
          battleText = String(req.battle).trim();
        }

        const row = [
          fromD.name,
          fromD.stage,
          attrText,
          toD.name,
          toD.stage,
          req.time || "-",
          req.vital ?? 0,
          req.pp ?? 0,
          battleText,
          winRateText,
          req.dungeon || "-",
          req.jogress || "-",
          req.item || "-",
          req.note || ""
        ];
        if (targetDim === "ALL") {
          row.unshift(fromD.dim || "-");
        }
        rows.push(row.join("\t"));
      });

      return rows.join("\n");
    }

    function renderSheetModalDimTabs() {
      const container = document.getElementById("sheet-modal-dim-tabs");
      if (!container) return;
      container.innerHTML = "";

      // 디지몬이 등록된 유효 DiM 목록 수집
      const activeDims = [];
      (project.dims || []).forEach(dim => {
        const hasDigis = Object.values(project.digimons || {}).some(d => isDigimonVisibleInDim(d, dim));
        if (hasDigis) activeDims.push(dim);
      });

      if (!currentModalDim || (!activeDims.includes(currentModalDim) && currentModalDim !== "ALL")) {
        currentModalDim = (activeDims.includes(filterDim) ? filterDim : activeDims[0]) || "ALL";
      }

      // 1. 현재 선택된 DiM 탭들
      activeDims.forEach(dim => {
        const btn = document.createElement("button");
        const isActive = (currentModalDim === dim);
        btn.textContent = dim;
        btn.style.cssText = `
          padding: 5px 12px; font-size: 0.8rem; border-radius: 6px; white-space: nowrap; cursor: pointer; transition: all 0.15s;
          background: ${isActive ? "var(--primary)" : "rgba(255,255,255,0.08)"};
          color: ${isActive ? "#fff" : "var(--text-sub)"};
          border: 1px solid ${isActive ? "var(--primary)" : "rgba(255,255,255,0.15)"};
          font-weight: ${isActive ? "700" : "500"};
        `;
        btn.addEventListener("click", () => {
          currentModalDim = dim;
          renderSheetModalDimTabs();
          updateSheetModalContent();
        });
        container.appendChild(btn);
      });

      // 2. 전체 통합 탭
      const allBtn = document.createElement("button");
      const isAllActive = (currentModalDim === "ALL");
      allBtn.textContent = "전체 통합";
      allBtn.style.cssText = `
        padding: 5px 12px; font-size: 0.8rem; border-radius: 6px; white-space: nowrap; cursor: pointer; transition: all 0.15s;
        background: ${isAllActive ? "#8B5CF6" : "rgba(255,255,255,0.08)"};
        color: ${isAllActive ? "#fff" : "var(--text-sub)"};
        border: 1px solid ${isAllActive ? "#8B5CF6" : "rgba(255,255,255,0.15)"};
        font-weight: ${isAllActive ? "700" : "500"};
      `;
      allBtn.addEventListener("click", () => {
        currentModalDim = "ALL";
        renderSheetModalDimTabs();
        updateSheetModalContent();
      });
      container.appendChild(allBtn);
    }

    function updateSheetModalContent() {
      const textarea = document.getElementById("sheet-tsv-text");
      const copyBtn = document.getElementById("btn-copy-clipboard");
      if (!textarea) return;

      const tsv = generateTsvForDim(currentModalDim);
      textarea.value = tsv;
      if (copyBtn) {
        copyBtn.textContent = currentModalDim === "ALL" ? "📋 전체 통합 표 복사" : `📋 '${currentModalDim}' 표 복사`;
      }
    }

    // 엑셀(.xlsx) 다중 탭 파일 다운로드 (전체 DiM별 개별 시트 분리)
    function exportXlsxMultiTab() {
      if (typeof XLSX === "undefined") {
        alert("XLSX 라이브러리를 로드하는 중입니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const wb = XLSX.utils.book_new();
      const stageOrderMap = { "디지타마": 0, "유년기 I": 1, "유년기 II": 2, "성장기": 3, "성숙기": 4, "완전체": 5, "궁극체": 6, "궁극체2": 7, "초궁극체": 8, "초궁극체II": 9, "아머체": 10 };
      const attrMap = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", none: "-", unknown: "불명" };

      const activeDims = [];
      const dimDigiMap = {};

      (project.dims || []).forEach(dim => {
        const list = Object.values(project.digimons || {}).filter(d => isDigimonVisibleInDim(d, dim));
        if (list.length > 0) {
          activeDims.push(dim);
          dimDigiMap[dim] = list;
        }
      });

      function getEvosForDim(dimName) {
        return (project.evolutions || []).filter(e => {
          const fromD = project.digimons[e.from];
          const toD = project.digimons[e.to];
          return (toD && isDigimonVisibleInDim(toD, dimName)) || (fromD && isDigimonVisibleInDim(fromD, dimName));
        });
      }

      // 1. 요약 시트
      const summaryRows = [["번호", "DiM 카드명", "등록 디지몬 수", "진화 루트 수"]];
      activeDims.forEach((dim, idx) => {
        summaryRows.push([idx + 1, dim, dimDigiMap[dim]?.length || 0, getEvosForDim(dim).length]);
      });
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "DiM_목록_요약");

      // 2. DiM별 개별 탭
      const headers = ["진화 전", "현재 세대", "속성", "진화 대상", "목표 세대", "진화 시간", "필요 바이탈", "필요 PP", "배틀 횟수", "필요 승률(%)", "던전 ★★★", "조그레스", "필요 아이템/캡슐", "비고"];
      const usedTitles = new Set(["dim_목록_요약"]);

      activeDims.forEach(dim => {
        let sheetTitle = dim.replace(/[🚧❌⚠️]/g, '').replace(/[:\\/?*\[\]]/g, '_').trim();
        if (sheetTitle.length > 28) sheetTitle = sheetTitle.substring(0, 28);
        if (!sheetTitle) sheetTitle = "DiM";
        let finalTitle = sheetTitle;
        let counter = 1;
        while (usedTitles.has(finalTitle.toLowerCase())) {
          finalTitle = `${sheetTitle.substring(0, 25)}_${counter++}`;
        }
        usedTitles.add(finalTitle.toLowerCase());

        const evos = getEvosForDim(dim);
        evos.sort((a, b) => {
          const toA = project.digimons[a.to];
          const toB = project.digimons[b.to];
          const sA = stageOrderMap[toA?.stage] ?? 99;
          const sB = stageOrderMap[toB?.stage] ?? 99;
          if (sA !== sB) return sA - sB;
          return (toA?.name || "").localeCompare(toB?.name || "", "ko");
        });

        const rows = [headers];
        evos.forEach(e => {
          const fromD = project.digimons[e.from] || { name: e.from, stage: "-", attr: "-" };
          const toD = project.digimons[e.to] || { name: e.to, stage: "-" };
          const req = getEvoRequirements(e, toD);

          const attrText = fromD.attr === "none" ? "-" : (attrMap[fromD.attr] || fromD.attr || "-");
          let winRateText = "";
          if (req.winRate !== undefined && req.winRate !== null && String(req.winRate).trim() !== "") {
            const val = String(req.winRate).trim();
            winRateText = val.endsWith("%") ? val : `${val}%`;
          }
          let battleText = (req.battle !== undefined && req.battle !== null && String(req.battle).trim() !== "") ? String(req.battle).trim() : "-";

          rows.push([
            fromD.name || "-",
            fromD.stage || "-",
            attrText,
            toD.name || "-",
            toD.stage || "-",
            req.time || "-",
            req.vital ?? 0,
            req.pp ?? 0,
            battleText,
            winRateText || "-",
            req.dungeon || "-",
            req.jogress || "-",
            req.item || "-",
            req.note || ""
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
          { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 20 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, finalTitle);
      });

      const nowStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `디지펫_DiM별_진화조건_${nowStr}.xlsx`);
      showToast(`총 ${activeDims.length}개 DiM별 탭으로 구성된 엑셀 파일이 다운로드되었습니다!`);
    }

    document.getElementById("btn-export-sheet").addEventListener("click", () => {
      currentModalDim = filterDim;
      renderSheetModalDimTabs();
      updateSheetModalContent();
      document.getElementById("sheet-modal").classList.add("active");
    });

    const btnExportXlsx = document.getElementById("btn-export-xlsx");
    if (btnExportXlsx) {
      btnExportXlsx.addEventListener("click", exportXlsxMultiTab);
    }
    const btnModalExportXlsx = document.getElementById("btn-modal-export-xlsx");
    if (btnModalExportXlsx) {
      btnModalExportXlsx.addEventListener("click", exportXlsxMultiTab);
    }

    document.getElementById("btn-copy-clipboard").addEventListener("click", () => {
      const text = document.getElementById("sheet-tsv-text").value;
      navigator.clipboard.writeText(text).then(() => {
        const targetDesc = currentModalDim === "ALL" ? "전체 통합" : `'${currentModalDim}'`;
        alert(`${targetDesc} 진화 조건이 클립보드에 복사되었습니다!\n\n구글 스프레드시트의 해당 탭 첫 번째 셀에서 [Ctrl + V] 하시면 표 형태로 깔끔하게 붙여넣어집니다.`);
      });
    });

    document.getElementById("modal-close").addEventListener("click", () => {
      document.getElementById("sheet-modal").classList.remove("active");
    });

    // CSV 파일 다운로드
    document.getElementById("btn-export-csv").addEventListener("click", () => {
      const headers = ["DiM", "현재 디지몬", "현재 세대", "속성", "진화 대상", "목표 세대", "진화 시간", "필요 바이탈", "필요 PP", "배틀 횟수", "필요 승률(%)", "던전 ★★★", "조그레스", "필요 아이템/캡슐", "비고"];
      let csvContent = "\uFEFF" + headers.map(h => `"${h}"`).join(",") + "\n";

      project.evolutions.forEach(e => {
        const fromD = project.digimons[e.from] || { name: e.from, stage: "-", attr: "-", dim: "-" };
        const toD = project.digimons[e.to] || { name: e.to, stage: "-" };
        const req = toD.req || e;
        const attrText = fromD.attr === "none" ? "-" : (fromD.attr ? fromD.attr.toUpperCase() : "-");

        let winRateText = "";
        if (req.winRate !== undefined && req.winRate !== null && String(req.winRate).trim() !== "") {
          const val = String(req.winRate).trim();
          winRateText = val.endsWith("%") ? val : `${val}%`;
        }

        let battleText = "";
        if (req.battle !== undefined && req.battle !== null && String(req.battle).trim() !== "") {
          battleText = String(req.battle).trim();
        }

        const row = [
          fromD.dim || "-", fromD.name, fromD.stage, attrText, toD.name, toD.stage,
          req.time, req.vital, req.pp, battleText, winRateText, req.dungeon, req.jogress, req.item, req.note
        ];
        csvContent += row.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",") + "\n";
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `디지펫_바이탈링크_진화트리_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    });

    // 프로젝트 저장 / 불러오기 (JSON)
    document.getElementById("btn-save-project").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "digipet_project.json";
      a.click();
    });

    document.getElementById("btn-load-project").addEventListener("click", () => {
      document.getElementById("file-input-json").click();
    });

    document.getElementById("file-input-json").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          project = JSON.parse(event.target.result);
          selectedDigiId = Object.keys(project.digimons)[0] || null;
          saveState();
          updateDimFilterOptions();
          renderTree();
          updateSidebar();
          alert("프로젝트를 성공적으로 불러왔습니다!");
        } catch (err) {
          alert("유효한 JSON 파일이 아닙니다: " + err);
        }
      };
      reader.readAsText(file);
    });

