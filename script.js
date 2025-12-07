// script.js (updated with Copilot soft-integrationnn)
/****************************************************************************
 * LonelyLessAustralia Decision Aid
 * - World Bank / WHO style UI
 * - DCE based uptake and willingness to pay
 * - QALY, ROI, cost saving and loneliness free day outcomes
 * - Scenario saving, PDF export and briefing text
 * - Soft integration with Microsoft Copilot
 ****************************************************************************/

document.addEventListener("DOMContentLoaded", function () {
  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach(button => {
    button.addEventListener("click", function () {
      openTab(this.getAttribute("data-tab"), this);
    });
  });
  // Default tab
  openTab("aboutTab", document.querySelector(".tablink"));
});

/* Tab switching */
function openTab(tabId, btn) {
  const tabs = document.querySelectorAll(".tabcontent");
  tabs.forEach(tab => tab.style.display = "none");

  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach(button => {
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
  });

  const current = document.getElementById(tabId);
  if (current) current.style.display = "block";

  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
  }

  if (tabId === "wtpTab") renderWTPChart();
  if (tabId === "costsTab") renderCostsBenefits();
  if (tabId === "probTab") renderProbChart();
}

/* Slider label */
function updateCostDisplay(val) {
  const label = document.getElementById("costLabel");
  if (label) label.textContent = val;
}

/***************************************************************************
 * Global parameters and coefficients
 ***************************************************************************/

/* DCE coefficients (main effect logit, continuous cost) */
const mainCoefficients = {
  ASC_mean: -0.112,
  ASC_optout: 0.131,
  type_comm: 0.527,
  type_psych: 0.156,
  type_vr: -0.349,
  mode_virtual: -0.426,
  mode_hybrid: -0.289,
  freq_weekly: 0.617,
  freq_monthly: 0.336,
  dur_2hrs: 0.185,
  dur_4hrs: 0.213,
  dist_local: 0.059,
  dist_signif: -0.509,
  cost_cont: -0.036
};

/* Cost of living multipliers (illustrative scaling factors) */
const costOfLivingMultipliers = {
  NSW: 1.10,
  VIC: 1.05,
  QLD: 1.00,
  WA: 1.08,
  SA: 1.02,
  TAS: 1.03,
  ACT: 1.15,
  NT: 1.07
};

/* WTP data (AUD per participant per session) */
const wtpDataMain = [
  { key: "type_comm", label: "Community engagement", wtp: 14.47, pVal: 0.000, se: 3.31 },
  { key: "type_psych", label: "Psychological counselling", wtp: 4.28, pVal: 0.245, se: 3.76 },
  { key: "type_vr", label: "Virtual reality", wtp: -9.58, pVal: 0.009, se: 3.72 },
  { key: "mode_virtual", label: "Virtual (method)", wtp: -11.69, pVal: 0.019, se: 5.02 },
  { key: "mode_hybrid", label: "Hybrid (method)", wtp: -7.95, pVal: 0.001, se: 2.51 },
  { key: "freq_weekly", label: "Weekly", wtp: 16.93, pVal: 0.000, se: 2.73 },
  { key: "freq_monthly", label: "Monthly", wtp: 9.21, pVal: 0.005, se: 3.26 },
  { key: "dur_2hrs", label: "2 hour interaction", wtp: 5.08, pVal: 0.059, se: 2.69 },
  { key: "dur_4hrs", label: "4 hour interaction", wtp: 5.85, pVal: 0.037, se: 2.79 },
  { key: "dist_local", label: "Local area accessibility", wtp: 1.62, pVal: 0.712, se: 4.41 },
  { key: "dist_signif", label: "Wider community accessibility", wtp: -13.99, pVal: 0.000, se: 3.98 }
];

/* QALY parameters */
const QALY_SCENARIO_VALUES = {
  low: 0.02,
  moderate: 0.05,
  high: 0.10
};
const VALUE_PER_QALY = 50000;

/* Intervention reach for micro programme */
const BASE_PARTICIPANTS = 250;
const SESSIONS_PER_PROGRAM = 12;

/* ROI and loneliness free day parameters based on national modelling */
const ROI_PARAMS = {
  healthSavingsPerParticipant5Y: 159,
  productivitySavingsPerParticipant5Y: 288,
  lonelinessFreeDaysPerParticipant5Y: 115,
  timeHorizonYears: 5
};

/* Opportunity cost assumptions */
const OPP_COST_HOURLY_VALUE = 20; // AUD per hour
const TRAVEL_HOURS_LOCAL_PER_SESSION = 0.5;
const TRAVEL_HOURS_WIDER_PER_SESSION = 1.5;

/***************************************************************************
 * Scenario building
 ***************************************************************************/

function buildScenarioFromInputs() {
  const state = document.getElementById("state_select").value;
  const adjustCosts = document.getElementById("adjustCosts").value;
  const costSliderEl = document.getElementById("costSlider");
  if (!costSliderEl) return null;
  const rawCost = parseFloat(costSliderEl.value || "0");

  const scenarioName = (document.getElementById("scenarioName") || {}).value || "";
  const scenarioNotes = (document.getElementById("scenarioNotes") || {}).value || "";
  const includeOppCost = document.getElementById("includeOppCost")?.checked || false;

  const support = document.querySelector('input[name="support"]:checked');
  const frequency = document.querySelector('input[name="frequency"]:checked');
  const duration = document.querySelector('input[name="duration"]:checked');
  const accessibility = document.querySelector('input[name="accessibility"]:checked');
  const method = document.querySelector('input[name="method"]:checked');

  if (!support || !frequency || !duration || !accessibility) {
    alert("Please select a level for support programme, frequency, duration and accessibility.");
    return null;
  }

  const commCheck = support.value === "community";
  const psychCheck = support.value === "counselling";
  const vrCheck = support.value === "vr";

  const weeklyCheck = frequency.value === "weekly";
  const monthlyCheck = frequency.value === "monthly";

  const twoHCheck = duration.value === "2hr";
  const fourHCheck = duration.value === "4hr";

  const localCheck = accessibility.value === "local";
  const widerCheck = accessibility.value === "wider";

  let virtualCheck = false;
  let hybridCheck = false;
  if (method) {
    virtualCheck = method.value === "virtual";
    hybridCheck = method.value === "hybrid";
  }

  return {
    scenarioName,
    scenarioNotes,
    state,
    adjustCosts,
    rawCost,
    includeOppCost,
    commCheck,
    psychCheck,
    vrCheck,
    weeklyCheck,
    monthlyCheck,
    twoHCheck,
    fourHCheck,
    localCheck,
    widerCheck,
    virtualCheck,
    hybridCheck
  };
}

/***************************************************************************
 * Utility calculations
 ***************************************************************************/

function applyCostOfLiving(rawCost, state, adjustFlag) {
  let cost = rawCost;
  if (adjustFlag === "yes" && state && costOfLivingMultipliers[state]) {
    cost *= costOfLivingMultipliers[state];
  }
  return cost;
}

function computeProbabilityFromScenario(sc) {
  if (!sc) return 0;

  const adjustedCost = applyCostOfLiving(sc.rawCost, sc.state, sc.adjustCosts);
  const dist_local = sc.localCheck ? 1 : 0;
  const dist_signif = sc.widerCheck ? 1 : 0;
  const freq_weekly = sc.weeklyCheck ? 1 : 0;
  const freq_monthly = sc.monthlyCheck ? 1 : 0;
  const mode_virtual = sc.virtualCheck ? 1 : 0;
  const mode_hybrid = sc.hybridCheck ? 1 : 0;
  const dur_2hrs = sc.twoHCheck ? 1 : 0;
  const dur_4hrs = sc.fourHCheck ? 1 : 0;
  const type_comm = sc.commCheck ? 1 : 0;
  const type_psych = sc.psychCheck ? 1 : 0;
  const type_vr = sc.vrCheck ? 1 : 0;

  const U_alt =
    mainCoefficients.ASC_mean +
    mainCoefficients.type_comm * type_comm +
    mainCoefficients.type_psych * type_psych +
    mainCoefficients.type_vr * type_vr +
    mainCoefficients.mode_virtual * mode_virtual +
    mainCoefficients.mode_hybrid * mode_hybrid +
    mainCoefficients.freq_weekly * freq_weekly +
    mainCoefficients.freq_monthly * freq_monthly +
    mainCoefficients.dur_2hrs * dur_2hrs +
    mainCoefficients.dur_4hrs * dur_4hrs +
    mainCoefficients.dist_local * dist_local +
    mainCoefficients.dist_signif * dist_signif +
    mainCoefficients.cost_cont * adjustedCost;

  const U_optout = mainCoefficients.ASC_optout;

  const expAlt = Math.exp(U_alt);
  const expOpt = Math.exp(U_optout);

  return expAlt / (expAlt + expOpt);
}

/* Opportunity cost in monetary terms */
function computeOpportunityCost(sc, participants) {
  if (!sc.includeOppCost || participants <= 0) return 0;

  const baseSessionHours = sc.twoHCheck ? 2 : (sc.fourHCheck ? 4 : 0.5);
  const travelHours = sc.widerCheck
    ? TRAVEL_HOURS_WIDER_PER_SESSION
    : (sc.localCheck ? TRAVEL_HOURS_LOCAL_PER_SESSION : 0);

  const hoursPerParticipant = SESSIONS_PER_PROGRAM * (baseSessionHours + travelHours);
  const oppCostPerParticipant = hoursPerParticipant * OPP_COST_HOURLY_VALUE;

  return oppCostPerParticipant * participants;
}

/* WTP value for configuration per participant per session */
function computeWTPPerParticipantSession(sc) {
  let total = 0;
  if (sc.commCheck) {
    total += getWTPByKey("type_comm");
  } else if (sc.psychCheck) {
    total += getWTPByKey("type_psych");
  } else if (sc.vrCheck) {
    total += getWTPByKey("type_vr");
  }

  if (sc.weeklyCheck) {
    total += getWTPByKey("freq_weekly");
  } else if (sc.monthlyCheck) {
    total += getWTPByKey("freq_monthly");
  }

  if (sc.twoHCheck) {
    total += getWTPByKey("dur_2hrs");
  } else if (sc.fourHCheck) {
    total += getWTPByKey("dur_4hrs");
  }

  if (sc.localCheck) {
    total += getWTPByKey("dist_local");
  } else if (sc.widerCheck) {
    total += getWTPByKey("dist_signif");
  }

  if (sc.virtualCheck) {
    total += getWTPByKey("mode_virtual");
  } else if (sc.hybridCheck) {
    total += getWTPByKey("mode_hybrid");
  }

  return total;
}

function getWTPByKey(key) {
  const rec = wtpDataMain.find(d => d.key === key);
  return rec ? rec.wtp : 0;
}

/***************************************************************************
 * High level calculations for configuration
 ***************************************************************************/

function getFullResultsForScenario() {
  const sc = buildScenarioFromInputs();
  if (!sc) return null;

  const uptakeProb = computeProbabilityFromScenario(sc);
  const uptakePercent = uptakeProb * 100;
  const participants = BASE_PARTICIPANTS * uptakeProb;

  const qalyScenario = document.getElementById("qalySelect")
    ? document.getElementById("qalySelect").value || "moderate"
    : "moderate";
  const qalyPerParticipant = QALY_SCENARIO_VALUES[qalyScenario] || QALY_SCENARIO_VALUES.moderate;
  const totalQALYs = participants * qalyPerParticipant;
  const qalyMonetised = totalQALYs * VALUE_PER_QALY;

  const adjustedUnitCost = applyCostOfLiving(sc.rawCost, sc.state, sc.adjustCosts);
  const FIXED_COST_ADVERT = 2978.80;
  const OTHER_FIXED_COSTS = 26863.00;
  const FIXED_TOTAL = FIXED_COST_ADVERT + OTHER_FIXED_COSTS;

  const variableComponents =
    0.12 * 10000 +
    0.15 * 10000 +
    49.99 * 10 +
    223.86 * 100 +
    44.77 * 100 +
    100.00 * 100 +
    50.00 * 100 +
    15.00 * 100 +
    20.00 * 250 +
    10.00 * 250;

  const VARIABLE_TOTAL = variableComponents;

  const baselineCost = FIXED_TOTAL + VARIABLE_TOTAL * uptakeProb;
  const participantFeeRevenue = adjustedUnitCost * SESSIONS_PER_PROGRAM * participants;
  const opportunityCost = computeOpportunityCost(sc, participants);

  const totalEconomicCost = baselineCost + opportunityCost;

  const healthSavings = ROI_PARAMS.healthSavingsPerParticipant5Y * participants;
  const productivitySavings = ROI_PARAMS.productivitySavingsPerParticipant5Y * participants;
  const totalSavings = healthSavings + productivitySavings;

  const lonelinessFreeDays = ROI_PARAMS.lonelinessFreeDaysPerParticipant5Y * participants;

  const wtpPerParticipantSession = computeWTPPerParticipantSession(sc);
  const wtpPerParticipantProgram = wtpPerParticipantSession * SESSIONS_PER_PROGRAM;
  const totalWTPBenefits = wtpPerParticipantProgram * participants;

  const netBenefitQALY = qalyMonetised - totalEconomicCost;
  const netBenefitSavings = totalSavings - totalEconomicCost;
  const netBenefitWTP = totalWTPBenefits - totalEconomicCost;

  const bcrQALY = totalEconomicCost > 0 ? qalyMonetised / totalEconomicCost : null;
  const bcrSavings = totalEconomicCost > 0 ? totalSavings / totalEconomicCost : null;
  const bcrWTP = totalEconomicCost > 0 ? totalWTPBenefits / totalEconomicCost : null;

  return {
    scenario: sc,
    uptakeProb,
    uptakePercent,
    participants,
    adjustedUnitCost,
    qalyScenario,
    qalyPerParticipant,
    totalQALYs,
    qalyMonetised,
    baselineCost,
    opportunityCost,
    totalEconomicCost,
    healthSavings,
    productivitySavings,
    totalSavings,
    lonelinessFreeDays,
    wtpPerParticipantSession,
    wtpPerParticipantProgram,
    totalWTPBenefits,
    netBenefitQALY,
    netBenefitSavings,
    netBenefitWTP,
    bcrQALY,
    bcrSavings,
    bcrWTP
  };
}

/***************************************************************************
 * Apply configuration, summary and briefing
 ***************************************************************************/

function applyConfiguration() {
  const res = getFullResultsForScenario();
  if (!res) return;

  updateConfigurationSummary(res);
  updateHeadlineRecommendation(res);
  updateBriefingText(res);
  renderCostsBenefits(res);
  showToast("Configuration applied. Results updated.");
}

function viewResultsSummary() {
  const res = getFullResultsForScenario();
  if (!res) return;

  const modalDiv = document.getElementById("modalResults");
  if (!modalDiv) return;

  const s = res.scenario;
  const html = `
    <h3>Results summary for "${escapeHtml(s.scenarioName || "Unnamed scenario")}"</h3>
    <p><strong>Predicted uptake:</strong> ${res.uptakePercent.toFixed(1)} percent of eligible older adults</p>
    <p><strong>Participants:</strong> ${res.participants.toFixed(0)}</p>
    <p><strong>Total economic cost:</strong> A$${formatMoney(res.totalEconomicCost)}</p>
    <p><strong>Monetised QALY benefits:</strong> A$${formatMoney(res.qalyMonetised)} (scenario: ${res.qalyScenario})</p>
    <p><strong>Cost savings and productivity gains (5 years):</strong> A$${formatMoney(res.totalSavings)}</p>
    <p><strong>WTP based benefits:</strong> A$${formatMoney(res.totalWTPBenefits)}</p>
    <p><strong>Loneliness free days (5 years):</strong> ${res.lonelinessFreeDays.toFixed(0)}</p>
    <p><strong>Benefit cost ratio (QALY):</strong> ${res.bcrQALY ? res.bcrQALY.toFixed(2) : "n.a."}</p>
    <p><strong>Benefit cost ratio (cost savings):</strong> ${res.bcrSavings ? res.bcrSavings.toFixed(2) : "n.a."}</p>
    <p><strong>Benefit cost ratio (WTP):</strong> ${res.bcrWTP ? res.bcrWTP.toFixed(2) : "n.a."}</p>
  `;
  modalDiv.innerHTML = html;
  openModal();
}

/* Configuration summary card */
function updateConfigurationSummary(res) {
  const div = document.getElementById("configSummary");
  if (!div) return;
  const s = res.scenario;

  const lines = [];
  lines.push(`<strong>Programme type:</strong> ${s.commCheck ? "Community engagement" : s.psychCheck ? "Psychological counselling" : s.vrCheck ? "Virtual reality" : "Peer support (reference)"}`);
  lines.push(`<strong>Method:</strong> ${s.virtualCheck ? "Virtual" : s.hybridCheck ? "Hybrid" : "In person"}`);
  lines.push(`<strong>Frequency and duration:</strong> ${s.weeklyCheck ? "Weekly" : s.monthlyCheck ? "Monthly" : "Daily reference"}, ${s.twoHCheck ? "2 hour sessions" : s.fourHCheck ? "4 hour sessions" : "30 minute reference"}`);
  lines.push(`<strong>Accessibility:</strong> ${s.localCheck ? "Local area" : s.widerCheck ? "Wider community" : "At home reference"}`);
  lines.push(`<strong>Participant cost per session:</strong> A$${applyCostOfLiving(s.rawCost, s.state, s.adjustCosts).toFixed(2)}${s.adjustCosts === "yes" && s.state ? " (adjusted for " + s.state + ")" : ""}`);
  lines.push(`<strong>Include opportunity cost:</strong> ${s.includeOppCost ? "Yes" : "No"}`);
  lines.push(`<strong>Predicted uptake:</strong> ${res.uptakePercent.toFixed(1)} percent`);
  lines.push(`<strong>Total economic cost:</strong> A$${formatMoney(res.totalEconomicCost)}`);

  div.innerHTML = `<ul class="bullet-list"><li>${lines.join("</li><li>")}</li></ul>`;
}

/* Headline recommendation */
function updateHeadlineRecommendation(res) {
  const div = document.getElementById("headlineRecommendation");
  if (!div) return;

  const up = res.uptakePercent;
  const bcrQ = res.bcrQALY || 0;
  const bcrSav = res.bcrSavings || 0;
  const bcrW = res.bcrWTP || 0;

  let message = "";

  if (up >= 70 && (bcrQ > 1 || bcrSav > 1 || bcrW > 1)) {
    message =
      "This configuration appears attractive, combining high projected programme uptake with at least one benefit cost ratio above one. " +
      "Subject to budget and implementation feasibility, it is a strong candidate for scale up.";
  } else if (up >= 50 && (bcrQ > 1 || bcrSav > 1 || bcrW > 1)) {
    message =
      "This configuration delivers moderate to high uptake and at least one benefit cost ratio above one. " +
      "There is a reasonable case for investment, particularly if targeting priority groups at risk of loneliness.";
  } else if (up >= 50 && bcrQ <= 1 && bcrSav <= 1 && bcrW <= 1) {
    message =
      "Uptake is acceptable but economic returns are borderline. " +
      "Reducing programme costs, increasing effectiveness or adjusting programme features may improve the value for money profile.";
  } else if (up < 50 && (bcrQ > 1 || bcrSav > 1 || bcrW > 1)) {
    message =
      "Economic returns look promising, but projected uptake is modest. " +
      "Consider revising programme design to improve participation, for example by using local venues, weekly frequency or community engagement formats.";
  } else {
    message =
      "Both uptake and benefit cost ratios are modest, suggesting that the configuration is unlikely to offer good value in its current form. " +
      "It may still be useful for specific subgroups, but further design work is recommended.";
  }

  div.innerHTML = `<p>${message}</p>`;
}

/* Briefing text generation */
function updateBriefingText(res) {
  const textarea = document.getElementById("briefingText");
  if (!textarea) return;
  const s = res.scenario;

  const name = s.scenarioName || "the proposed programme configuration";
  const up = res.uptakePercent;
  const part = res.participants;
  const totalCost = res.totalEconomicCost;
  const bcrQ = res.bcrQALY;
  const bcrSav = res.bcrSavings;
  const bcrW = res.bcrWTP;

  const text =
    `${name} is expected to attract around ${up.toFixed(1)} percent of eligible older adults, which corresponds to approximately ${part.toFixed(0)} participants under the base cohort of ${BASE_PARTICIPANTS}. ` +
    `Total economic costs, including fixed programme inputs${s.includeOppCost ? " and the opportunity cost of participants time" : ""}, are estimated at about A$${formatMoney(totalCost)} over the modelled period. ` +
    `Using QALY based monetised health gains, the implied benefit cost ratio is ${bcrQ ? bcrQ.toFixed(2) : "not defined"}. ` +
    `When focusing on health care and productivity cost savings, the benefit cost ratio is ${bcrSav ? bcrSav.toFixed(2) : "not defined"}. ` +
    `Using discrete choice willingness to pay as an alternative benefit measure, the benefit cost ratio is ${bcrW ? bcrW.toFixed(2) : "not defined"}. ` +
    `Under these assumptions, the configuration would generate on the order of ${res.lonelinessFreeDays.toFixed(0)} loneliness free days over five years for participants. ` +
    `These results suggest that the configuration ${bcrQ > 1 || bcrSav > 1 || bcrW > 1 ? "could represent a sound use of resources, subject to budget constraints and implementation capacity" : "may require further refinement to improve both uptake and value for money"}.`;

  textarea.value = text;
}

/***************************************************************************
 * WTP chart and WTP benefits
 ***************************************************************************/

let wtpChartInstance = null;

function renderWTPChart() {
  const canvas = document.getElementById("wtpChartMain");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (wtpChartInstance) wtpChartInstance.destroy();

  const labels = wtpDataMain.map(d => d.label);
  const values = wtpDataMain.map(d => d.wtp);
  const errors = wtpDataMain.map(d => d.se);

  wtpChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "WTP (A$ per session)",
        data: values,
        backgroundColor: values.map(v => v >= 0 ? "rgba(0,123,255,0.7)" : "rgba(220,53,69,0.7)"),
        borderColor: values.map(v => v >= 0 ? "rgba(0,123,255,1)" : "rgba(220,53,69,1)"),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Willingness to pay for attribute levels",
          font: { size: 14 }
        },
        tooltip: {
          callbacks: {
            afterBody: (ctxArr) => {
              const idx = ctxArr[0].dataIndex;
              const rec = wtpDataMain[idx];
              return `Standard error: ${rec.se}, p-value: ${rec.pVal}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "A$ per participant per session" }
        }
      }
    },
    plugins: [{
      id: "errorbars",
      afterDraw: chart => {
        const { ctx, scales: { y } } = chart;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const value = values[i];
          const se = errors[i];
          if (typeof se !== "number") return;

          const x = bar.x;
          const topY = y.getPixelForValue(value + se);
          const bottomY = y.getPixelForValue(value - se);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x, bottomY);
          ctx.moveTo(x - 4, topY);
          ctx.lineTo(x + 4, topY);
          ctx.moveTo(x - 4, bottomY);
          ctx.lineTo(x + 4, bottomY);
          ctx.strokeStyle = "#222";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        });
      }
    }]
  });
}

function updateWTPBenefitsForCurrentScenario() {
  const res = getFullResultsForScenario();
  if (!res) return;
  const div = document.getElementById("wtpBenefitSummary");
  if (!div) return;

  const html =
    `<p><strong>Average willingness to pay per participant per session:</strong> A$${res.wtpPerParticipantSession.toFixed(2)}</p>` +
    `<p><strong>Average willingness to pay per participant per programme (12 sessions):</strong> A$${res.wtpPerParticipantProgram.toFixed(2)}</p>` +
    `<p><strong>Total willingness to pay based benefits:</strong> A$${formatMoney(res.totalWTPBenefits)}</p>` +
    `<p>These values summarise how strongly older adults in the discrete choice study valued this configuration, based on the trade offs they made between programme features and cost.</p>`;

  div.innerHTML = html;
}

/***************************************************************************
 * Programme uptake chart
 ***************************************************************************/

let uptakeChart = null;

function renderProbChart() {
  const res = getFullResultsForScenario();
  if (!res) return;

  drawUptakeChart(res.uptakePercent);
  const div = document.getElementById("uptakeInterpretation");
  if (!div) return;

  const up = res.uptakePercent;
  let explanation;

  if (up >= 70) {
    explanation =
      "Projected uptake is high. The configuration aligns well with older adults stated preferences, " +
      "suggesting that most eligible participants would consider joining the programme.";
  } else if (up >= 50) {
    explanation =
      "Projected uptake is moderate. Many older adults would join, but some design adjustments around cost, " +
      "location or delivery method could further strengthen appeal.";
  } else {
    explanation =
      "Projected uptake is modest. It may be important to revisit core features, such as participant fees, " +
      "frequency or venue location, to improve engagement.";
  }

  div.innerHTML = `<p>${explanation}</p>`;
}

function drawUptakeChart(uptakeVal) {
  const canvas = document.getElementById("uptakeChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (uptakeChart) uptakeChart.destroy();

  const nonUptake = 100 - uptakeVal;

  uptakeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Uptake", "Non uptake"],
      datasets: [{
        data: [uptakeVal, nonUptake],
        backgroundColor: ["#28a745", "#dc3545"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        title: {
          display: true,
          text: `Predicted programme uptake: ${uptakeVal.toFixed(1)} percent`
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed.toFixed(1)} percent`
          }
        }
      }
    }
  });
}

/***************************************************************************
 * Costs and benefits combined chart
 ***************************************************************************/

let combinedChartInstance = null;

function renderCostsBenefits(preComputed) {
  const res = preComputed || getFullResultsForScenario();
  if (!res) return;

  const container = document.getElementById("costsBenefitsResults");
  if (!container) return;
  container.innerHTML = "";

  const summaryDiv = document.createElement("div");
  summaryDiv.className = "card secondary-card";

  const s = res.scenario;

  const html =
    `<h3>Cost and benefit summary</h3>` +
    `<p><strong>Predicted uptake:</strong> ${res.uptakePercent.toFixed(1)} percent</p>` +
    `<p><strong>Participants (base cohort of ${BASE_PARTICIPANTS}):</strong> ${res.participants.toFixed(0)}</p>` +
    `<p><strong>Total economic cost:</strong> A$${formatMoney(res.totalEconomicCost)}${s.includeOppCost ? " (includes opportunity cost of participant time)" : ""}</p>` +
    `<p><strong>Cost per participant:</strong> A$${res.participants > 0 ? (res.totalEconomicCost / res.participants).toFixed(2) : "n.a."}</p>` +
    `<p><strong>Monetised QALY benefits:</strong> A$${formatMoney(res.qalyMonetised)} (scenario: ${res.qalyScenario}, value per QALY A$${VALUE_PER_QALY.toLocaleString()})</p>` +
    `<p><strong>Health system and productivity savings (5 years):</strong> A$${formatMoney(res.totalSavings)} (health: A$${formatMoney(res.healthSavings)}, productivity: A$${formatMoney(res.productivitySavings)})</p>` +
    `<p><strong>WTP based benefits:</strong> A$${formatMoney(res.totalWTPBenefits)}</p>` +
    `<p><strong>Loneliness free days (5 years):</strong> ${res.lonelinessFreeDays.toFixed(0)}</p>` +
    `<p><strong>Net benefit (QALY):</strong> A$${formatMoney(res.netBenefitQALY)}</p>` +
    `<p><strong>Net benefit (cost savings):</strong> A$${formatMoney(res.netBenefitSavings)}</p>` +
    `<p><strong>Net benefit (WTP):</strong> A$${formatMoney(res.netBenefitWTP)}</p>` +
    `<p><strong>Benefit cost ratio (QALY):</strong> ${res.bcrQALY ? res.bcrQALY.toFixed(2) : "n.a."}</p>` +
    `<p><strong>Benefit cost ratio (cost savings):</strong> ${res.bcrSavings ? res.bcrSavings.toFixed(2) : "n.a."}</p>` +
    `<p><strong>Benefit cost ratio (WTP):</strong> ${res.bcrWTP ? res.bcrWTP.toFixed(2) : "n.a."}</p>` +
    `<p>These metrics combine evidence on programme costs, health outcomes, cost savings and participant preferences. Full methods and data sources are described in the technical appendix.</p>`;

  summaryDiv.innerHTML = html;
  container.appendChild(summaryDiv);

  const chartWrapper = document.createElement("div");
  chartWrapper.className = "chart-box";
  chartWrapper.innerHTML = `<h3>Costs and benefits</h3><canvas id="combinedChart"></canvas>`;
  container.appendChild(chartWrapper);

  const canvas = document.getElementById("combinedChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (combinedChartInstance) combinedChartInstance.destroy();

  const labels = ["Total economic cost", "QALY benefits", "Cost savings", "WTP benefits"];
  const values = [
    res.totalEconomicCost,
    res.qalyMonetised,
    res.totalSavings,
    res.totalWTPBenefits
  ];

  combinedChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "A$",
        data: values,
        backgroundColor: [
          "rgba(220,53,69,0.7)",
          "rgba(40,167,69,0.7)",
          "rgba(23,162,184,0.7)",
          "rgba(255,193,7,0.7)"
        ],
        borderColor: [
          "rgba(220,53,69,1)",
          "rgba(40,167,69,1)",
          "rgba(23,162,184,1)",
          "rgba(255,193,7,1)"
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Comparison of costs and benefit measures",
          font: { size: 13 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "A$" }
        }
      }
    }
  });
}

/***************************************************************************
 * Toggle panels in costs tab
 ***************************************************************************/

function toggleCostBreakdown() {
  const breakdown = document.getElementById("detailedCostBreakdown");
  if (!breakdown) return;
  breakdown.style.display = (breakdown.style.display === "none" || breakdown.style.display === "") ? "flex" : "none";
}

function toggleBenefitsAnalysis() {
  const panel = document.getElementById("detailedBenefitsAnalysis");
  if (!panel) return;
  panel.style.display = (panel.style.display === "none" || panel.style.display === "") ? "flex" : "none";
}

/***************************************************************************
 * Scenario saving and PDF export
 ***************************************************************************/

const savedScenarios = [];

function saveScenario() {
  const res = getFullResultsForScenario();
  if (!res) return;

  const index = savedScenarios.length + 1;
  const name = res.scenario.scenarioName || `Scenario ${index}`;
  const record = { index, name, ...res };

  savedScenarios.push(record);
  appendScenarioRow(record);
  showToast(`Scenario "${name}" saved.`);
}

function appendScenarioRow(rec) {
  const tbody = document.querySelector("#scenarioTable tbody");
  if (!tbody) return;

  const s = rec.scenario;
  const row = document.createElement("tr");

  const cells = [
    rec.name,
    s.state || "None",
    s.adjustCosts === "yes" ? "Yes" : "No",
    s.includeOppCost ? "Yes" : "No",
    `A$${applyCostOfLiving(s.rawCost, s.state, s.adjustCosts).toFixed(2)}`,
    s.localCheck ? "Yes" : "No",
    s.widerCheck ? "Yes" : "No",
    s.weeklyCheck ? "Yes" : "No",
    s.monthlyCheck ? "Yes" : "No",
    s.virtualCheck ? "Yes" : "No",
    s.hybridCheck ? "Yes" : "No",
    s.twoHCheck ? "Yes" : "No",
    s.fourHCheck ? "Yes" : "No",
    s.commCheck ? "Yes" : "No",
    s.psychCheck ? "Yes" : "No",
    s.vrCheck ? "Yes" : "No",
    rec.uptakePercent.toFixed(1),
    formatMoney(rec.totalEconomicCost),
    formatMoney(rec.qalyMonetised),
    formatMoney(rec.totalSavings),
    formatMoney(rec.totalWTPBenefits),
    formatMoney(rec.netBenefitQALY),
    formatMoney(rec.netBenefitSavings),
    formatMoney(rec.netBenefitWTP),
    rec.bcrQALY ? rec.bcrQALY.toFixed(2) : "n.a.",
    rec.bcrSavings ? rec.bcrSavings.toFixed(2) : "n.a.",
    rec.bcrWTP ? rec.bcrWTP.toFixed(2) : "n.a.",
    rec.lonelinessFreeDays.toFixed(0)
  ];

  cells.forEach(text => {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
  });

  tbody.appendChild(row);
}

function openComparison() {
  if (savedScenarios.length < 1) {
    alert("Please save at least one scenario before exporting.");
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Unable to load PDF library. Please check your connection.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFontSize(14);
  doc.text("LonelyLessAustralia Decision Aid", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(11);
  doc.text("Scenario comparison summary", pageWidth / 2, y, { align: "center" });
  y += 8;

  savedScenarios.forEach((rec, idx) => {
    if (y > 260) {
      doc.addPage();
      y = 16;
    }
    const s = rec.scenario;
    doc.setFontSize(11);
    doc.text(`${idx + 1}. ${rec.name}`, 12, y);
    y += 5;
    doc.setFontSize(9);
    const lines = [
      `State: ${s.state || "None"}, cost adjust: ${s.adjustCosts === "yes" ? "Yes" : "No"}, include opportunity cost: ${s.includeOppCost ? "Yes" : "No"}`,
      `Programme type: ${s.commCheck ? "Community engagement" : s.psychCheck ? "Psychological counselling" : s.vrCheck ? "Virtual reality" : "Peer support reference"}`,
      `Method: ${s.virtualCheck ? "Virtual" : s.hybridCheck ? "Hybrid" : "In person"}, frequency: ${s.weeklyCheck ? "Weekly" : s.monthlyCheck ? "Monthly" : "Daily reference"}`,
      `Accessibility: ${s.localCheck ? "Local area" : s.widerCheck ? "Wider community" : "At home reference"}, duration: ${s.twoHCheck ? "2 hour" : s.fourHCheck ? "4 hour" : "30 minute reference"}`,
      `Uptake: ${rec.uptakePercent.toFixed(1)} percent, participants: ${rec.participants.toFixed(0)}`,
      `Total cost: A$${formatMoney(rec.totalEconomicCost)}, QALY benefits: A$${formatMoney(rec.qalyMonetised)}, cost savings: A$${formatMoney(rec.totalSavings)}, WTP benefits: A$${formatMoney(rec.totalWTPBenefits)}`,
      `Net benefit QALY: A$${formatMoney(rec.netBenefitQALY)}, net benefit savings: A$${formatMoney(rec.netBenefitSavings)}, net benefit WTP: A$${formatMoney(rec.netBenefitWTP)}`,
      `BCR QALY: ${rec.bcrQALY ? rec.bcrQALY.toFixed(2) : "n.a."}, BCR savings: ${rec.bcrSavings ? rec.bcrSavings.toFixed(2) : "n.a."}, BCR WTP: ${rec.bcrWTP ? rec.bcrWTP.toFixed(2) : "n.a."}`,
      `Loneliness free days (5 years): ${rec.lonelinessFreeDays.toFixed(0)}`
    ];
    lines.forEach(line => {
      doc.text(line, 12, y);
      y += 4;
    });
    y += 2;
  });

  doc.save("LonelyLessAustralia_scenarios.pdf");
}

/***************************************************************************
 * Microsoft Copilot soft integration
 ***************************************************************************/

async function prepareCopilotPrompt() {
  let target = null;

  if (savedScenarios.length > 0) {
    // Use the most recently saved scenario
    target = savedScenarios[savedScenarios.length - 1];
  } else {
    // Fall back to the current (unsaved) configuration
    const res = getFullResultsForScenario();
    if (!res) {
      alert("Configure and apply a scenario first or save at least one scenario before using Copilot.");
      return;
    }
    const name = res.scenario.scenarioName || "Current scenario (unsaved)";
    target = { name, ...res };
  }

  const sc = target.scenario;

  const exportObj = {
    tool: "LonelyLessAustralia Decision Aid",
    institution: "Newcastle Business School, University of Newcastle, Australia",
    purpose: "To help assess loneliness support programmes for older adults in Australia using discrete choice evidence, realistic costs and health outcomes.",
    scenarioName: target.name,
    scenarioNotes: sc.scenarioNotes || "",
    modelAssumptions: {
      baseCohortSize: BASE_PARTICIPANTS,
      sessionsPerProgram: SESSIONS_PER_PROGRAM,
      qalyScenario: target.qalyScenario,
      qalyGainPerParticipant: target.qalyPerParticipant,
      valuePerQALY_AUD: VALUE_PER_QALY,
      timeHorizonYears: ROI_PARAMS.timeHorizonYears,
      includesOpportunityCost: sc.includeOppCost
    },
    inputs: {
      state: sc.state || null,
      costOfLivingAdjusted: sc.adjustCosts === "yes",
      participantFeePerSession_raw_AUD: sc.rawCost,
      participantFeePerSession_adjusted_AUD: target.adjustedUnitCost,
      programmeType: sc.commCheck ? "Community engagement" : sc.psychCheck ? "Psychological counselling" : sc.vrCheck ? "Virtual reality" : "Peer support (reference)",
      method: sc.virtualCheck ? "Virtual" : sc.hybridCheck ? "Hybrid" : "In person",
      frequency: sc.weeklyCheck ? "Weekly" : sc.monthlyCheck ? "Monthly" : "Daily (reference)",
      duration: sc.twoHCheck ? "2 hour sessions" : sc.fourHCheck ? "4 hour sessions" : "30 minute sessions (reference)",
      accessibility: sc.localCheck ? "Local area (around 12 km)" : sc.widerCheck ? "Wider community (50 km or more)" : "At home (reference)"
    },
    results: {
      uptakePercent: target.uptakePercent,
      participants: target.participants,
      totalEconomicCost_AUD: target.totalEconomicCost,
      costPerParticipant_AUD: target.participants > 0 ? target.totalEconomicCost / target.participants : null,
      qalyMonetisedBenefits_AUD: target.qalyMonetised,
      totalQALYs: target.totalQALYs,
      healthSavings_AUD: target.healthSavings,
      productivitySavings_AUD: target.productivitySavings,
      totalSavings_AUD: target.totalSavings,
      wtpPerParticipantPerSession_AUD: target.wtpPerParticipantSession,
      wtpPerParticipantPerProgram_AUD: target.wtpPerParticipantProgram,
      totalWTPBenefits_AUD: target.totalWTPBenefits,
      lonelinessFreeDays: target.lonelinessFreeDays,
      netBenefit_QALY_AUD: target.netBenefitQALY,
      netBenefit_Savings_AUD: target.netBenefitSavings,
      netBenefit_WTP_AUD: target.netBenefitWTP,
      bcr_QALY: target.bcrQALY,
      bcr_Savings: target.bcrSavings,
      bcr_WTP: target.bcrWTP
    }
  };

  const jsonText = JSON.stringify(exportObj, null, 2);

  const promptText =
`LonelyLessAustralia Tool Copilot Interpretation Prompt

Act as a senior health economist advising the decision makers on reducing loneliness among older adults in Australia. You are working with outputs from the LonelyLessAustralia Tool. The scenario JSON you will receive summarises the configuration selected by the user, including all configured attributes and all model based outputs.

Use the JSON provided to reconstruct the scenario in clear plain language. Describe the configuration by stating the configured scenarios. Present this description with precision so that decision makers can immediately understand what the configuration represents and the resources it requires.
Explain the discrete choice experiment uptake rate results in intuitive terms and state what proportion of older adults are predicted to participate the configuration. Clarify whether uptake appears low, moderate or strong in the context of loneliness reductions among older adults in Australia. If there are any differences in predicted uptake associated with type of support or cost or accessibility, articulate these clearly for policy makers.
Interpret the willingness to pay estimates as monetary summaries of how strongly older adults value the configuration. Make clear that willingness to pay is considered a benefit measure because it reflects the maximum monetary amount that older adults would hypothetically exchange to secure improvements in support program interventions relative to the opt-out or no intervention. State that willingness to pay captures perceived programme value in financial units, allowing direct comparison with the economic costs of the support programs and enabling the economic case to be assessed in terms of whether the perceived value generated by the programme exceeds its cost. Explain how total willingness to pay across all cohorts (if available) compares with total economic cost. Indicate whether older adults appear willing to pay more, about the same or less than the programme would cost to participate. Discuss the implications of this relationship for political feasibility, acceptability to governments or relevant departments and the strength of the economic case from a preference based perspective. If there are separate elements of willingness to pay related to type of support, explain how much additional value older adults attach to community engagement or virtual reality relative to peer support.
Summarise other key outputs by describing the expected number of older adults, the benefits per year and the approximate monetary value of these benefits. Clarify what these figures imply for loneliness reduction among older adults in Australia and how the selected type of support contributes to reducing loneliness among older adults, analysing and interpreting the psychological counseling type or providing virtual reality  for loneliness reduction. State whether the combined costs and benefits yield a benefit cost ratio that is clearly above one, close to one or below one and interpret what that means for value for money in the Australia context.
Bring the results together in a concise policy interpretation suitable for a cabinet note or a national steering committee briefing. Make an explicit judgement about whether the scenario appears highly attractive, promising but in need of refinement or weak from a value for money perspective. Refer directly to predicted uptake, willingness to pay, benefits, total economic cost, benefit cost ratio and net benefits when forming this judgement. Where useful, highlight trade offs between the selected type of support and other types. 

Provide a short set of policy recommendations. Indicate whether the scenario is suitable for national loneliness reduction, targeted scale up in selected states, further piloting or redesign. Suggest practical adjustments that could improve feasibility or value. Present the final output as a polished policy brief with clear section headings and well structured paragraphs. Include a results table that summarises the configuration, predicted uptake, willingness to pay results, benefits, total economic costs, benefit cost ratio and net benefit.

Do not use the em dash character anywhere in your response.

Scenario JSON:
${jsonText}
`;

  const box = document.getElementById("copilotPromptBox");
  if (box) {
    box.value = promptText;
  }

  let clipboardOk = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(promptText);
      clipboardOk = true;
      showToast("Copilot prompt copied to clipboard. A new Copilot tab has been opened.");
    } catch (e) {
      showToast("Unable to copy to clipboard. Copy the prompt from the box and paste it into Copilot.");
    }
  } else {
    showToast("Clipboard is not available. Copy the prompt from the box and paste it into Copilot.");
  }

  window.open("https://copilot.microsoft.com/", "_blank", "noopener");
}

/***************************************************************************
 * Modal and toast helpers
 ***************************************************************************/

function openModal() {
  const modal = document.getElementById("resultModal");
  if (modal) modal.style.display = "block";
}

function closeModal() {
  const modal = document.getElementById("resultModal");
  if (modal) modal.style.display = "none";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

/***************************************************************************
 * Helpers
 ***************************************************************************/

function formatMoney(x) {
  if (!isFinite(x)) return "0";
  return Number(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[m];
  });
}
