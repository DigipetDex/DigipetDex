/* 뷰어/에디터 모드 전환 버튼, project_data.js 다이렉트 저장(Ctrl+S), 앱 내 원클릭 배포 버튼 */
    // 뷰어 모드 토글 버튼
    const toggleModeBtn = document.getElementById("btn-toggle-mode");
    if (toggleModeBtn) {
      toggleModeBtn.addEventListener("click", () => {
        isViewerMode = !isViewerMode;
        applyViewerModeUI();
        renderTree();
        updateSidebar();
        showToast(isViewerMode ? "진화 트리 뷰어 모드로 전환되었습니다." : "트리 & 시트 편집 모드로 전환되었습니다.");
      });
    }

    // 배포용 최신 데이터 내보내기/다이렉트 저장 버튼 (project_data.js)
    let projectDataFileHandle = null;

    async function executeDirectSave() {
      try {
        const projectJsonStr = JSON.stringify(project, null, 2);

        // 1. Electron 데스크톱 앱 모드: 완벽한 물리 파일 다이렉트 저장!
        if (window.electronAPI && window.electronAPI.isElectron) {
          const res = await window.electronAPI.saveProjectData(projectJsonStr);
          if (res.success) {
            showToast("💾 'project_data.js' 파일에 다이렉트 저장 완료!");
            return;
          } else {
            throw new Error(res.error);
          }
        }

        // 2. 웹 브라우저 File System API
        const jsContent = `// 디지펫 바이탈 링크 프로젝트 데이터\nwindow.DIGIPET_DEFAULT_DATA = ${projectJsonStr};\n`;
        if (window.showSaveFilePicker) {
          try {
            if (!projectDataFileHandle) {
              projectDataFileHandle = await window.showSaveFilePicker({
                suggestedName: "project_data.js",
                types: [{
                  description: "JavaScript Data File",
                  accept: { "application/javascript": [".js"] }
                }]
              });
            }
            const writable = await projectDataFileHandle.createWritable();
            await writable.write(jsContent);
            await writable.close();
            showToast("💾 폴더의 'project_data.js'에 다이렉트 저장 완료!");
            return;
          } catch (pickerErr) {
            if (pickerErr.name === "AbortError") return;
          }
        }

        // 3. 일반 다운로드 폴백
        const blob = new Blob([jsContent], { type: "application/javascript;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "project_data.js";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("'project_data.js' 파일이 다운로드되었습니다.");
      } catch (err) {
        console.error("데이터 저장 오류:", err);
        alert("데이터 저장 중 오류가 발생했습니다: " + err.message);
      }
    }

    const syncViewerBtn = document.getElementById("btn-sync-viewer");
    if (syncViewerBtn) {
      syncViewerBtn.addEventListener("click", executeDirectSave);
    }

    // Ctrl + S 누르면 즉시 파일 저장!
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        executeDirectSave();
      }
    });

    // 앱 내부 원클릭 배포 버튼 (GitHub Pages)
    const desktopDeployBtn = document.getElementById("btn-desktop-deploy");
    if (desktopDeployBtn) {
      desktopDeployBtn.addEventListener("click", async () => {
        if (!confirm("현재 작업 내용을 저장하고 GitHub Pages(https://digipetdex.github.io/DigipetDex/)로 즉시 배포하시겠습니까?")) return;

        // 먼저 최신 데이터 저장
        await executeDirectSave();

        showToast("🚀 GitHub Pages로 배포 중입니다... (약 5~10초 소요)");
        desktopDeployBtn.disabled = true;
        desktopDeployBtn.style.opacity = "0.5";

        if (window.electronAPI && window.electronAPI.deployToNetlify) {
          const res = await window.electronAPI.deployToNetlify();
          desktopDeployBtn.disabled = false;
          desktopDeployBtn.style.opacity = "1";

          if (res.success) {
            alert("🎉 [배포 성공]\n\nhttps://digipetdex.github.io/DigipetDex/\n최신 버전이 GitHub Pages에 성공적으로 배포되었습니다!\n(반영까지 약 30초~1분 정도 소요될 수 있습니다.)");
          } else {
            alert("❌ [배포 오류]\n" + (res.error || "배포에 실패했습니다."));
          }
        } else {
          // 브라우저 환경 안내
          desktopDeployBtn.disabled = false;
          desktopDeployBtn.style.opacity = "1";
          alert("웹 브라우저에서는 서버 명령 실행이 제한됩니다.\n폴더의 '원클릭_배포.bat'을 실행하시거나, 전용 에디터 앱(에디터_실행.bat)에서 이 버튼을 눌러주세요!");
        }
      });
    }

