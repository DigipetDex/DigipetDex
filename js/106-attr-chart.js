/* 디지펫 속성 상성표 (헤더 [상성표] 버튼 모달, 선택한 디지몬의 속성 강조) */
    // -------------------------------------------------------------
    // 디지펫 고유 상성
    //  백신 → 바이러스 유리 / 데이터 → 백신 유리 / 바이러스 → 데이터 유리
    //  불명 → 백신·데이터·바이러스에게 유리, 프리와는 중립
    //  프리 → 모든 속성과 중립
    //  "-"(none, 속성 없음)는 유년기용이라 표에서 제외
    // -------------------------------------------------------------
    const ATTR_CHART_ORDER = ["vaccine", "data", "virus", "free", "unknown"];
    const ATTR_CHART_LABELS = { vaccine: "백신", data: "데이터", virus: "바이러스", free: "프리", unknown: "불명" };
    const ATTR_BEATS = {
      vaccine: ["virus"],
      data: ["vaccine"],
      virus: ["data"],
      free: [],
      unknown: ["vaccine", "data", "virus"]
    };

    // 공격 쪽 a 가 상대 b 에게: 1 = 유리, -1 = 불리, 0 = 중립
    function getAttrMatchup(a, b) {
      if ((ATTR_BEATS[a] || []).includes(b)) return 1;
      if ((ATTR_BEATS[b] || []).includes(a)) return -1;
      return 0;
    }

    function attrChartDot(attr) {
      return `<i class="attr-chart-dot" style="background:${attrColors[attr] || "#888"}"></i>`;
    }

    // 속성 아이콘 이미지 (images/attr/, 원본은 상성표/*-icon.webp). 투명 배경의 흰색 아이콘이라 어두운 바탕 위에 쓴다.
    const ATTR_ICON_IMAGES = {
      vaccine: "images/attr/vaccine.webp",
      virus: "images/attr/virus.webp",
      data: "images/attr/data.webp",
      unknown: "images/attr/unknown.webp",
      free: "images/attr/free.webp",
      none: "images/attr/none.webp"
    };

    function attrIconSvg(attr, size = 40) {
      if (!ATTR_ICON_IMAGES[attr]) return "";
      return `<img class="attr-icon" src="${ATTR_ICON_IMAGES[attr]}" width="${size}" height="${size}" alt="" draggable="false">`;
    }

    // SVG 안에 넣을 아이콘 (x, y 위치, size 크기)
    function attrIconInSvg(attr, x, y, size) {
      if (!ATTR_ICON_IMAGES[attr]) return "";
      return `<image href="${ATTR_ICON_IMAGES[attr]}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
    }

    // 백신·데이터·바이러스 삼각 상성 그림 (SVG). 백신 왼쪽 위, 바이러스 오른쪽 위, 데이터 가운데 아래.
    // 화살표는 images/attr/arrow.webp(위를 향함)를 방향에 맞게 회전해서 쓴다. A ➜ B = A 가 B 에게 유리.
    // focusAttr 이 있으면 그 타일과 관련 화살표를 강조(유리=초록, 불리=빨강)하고 나머지는 흐리게.
    function renderAttrTriangle(focusAttr) {
      const W = 340, H = 262, T = 92, ARROW = 48; // 전체 크기, 타일 크기, 화살표 크기
      const pos = { vaccine: { x: 22, y: 8 }, virus: { x: 226, y: 8 }, data: { x: 124, y: 162 } };
      const center = a => ({ x: pos[a].x + T / 2, y: pos[a].y + T / 2 });
      const mid = { x: W / 2, y: (center("vaccine").y * 2 + center("data").y) / 3 }; // 삼각형 무게중심

      const arrow = (from, to) => {
        const a = center(from), b = center(to);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90; // 이미지가 위(-y)를 향하므로 +90°
        let cls = "base";
        if (focusAttr) cls = from === focusAttr ? "win" : to === focusAttr ? "lose" : "dim";
        // 강조 라벨은 화살표 바깥쪽(무게중심 반대 방향)에
        const ox = mx - mid.x, oy = my - mid.y, ol = Math.hypot(ox, oy) || 1;
        const lx = mx + (ox / ol) * 36, ly = my + (oy / ol) * 36;
        const label = (cls === "win" || cls === "lose") ? `
            <rect x="${(lx - 19).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="38" height="20" rx="10"/>
            <text x="${lx.toFixed(1)}" y="${(ly + 4.5).toFixed(1)}" text-anchor="middle">${cls === "win" ? "유리" : "불리"}</text>` : "";
        return `<g class="attr-arrow ${cls}">
            <image href="images/attr/arrow.webp" x="${(mx - ARROW / 2).toFixed(1)}" y="${(my - ARROW / 2).toFixed(1)}" width="${ARROW}" height="${ARROW}"
              transform="rotate(${angle.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})"/>${label}
          </g>`;
      };

      const tile = a => {
        const { x, y } = pos[a];
        const isFocus = a === focusAttr;
        return `<g class="attr-tile${isFocus ? " focus" : ""}${focusAttr && !isFocus ? " dim" : ""}">
            <rect x="${x}" y="${y}" width="${T}" height="${T}" rx="12" style="stroke:${attrColors[a]}"/>
            ${attrIconInSvg(a, x + 19, y + 9, T - 38)}
            <text x="${x + T / 2}" y="${y + T - 10}" text-anchor="middle">${ATTR_CHART_LABELS[a]}</text>
          </g>`;
      };

      return `<svg class="attr-triangle" viewBox="0 0 ${W} ${H}" role="img" aria-label="백신은 바이러스에, 바이러스는 데이터에, 데이터는 백신에 유리">
          ${tile("vaccine")}${tile("virus")}${tile("data")}
          ${arrow("vaccine", "virus")}${arrow("virus", "data")}${arrow("data", "vaccine")}
        </svg>`;
    }

    function renderAttrChart() {
      const body = document.getElementById("attr-chart-body");
      if (!body) return;

      const selected = selectedDigiId ? project.digimons[selectedDigiId] : null;
      const focusAttr = selected && ATTR_CHART_ORDER.includes(selected.attr) ? selected.attr : null;

      const head = ATTR_CHART_ORDER.map(b => `<th class="${b === focusAttr ? "focus-col" : ""}">${attrChartDot(b)}${ATTR_CHART_LABELS[b]}</th>`).join("");
      const rows = ATTR_CHART_ORDER.map(a => {
        const cells = ATTR_CHART_ORDER.map(b => {
          const m = getAttrMatchup(a, b);
          const cls = m === 1 ? "win" : m === -1 ? "lose" : "even";
          const text = m === 1 ? "유리" : m === -1 ? "불리" : "–";
          return `<td class="${cls}">${text}</td>`;
        }).join("");
        return `<tr class="${a === focusAttr ? "focus-row" : ""}"><th>${attrChartDot(a)}${ATTR_CHART_LABELS[a]}</th>${cells}</tr>`;
      }).join("");

      const namesOf = (attr, sign) => ATTR_CHART_ORDER.filter(b => getAttrMatchup(attr, b) === sign).map(b => ATTR_CHART_LABELS[b]).join(", ");
      // "바이러스에 유리 · 데이터, 불명에 불리" 처럼 읽히는 문장
      const matchupSentence = attr => {
        const win = namesOf(attr, 1), lose = namesOf(attr, -1);
        if (!win && !lose) return `<span class="even">모든 속성과 중립</span>`;
        return [
          win ? `<span class="win">${win}에 유리</span>` : "",
          lose ? `<span class="lose">${lose}에 불리</span>` : ""
        ].filter(Boolean).join(`<span class="sep">·</span>`);
      };

      let focusHtml = "";
      if (selected) {
        if (focusAttr) {
          focusHtml = `
            <div class="attr-chart-focus">
              ${attrIconSvg(focusAttr, 34)}
              <div class="attr-chart-focus-text">
                <div><strong>${escapeHtml(selected.name)}</strong> · ${ATTR_CHART_LABELS[focusAttr]}</div>
                <div>${matchupSentence(focusAttr)}</div>
              </div>
            </div>`;
        } else {
          focusHtml = `<div class="attr-chart-focus muted">${selected.attr === "none" ? attrIconSvg("none", 34) : ""}<div><strong>${escapeHtml(selected.name)}</strong> 은(는) 속성이 없어(-) 상성이 적용되지 않습니다.</div></div>`;
        }
      }

      // 삼각형 오른쪽 세로 상자: 불명 / 프리 / 없음(-)
      const selectedAttr = selected ? selected.attr : null;
      const sideItem = (attr, label, desc) => `
        <div class="attr-side-item${attr === selectedAttr ? " focus" : ""}${focusAttr && getAttrMatchup(focusAttr, attr) === -1 ? " lose" : ""}">
          ${attrIconSvg(attr, 40)}
          <strong>${label}</strong>
          <span>${desc}</span>
        </div>`;

      body.innerHTML = `
        ${focusHtml}
        <div class="attr-chart-diagram">
          <div class="attr-chart-triangle-area">${renderAttrTriangle(["vaccine", "data", "virus"].includes(focusAttr) ? focusAttr : null)}</div>
          <div class="attr-side-box">
            ${sideItem("unknown", "불명", `백·데·바에 <b class="win">유리</b>`)}
            ${sideItem("free", "프리", "모두와 중립")}
            ${sideItem("none", "없음 (-)", "상성 없음")}
          </div>
        </div>
        <details class="attr-chart-details">
          <summary>전체 상성표로 보기</summary>
          <div class="attr-chart-table-wrap">
            <table class="attr-chart-table">
              <thead><tr><th class="corner">공격 ＼ 상대</th>${head}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p class="attr-chart-note">유년기의 속성 없음(-)은 상성이 없어 표에서 제외했습니다.</p>
        </details>`;
    }

    function openAttrChartModal() {
      const modal = document.getElementById("attr-chart-modal");
      if (!modal) return;
      renderAttrChart();
      modal.style.display = "flex";
    }

    function closeAttrChartModal() {
      const modal = document.getElementById("attr-chart-modal");
      if (modal) modal.style.display = "none";
    }

    function initAttrChart() {
      ["btn-open-attr-chart", "btn-mobile-attr-chart"].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener("click", openAttrChartModal);
      });
      ["attr-chart-close", "btn-attr-chart-close-bottom"].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener("click", closeAttrChartModal);
      });
      const modal = document.getElementById("attr-chart-modal");
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) closeAttrChartModal();
        });
      }
    }

    initAttrChart();
