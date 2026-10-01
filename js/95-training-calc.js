/* 30회 훈련 손익 & 리셋 판독기 */
    // -------------------------------------------------------------
    // 30회 훈련 손익 & 리셋 판독기 로직 (Training Calculator)
    // -------------------------------------------------------------
    const TRAINING_STORAGE_KEY = "digipet_training_calc_v1";

    let trainingState = {
      crunch: { great: 0, succ: 0, fail: 0 },
      punch:  { great: 0, succ: 0, fail: 0 },
      dash:   { great: 0, succ: 0, fail: 0 }
    };

    function loadTrainingState() {
      try {
        const saved = localStorage.getItem(TRAINING_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.crunch && parsed.punch && parsed.dash) {
            trainingState = parsed;
          }
        }
      } catch (e) {}
    }

    function saveTrainingState() {
      try {
        localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(trainingState));
      } catch (e) {}
    }

    function openTrainingCalcModal() {
      const modal = document.getElementById("training-calc-modal");
      if (modal) {
        syncTrainingInputsFromState();
        updateTrainingCalc();
        modal.style.display = "flex";
      }
    }

    function closeTrainingCalcModal() {
      const modal = document.getElementById("training-calc-modal");
      if (modal) modal.style.display = "none";
    }

    function syncTrainingInputsFromState() {
      ["crunch", "punch", "dash"].forEach(type => {
        ["great", "succ", "fail"].forEach(field => {
          const input = document.getElementById(`input-${type}-${field}`);
          if (input) {
            input.value = trainingState[type][field] || 0;
          }
        });
      });
    }

    function updateTrainingCalc() {
      // 1. 각 종목별 수치 읽기 & 보정
      const stats = {
        crunch: { great: Math.max(0, parseInt(document.getElementById("input-crunch-great")?.value || 0, 10)),
                  succ:  Math.max(0, parseInt(document.getElementById("input-crunch-succ")?.value || 0, 10)),
                  fail:  Math.max(0, parseInt(document.getElementById("input-crunch-fail")?.value || 0, 10)) },
        punch:  { great: Math.max(0, parseInt(document.getElementById("input-punch-great")?.value || 0, 10)),
                  succ:  Math.max(0, parseInt(document.getElementById("input-punch-succ")?.value || 0, 10)),
                  fail:  Math.max(0, parseInt(document.getElementById("input-punch-fail")?.value || 0, 10)) },
        dash:   { great: Math.max(0, parseInt(document.getElementById("input-dash-great")?.value || 0, 10)),
                  succ:  Math.max(0, parseInt(document.getElementById("input-dash-succ")?.value || 0, 10)),
                  fail:  Math.max(0, parseInt(document.getElementById("input-dash-fail")?.value || 0, 10)) }
      };

      trainingState = stats;
      saveTrainingState();

      // 크런치 (체력: 대성공 25, 성공 15, 실패 0, 기준 15)
      const c = stats.crunch;
      const cCount = c.great + c.succ + c.fail;
      const cHp = c.great * 25 + c.succ * 15;
      const cBaseline = cCount * 15;
      const cProfit = cHp - cBaseline; // 10 * great - 15 * fail
      const cProfitTurns = cProfit / 15;

      // 펀치 (공격: 대성공 10, 성공 5, 실패 0, 기준 5)
      const p = stats.punch;
      const pCount = p.great + p.succ + p.fail;
      const pAtk = p.great * 10 + p.succ * 5;
      const pBaseline = pCount * 5;
      const pProfit = pAtk - pBaseline; // 5 * (great - fail)
      const pProfitTurns = pProfit / 5;

      // 대쉬 (속도: 대성공 10, 성공 5, 실패 0, 기준 5)
      const d = stats.dash;
      const dCount = d.great + d.succ + d.fail;
      const dSpd = d.great * 10 + d.succ * 5;
      const dBaseline = dCount * 5;
      const dProfit = dSpd - dBaseline; // 5 * (great - fail)
      const dProfitTurns = dProfit / 5;

      const totalUsed = cCount + pCount + dCount;
      const remain = Math.max(0, 30 - totalUsed);
      const netProfitTurns = cProfitTurns + pProfitTurns + dProfitTurns;

      function formatTurns(val) {
        const rounded = Math.round(val);
        if (Math.abs(val - rounded) < 0.05) {
          return (rounded > 0 ? `+${rounded}회` : (rounded < 0 ? `${rounded}회` : `0회`));
        }
        const fixed = val.toFixed(1);
        return (val > 0 ? `+${fixed}회` : `${fixed}회`);
      }

      // DOM 업데이트 - 크런치
      const elResCCount = document.getElementById("res-crunch-count");
      if (elResCCount) elResCCount.textContent = `${cCount}회`;
      const elResCStat = document.getElementById("res-crunch-stat");
      if (elResCStat) elResCStat.textContent = `+${cHp} HP`;
      const elBadgeC = document.getElementById("res-crunch-profit-badge");
      if (elBadgeC) {
        if (cProfitTurns > 0.05) {
          elBadgeC.className = "calc-badge-profit";
          elBadgeC.textContent = formatTurns(cProfitTurns);
        } else if (cProfitTurns < -0.05) {
          elBadgeC.className = "calc-badge-loss";
          elBadgeC.textContent = formatTurns(cProfitTurns);
        } else {
          elBadgeC.className = "calc-badge-even";
          elBadgeC.textContent = `0회`;
        }
      }
      const elGuideC = document.getElementById("res-crunch-guide");
      if (elGuideC) {
        if (cCount === 0 || cProfit === 0) {
          elGuideC.textContent = "본전";
          elGuideC.style.color = "#94A3B8";
        } else if (cProfit > 0) {
          const buffer = Math.floor(cProfit / 15);
          elGuideC.textContent = buffer > 0 ? `실패 ${buffer}회 허용` : "실패 1회 시 손해";
          elGuideC.style.color = "#4ADE80";
        } else {
          const needed = Math.ceil(-cProfit / 10);
          elGuideC.textContent = `대성공 ${needed}회 필요`;
          elGuideC.style.color = "#F87171";
        }
      }

      // DOM 업데이트 - 펀치
      const elResPCount = document.getElementById("res-punch-count");
      if (elResPCount) elResPCount.textContent = `${pCount}회`;
      const elResPStat = document.getElementById("res-punch-stat");
      if (elResPStat) elResPStat.textContent = `+${pAtk} ATK`;
      const elBadgeP = document.getElementById("res-punch-profit-badge");
      if (elBadgeP) {
        if (pProfitTurns > 0.05) {
          elBadgeP.className = "calc-badge-profit";
          elBadgeP.textContent = formatTurns(pProfitTurns);
        } else if (pProfitTurns < -0.05) {
          elBadgeP.className = "calc-badge-loss";
          elBadgeP.textContent = formatTurns(pProfitTurns);
        } else {
          elBadgeP.className = "calc-badge-even";
          elBadgeP.textContent = `0회`;
        }
      }
      const elGuideP = document.getElementById("res-punch-guide");
      if (elGuideP) {
        if (pCount === 0 || pProfit === 0) {
          elGuideP.textContent = "본전";
          elGuideP.style.color = "#94A3B8";
        } else if (pProfit > 0) {
          const buffer = p.great - p.fail;
          elGuideP.textContent = `실패 ${buffer}회 허용`;
          elGuideP.style.color = "#4ADE80";
        } else {
          const needed = p.fail - p.great;
          elGuideP.textContent = `대성공 ${needed}회 필요`;
          elGuideP.style.color = "#F87171";
        }
      }

      // DOM 업데이트 - 대쉬
      const elResDCount = document.getElementById("res-dash-count");
      if (elResDCount) elResDCount.textContent = `${dCount}회`;
      const elResDStat = document.getElementById("res-dash-stat");
      if (elResDStat) elResDStat.textContent = `+${dSpd} SPD`;
      const elBadgeD = document.getElementById("res-dash-profit-badge");
      if (elBadgeD) {
        if (dProfitTurns > 0.05) {
          elBadgeD.className = "calc-badge-profit";
          elBadgeD.textContent = formatTurns(dProfitTurns);
        } else if (dProfitTurns < -0.05) {
          elBadgeD.className = "calc-badge-loss";
          elBadgeD.textContent = formatTurns(dProfitTurns);
        } else {
          elBadgeD.className = "calc-badge-even";
          elBadgeD.textContent = `0회`;
        }
      }
      const elGuideD = document.getElementById("res-dash-guide");
      if (elGuideD) {
        if (dCount === 0 || dProfit === 0) {
          elGuideD.textContent = "본전";
          elGuideD.style.color = "#94A3B8";
        } else if (dProfit > 0) {
          const buffer = d.great - d.fail;
          elGuideD.textContent = `실패 ${buffer}회 허용`;
          elGuideD.style.color = "#4ADE80";
        } else {
          const needed = d.fail - d.great;
          elGuideD.textContent = `대성공 ${needed}회 필요`;
          elGuideD.style.color = "#F87171";
        }
      }

      // 총계 & 프로그레스 바
      const elTotalBadge = document.getElementById("calc-total-count-badge");
      if (elTotalBadge) {
        elTotalBadge.textContent = `${totalUsed} / 30회`;
        elTotalBadge.style.color = totalUsed > 30 ? "#F87171" : "#FFF";
      }
      const elRemain = document.getElementById("calc-remain-count");
      if (elRemain) {
        elRemain.textContent = `${remain}회`;
        elRemain.style.color = remain === 0 ? "#94A3B8" : "#FFF";
      }
      const elBar = document.getElementById("calc-progress-bar");
      if (elBar) {
        const pct = Math.min(100, (totalUsed / 30) * 100);
        elBar.style.width = `${pct}%`;
        elBar.style.background = totalUsed > 30 ? "#F87171" : "#5865F2";
      }

      // 총 손익 및 종합 스탯
      const elOverallBadge = document.getElementById("calc-overall-status-badge");
      if (elOverallBadge) {
        if (netProfitTurns > 0.05) {
          elOverallBadge.textContent = `${formatTurns(netProfitTurns)} (이득)`;
          elOverallBadge.className = "calc-badge-profit";
        } else if (netProfitTurns < -0.05) {
          elOverallBadge.textContent = `${formatTurns(netProfitTurns)} (손해)`;
          elOverallBadge.className = "calc-badge-loss";
        } else {
          elOverallBadge.textContent = "0회 (본전)";
          elOverallBadge.className = "calc-badge-even";
        }
      }

      const elSummaryText = document.getElementById("calc-summary-stat-text");
      if (elSummaryText) {
        elSummaryText.textContent = `HP +${cHp} / ATK +${pAtk} / SPD +${dSpd}`;
      }

      // 종합 점수 계산 (옵션 1: 가중치 방식 - 대성공 +2, 성공 +1, 실패 -2 / 30회 올성공=100점, 올대성공=200점)
      const totalGreat = c.great + p.great + d.great;
      const totalSucc = c.succ + p.succ + d.succ;
      const totalFail = c.fail + p.fail + d.fail;
      const rawUnits = totalGreat * 2 + totalSucc * 1 - totalFail * 2;
      const score = totalUsed > 0 ? Math.max(0, Math.min(200, Math.round((rawUnits / 30) * 100))) : 0;

      const elScore = document.getElementById("calc-score-badge");
      if (elScore) {
        elScore.textContent = `${score}점`;
        if (totalUsed === 0) {
          elScore.style.color = "#94A3B8";
        } else if (score >= 120) {
          elScore.style.color = "#A78BFA"; // 120점 이상 대박 오버스코어 (바이올렛)
        } else if (score >= 100) {
          elScore.style.color = "#4ADE80"; // 100점 이상 달성 (그린)
        } else if (totalUsed === 30) {
          elScore.style.color = "#F87171"; // 30회 완주했는데 100점 미만 (레드)
        } else {
          elScore.style.color = "#FFF"; // 진행 중 100점 미만 (화이트)
        }
      }

      // 리셋 권장 경고 (손해 복구 불가 시)
      const elResetWarn = document.getElementById("calc-reset-warning");
      if (elResetWarn) {
        const isUnrecoverable = (totalUsed > 0 && netProfitTurns + remain < -0.05);
        elResetWarn.style.display = isUnrecoverable ? "block" : "none";
      }
    }

    function resetTrainingCalc() {
      if (confirm("모든 훈련 횟수를 0으로 초기화하시겠습니까?")) {
        trainingState = {
          crunch: { great: 0, succ: 0, fail: 0 },
          punch:  { great: 0, succ: 0, fail: 0 },
          dash:   { great: 0, succ: 0, fail: 0 }
        };
        syncTrainingInputsFromState();
        updateTrainingCalc();
      }
    }

    function initTrainingCalc() {
      const btnOpenCalc = document.getElementById("btn-open-training-calc");
      if (btnOpenCalc) btnOpenCalc.addEventListener("click", openTrainingCalcModal);
      const btnMobileOpenCalc = document.getElementById("btn-mobile-training-calc");
      if (btnMobileOpenCalc) btnMobileOpenCalc.addEventListener("click", openTrainingCalcModal);
      const btnCloseCalc = document.getElementById("training-calc-close");
      if (btnCloseCalc) btnCloseCalc.addEventListener("click", closeTrainingCalcModal);
      const btnCloseCalcBottom = document.getElementById("btn-calc-close-bottom");
      if (btnCloseCalcBottom) btnCloseCalcBottom.addEventListener("click", closeTrainingCalcModal);
      const modalCalc = document.getElementById("training-calc-modal");
      if (modalCalc) {
        modalCalc.addEventListener("click", (e) => {
          if (e.target === modalCalc) closeTrainingCalcModal();
        });
      }

      const btnResetCalc = document.getElementById("btn-calc-reset");
      if (btnResetCalc) btnResetCalc.addEventListener("click", resetTrainingCalc);

      document.querySelectorAll(".calc-num-input").forEach(input => {
        input.addEventListener("input", updateTrainingCalc);
      });

      document.querySelectorAll(".calc-btn-step").forEach(btn => {
        btn.addEventListener("click", () => {
          const type = btn.dataset.type;
          const field = btn.dataset.field;
          const action = btn.dataset.action;
          const input = document.getElementById(`input-${type}-${field}`);
          if (!input) return;
          let val = parseInt(input.value || 0, 10);
          if (action === "inc") {
            val = Math.min(30, val + 1);
          } else if (action === "dec") {
            val = Math.max(0, val - 1);
          }
          input.value = val;
          updateTrainingCalc();
        });
      });

      loadTrainingState();
      syncTrainingInputsFromState();
      updateTrainingCalc();
    }
