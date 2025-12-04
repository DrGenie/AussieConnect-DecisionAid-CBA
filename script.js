// script.js – LonelyLessAustralia Decision Aid Tool

document.addEventListener("DOMContentLoaded", () => {
  const state = {
    scenarios: [],
    assumptions: {
      qalyGainPerParticipant: 0.03,
      valuePerQALY: 50000,
      systemCostMultiplier: 1.5,
      sessionsPerYear: {
        daily: 365,
        weekly: 52,
        monthly: 12
      }
    },
    chart: null
  };

  setupTabs();
  setupSidebarAssumptions(state);
  setupScenarioForm(state);
  setupClearScenariosButton(state);
  setupExportExcel(state);
  syncAssumptionDisplays(state);
});

// DCE model parameters from the ECL model
const LonelyLessDCE = {
  asc_mean: -0.112,
  asc_optout: 0.131,
  beta: {
    // Type of support (ref = peer support)
    support_peer: 0,
    support_community: 0.527,
    support_psych: 0.156,
    support_vr: -0.349,
    // Method of interaction (ref = in-person)
    method_inperson: 0,
    method_virtual: -0.426,
    method_hybrid: -0.289,
    // Frequency (ref = daily)
    freq_daily: 0,
    freq_weekly: 0.617,
    freq_monthly: 0.336,
    // Duration (ref = 30 minutes)
    duration_30: 0,
    duration_120: 0.185,
    duration_240: 0.213,
    // Accessibility (ref = at home)
    access_home: 0,
    access_local: 0.059,
    access_wider: -0.509,
    // Cost per session
    cost: -0.036
  },
  // WTP (AUD per session) relative to reference levels
  wtp: {
    support_community: 14.47,
    support_psych: 4.28,
    support_vr: -9.58,
    method_virtual: -11.69,
    method_hybrid: -7.95,
    freq_weekly: 16.93,
    freq_monthly: 9.21,
    duration_120: 5.08,
    duration_240: 5.85,
    access_local: 1.62,
    access_wider: -13.99
  }
};

/* ---------------- Tabs ---------------- */

function setupTabs() {
  const buttons = document.querySelectorAll(".sidebar-tab");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab-target");
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.querySelector(`.tab-panel[data-tab="${target}"]`);
      if (panel) {
        panel.classList.add("active");
      }
    });
  });
}

/* ---------------- Assumptions ---------------- */

function setupSidebarAssumptions(state) {
  const qalyGainInput = document.getElementById("sidebar-qaly-gain");
  const qalyValueInput = document.getElementById("sidebar-qaly-value");
  const costMultInput = document.getElementById("sidebar-cost-multiplier");

  if (qalyGainInput) {
    qalyGainInput.addEventListener("input", () => {
      const value = parseFloat(qalyGainInput.value);
      state.assumptions.qalyGainPerParticipant = isFinite(value) && value >= 0 ? value : 0;
      syncAssumptionDisplays(state);
      refreshOutputs(state);
    });
  }

  if (qalyValueInput) {
    qalyValueInput.addEventListener("input", () => {
      const value = parseFloat(qalyValueInput.value);
      state.assumptions.valuePerQALY = isFinite(value) && value >= 0 ? value : 0;
      syncAssumptionDisplays(state);
      refreshOutputs(state);
    });
  }

  if (costMultInput) {
    costMultInput.addEventListener("input", () => {
      const value = parseFloat(costMultInput.value);
      state.assumptions.systemCostMultiplier = isFinite(value) && value >= 0 ? value : 0;
      syncAssumptionDisplays(state);
      refreshOutputs(state);
    });
  }
}

function syncAssumptionDisplays(state) {
  const qalyGainDisplay = document.getElementById("assumption-qaly-gain-display");
  const qalyValueDisplay = document.getElementById("assumption-qaly-value-display");
  const costMultDisplay = document.getElementById("assumption-cost-multiplier-display");

  if (qalyGainDisplay) {
    qalyGainDisplay.textContent = state.assumptions.qalyGainPerParticipant.toFixed(3);
  }
  if (qalyValueDisplay) {
    qalyValueDisplay.textContent = formatCurrencyValue(state.assumptions.valuePerQALY);
  }
  if (costMultDisplay) {
    costMultDisplay.textContent = state.assumptions.systemCostMultiplier.toFixed(2);
  }
}

/* ---------------- Scenario form ---------------- */

function setupScenarioForm(state) {
  const form = document.getElementById("scenario-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const scenario = readScenarioFromForm();
    if (!scenario) {
      return;
    }
    scenario.id = generateScenarioId();
    state.scenarios.push(scenario);
    form.reset();
    // Reset with some sensible defaults
    const participantsInput = document.getElementById("participants");
    if (participantsInput) participantsInput.value = "500";
    const frequencySelect = document.getElementById("frequency");
    if (frequencySelect) frequencySelect.value = "weekly";
    const durationSelect = document.getElementById("duration");
    if (durationSelect) durationSelect.value = "120";
    const costSelect = document.getElementById("costPerSession");
    if (costSelect) costSelect.value = "20";

    refreshOutputs(state);
  });
}

function setupClearScenariosButton(state) {
  const clearBtn = document.getElementById("clearScenariosBtn");
  if (!clearBtn) return;

  clearBtn.addEventListener("click", () => {
    state.scenarios = [];
    refreshOutputs(state);
  });
}

function readScenarioFromForm() {
  const nameInput = document.getElementById("scenarioName");
  const participantsInput = document.getElementById("participants");
  const supportSelect = document.getElementById("typeOfSupport");
  const methodSelect = document.getElementById("methodOfEngagement");
  const frequencySelect = document.getElementById("frequency");
  const durationSelect = document.getElementById("duration");
  const accessSelect = document.getElementById("accessibility");
  const costSelect = document.getElementById("costPerSession");

  if (
    !nameInput ||
    !participantsInput ||
    !supportSelect ||
    !methodSelect ||
    !frequencySelect ||
    !durationSelect ||
    !accessSelect ||
    !costSelect
  ) {
    return null;
  }

  const name = nameInput.value.trim() || "Unnamed scenario";
  const participantsValue = parseFloat(participantsInput.value);
  const participants = isFinite(participantsValue) && participantsValue >= 0 ? participantsValue : 0;

  return {
    name,
    participants,
    support: supportSelect.value,
    method: methodSelect.value,
    frequency: frequencySelect.value,
    duration: durationSelect.value,
    accessibility: accessSelect.value,
    costPerSession: parseFloat(costSelect.value) || 0
  };
}

function generateScenarioId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `scenario_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/* ---------------- Core calculations ---------------- */

function refreshOutputs(state) {
  renderResultsTable(state);
  updateChart(state);
}

function renderResultsTable(state) {
  const tbody = document.getElementById("resultsTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!state.scenarios.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 11;
    cell.textContent = "No scenarios defined yet. Add a scenario in the Program design tab.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  state.scenarios.forEach((scenario) => {
    const metrics = computeScenarioMetrics(scenario, state.assumptions);

    const row = document.createElement("tr");
    appendCell(row, scenario.name);
    appendCell(row, formatNumber(scenario.participants, 0));
    appendCell(row, formatPercentage(metrics.endorsementRate));
    appendCell(row, formatNumber(metrics.engagedParticipants, 0));
    appendCell(row, formatCurrency(metrics.systemCost));
    appendCell(row, formatCurrency(metrics.qalyBenefitValue));
    appendCell(row, formatCurrency(metrics.netBenefitQALY));
    appendCell(row, formatRatio(metrics.bcrQALY));
    appendCell(row, formatCurrency(metrics.wtpBenefit));
    appendCell(row, formatCurrency(metrics.netBenefitWTP));
    appendCell(row, formatRatio(metrics.bcrWTP));

    tbody.appendChild(row);
  });
}

function appendCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.appendChild(cell);
}

function computeScenarioMetrics(scenario, assumptions) {
  const beta = LonelyLessDCE.beta;

  // Utility for the programme scenario
  let U = LonelyLessDCE.asc_mean;

  // Type of support
  if (scenario.support === "community") {
    U += beta.support_community;
  } else if (scenario.support === "psych") {
    U += beta.support_psych;
  } else if (scenario.support === "vr") {
    U += beta.support_vr;
  }

  // Method of interaction
  if (scenario.method === "virtual") {
    U += beta.method_virtual;
  } else if (scenario.method === "hybrid") {
    U += beta.method_hybrid;
  }

  // Frequency
  if (scenario.frequency === "weekly") {
    U += beta.freq_weekly;
  } else if (scenario.frequency === "monthly") {
    U += beta.freq_monthly;
  }

  // Duration
  if (scenario.duration === "120") {
    U += beta.duration_120;
  } else if (scenario.duration === "240") {
    U += beta.duration_240;
  }

  // Accessibility
  if (scenario.accessibility === "local") {
    U += beta.access_local;
  } else if (scenario.accessibility === "wider") {
    U += beta.access_wider;
  }

  // Cost
  U += beta.cost * scenario.costPerSession;

  // Opt-out utility
  const Uopt = LonelyLessDCE.asc_optout;

  const endorsementRate = softmaxProbability(U, Uopt);

  const sessionsPerYear = assumptions.sessionsPerYear[scenario.frequency] || 0;
  const durationHours = durationToHours(scenario.duration);

  const engagedParticipants = scenario.participants * endorsementRate;
  const totalSessions = engagedParticipants * sessionsPerYear;

  const systemCostPerSession = scenario.costPerSession * assumptions.systemCostMultiplier;
  const systemCost = totalSessions * systemCostPerSession;
  const qalyGainPerParticipant = assumptions.qalyGainPerParticipant;
  const totalQALYs = engagedParticipants * qalyGainPerParticipant;
  const qalyBenefitValue = totalQALYs * assumptions.valuePerQALY;

  const wtpPerSession = computeWTPPerSession(scenario);
  const wtpBenefit = totalSessions * wtpPerSession;

  const netBenefitQALY = qalyBenefitValue - systemCost;
  const netBenefitWTP = wtpBenefit - systemCost;

  const bcrQALY = systemCost > 0 ? qalyBenefitValue / systemCost : null;
  const bcrWTP = systemCost > 0 ? wtpBenefit / systemCost : null;

  return {
    endorsementRate,
    engagedParticipants,
    totalSessions,
    durationHours,
    systemCost,
    qalyBenefitValue,
    wtpBenefit,
    netBenefitQALY,
    netBenefitWTP,
    bcrQALY,
    bcrWTP
  };
}

function softmaxProbability(Uprog, Uopt) {
  // Simple two-alternative logit (programme vs opt-out)
  const maxU = Math.max(Uprog, Uopt);
  const expProg = Math.exp(Uprog - maxU);
  const expOpt = Math.exp(Uopt - maxU);
  const denom = expProg + expOpt;
  if (denom === 0) return 0;
  return expProg / denom;
}

function durationToHours(durationValue) {
  if (durationValue === "120") return 2;
  if (durationValue === "240") return 4;
  return 0.5; // 30 minutes as default
}

function computeWTPPerSession(scenario) {
  const W = LonelyLessDCE.wtp;
  let wtp = 0;

  // Type of support (peer support is reference)
  if (scenario.support === "community") {
    wtp += W.support_community;
  } else if (scenario.support === "psych") {
    wtp += W.support_psych;
  } else if (scenario.support === "vr") {
    wtp += W.support_vr;
  }

  // Method of interaction (in-person is reference)
  if (scenario.method === "virtual") {
    wtp += W.method_virtual;
  } else if (scenario.method === "hybrid") {
    wtp += W.method_hybrid;
  }

  // Frequency (daily is reference)
  if (scenario.frequency === "weekly") {
    wtp += W.freq_weekly;
  } else if (scenario.frequency === "monthly") {
    wtp += W.freq_monthly;
  }

  // Duration (30 minutes is reference)
  if (scenario.duration === "120") {
    wtp += W.duration_120;
  } else if (scenario.duration === "240") {
    wtp += W.duration_240;
  }

  // Accessibility (at home is reference)
  if (scenario.accessibility === "local") {
    wtp += W.access_local;
  } else if (scenario.accessibility === "wider") {
    wtp += W.access_wider;
  }

  return wtp;
}

/* ---------------- Chart ---------------- */

function updateChart(state) {
  const canvas = document.getElementById("resultsChart");
  if (!canvas || !window.Chart) return;

  const ctx = canvas.getContext("2d");
  const labels = [];
  const costs = [];
  const benefits = [];

  state.scenarios.forEach((scenario) => {
    const m = computeScenarioMetrics(scenario, state.assumptions);
    labels.push(scenario.name);
    costs.push(m.systemCost);
    benefits.push(m.qalyBenefitValue);
  });

  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  if (!labels.length) {
    return;
  }

  const dataPoints = labels.map((label, index) => ({
    x: costs[index],
    y: benefits[index],
    label
  }));

  state.chart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Scenarios",
          data: dataPoints,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const d = context.raw;
              const label = d.label || "Scenario";
              const cost = d.x || 0;
              const benefit = d.y || 0;
              return [
                label,
                `System cost: ${formatCurrency(cost)}`,
                `QALY benefit value: ${formatCurrency(benefit)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Annual system cost (AUD)"
          },
          ticks: {
            callback: (value) => formatShortCurrency(value)
          }
        },
        y: {
          title: {
            display: true,
            text: "Annual QALY benefit value (AUD)"
          },
          ticks: {
            callback: (value) => formatShortCurrency(value)
          }
        }
      }
    }
  });
}

/* ---------------- Export to Excel ---------------- */

function setupExportExcel(state) {
  const exportBtn = document.getElementById("exportExcelBtn");
  if (!exportBtn) return;

  exportBtn.addEventListener("click", () => {
    if (!window.XLSX) return;
    if (!state.scenarios.length) return;

    const rows = state.scenarios.map((scenario) => {
      const m = computeScenarioMetrics(scenario, state.assumptions);
      return {
        Scenario: scenario.name,
        OlderAdultsPerYear: scenario.participants,
        EndorsementRate: m.endorsementRate,
        EngagedPerYear: m.engagedParticipants,
        SystemCost_AUD: m.systemCost,
        QALYBenefitValue_AUD: m.qalyBenefitValue,
        NetBenefit_QALY_AUD: m.netBenefitQALY,
        BCR_QALY: m.bcrQALY,
        WTPBenefit_AUD: m.wtpBenefit,
        NetBenefit_WTP_AUD: m.netBenefitWTP,
        BCR_WTP: m.bcrWTP
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "LonelyLess scenarios");
    XLSX.writeFile(workbook, "lonelyless_scenarios.xlsx");
  });
}

/* ---------------- Formatting helpers ---------------- */

function formatNumber(value, decimals) {
  if (!isFinite(value)) return "";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatCurrency(value) {
  if (!isFinite(value)) return "";
  const rounded = Math.round(value);
  return `AUD ${rounded.toLocaleString()}`;
}

function formatShortCurrency(value) {
  if (!isFinite(value)) return "";
  const abs = Math.abs(value);
  let formatted = value;
  let suffix = "";
  if (abs >= 1e9) {
    formatted = value / 1e9;
    suffix = "B";
  } else if (abs >= 1e6) {
    formatted = value / 1e6;
    suffix = "M";
  } else if (abs >= 1e3) {
    formatted = value / 1e3;
    suffix = "k";
  }
  return `${formatted.toFixed(1)}${suffix}`;
}

function formatPercentage(value) {
  if (!isFinite(value)) return "";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(value) {
  if (!isFinite(value) || value <= 0) return "";
  return value.toFixed(2);
}

function formatCurrencyValue(value) {
  if (!isFinite(value)) return "";
  return value.toLocaleString();
}
