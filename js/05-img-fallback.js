/* 이미지 로드 실패 폴백(handleDigiImgError) — head 태그에서 가장 먼저 로드 */
/* HTML 정적 <img onerror> 가 다른 스크립트보다 먼저 실행될 수 있어 먼저 로드한다.
   project / saveState 는 호출 시점에 지연 참조하므로 다른 전역에 의존하지 않는다. */
    function handleDigiImgError(imgEl, digiName, originalSrc, digiId = null) {
      const attempt = parseInt(imgEl.dataset.attempt || "0", 10);
      const rawSrc = originalSrc || imgEl.getAttribute("src") || "";
      if (rawSrc.startsWith("data:")) return;

      const fileName = rawSrc.split("/").pop().split("\\").pop();
      const searchPaths = [
        "sprites/" + fileName,
        "아구몬/" + fileName,
        "파피몬/" + fileName
      ];

      if (fileName && attempt < searchPaths.length) {
        const nextSrc = searchPaths[attempt];
        imgEl.dataset.attempt = (attempt + 1).toString();
        imgEl.onload = () => {
          try {
            if (digiId && project.digimons[digiId] && project.digimons[digiId].img !== nextSrc) {
              project.digimons[digiId].img = nextSrc;
              saveState();
            }
          } catch (_) { /* 스크립트 초기화 전 호출 시 무시 */ }
        };
        imgEl.src = encodeURI(nextSrc);
        return;
      }

      imgEl.onerror = null;
      imgEl.onload = null;
      const safeName = (digiName || "?").slice(0, 5);
      imgEl.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="%232B2D31"/><text x="32" y="32" font-size="14" fill="%23949BA4" font-family="sans-serif" font-weight="bold" text-anchor="middle">DIGI</text><text x="32" y="48" fill="%23F2F3F5" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">${encodeURIComponent(safeName)}</text></svg>`;
    }
