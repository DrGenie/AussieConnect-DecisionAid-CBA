/****************************************************************************
 * SCRIPT.JS
 * LonelyLessAustralia Decision Aid
 * Tabs, configuration, DCE based uptake, WTP charts, cost benefit analysis,
 * scenario saving and export, with QALY based and WTP based benefit measures.
 ****************************************************************************/

const appState = {
  lastScenarioInput: null,
  lastResults: null,
  savedScenarios: []
};

/* Attach event listeners when DOM is loaded */
document.addEventListener("DOMContentLoaded", function () {
  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach(button => {
    button.addEventListener("click", function () {
      openTab(this.getAttribute("data-tab"), this);
    });
  });

  // Default tab
  openTab("introTab", document.querySelector(".tablink"));

  // Initialise cost label
  const costSlider = document.getElementById("costSlider");
  const costLabel = document.getElementById("costLabel");
  if (costSlider && costLabel) {
    costLabel.textContent = costSlider.value;
  }
});

/** Tab switching */
function openTab(tabId, btn) {
  const tabs = document.querySelectorAll(".tabcontent");
  tabs.forEach(tab => (tab.style.display = "none"));

  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach(button => {
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
  });

  const target = document.getElementById(tabId);
  if (target) {
    target.style.display = "block";
  }

  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
  }

  if (tabId === "wtpTab") {
    renderWTPChart();
  }
  if (tabId === "costsTab") {
    renderCostsBenefits();
  }
  if (tabId === "probTab") {
    // Only render if configuration is available
    if (appState.lastScenarioInput) {
      renderProbChart();
    }
  }
}

/** Update range slider display */
function updateCostDisplay(val) {
  const label = document.getElementById("costLabel");
  if (label) {
    label.textContent = val;
  }
}

/***************************************************************************
 * Main DCE coefficients and cost multipliers
 ***************************************************************************/
const mainCoefficients = {
  ASC_mean: -0.112,
  ASC_sd: 1.161,
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

const costOfLivingMultipliers = {
  NSW: 1.1,
  VIC: 1.05,
  QLD: 1.0,
  WA: 1.08,
  SA: 1.02,
  TAS: 1.03,
  ACT: 1.15,
  NT: 1.07
};

/***************************************************************************
 * WTP data (A$ per session)
 ***************************************************************************/
const wtpDataMain = [
  { attribute: "Community engagement", wtp: 14.47, pVal: 0.0, se: 3.31 },
  { attribute: "Psychological counselling", wtp: 4.28, pVal: 0.245, se: 3.76 },
  { attribute: "Virtual reality", wtp: -9.58, pVal: 0.009, se: 3.72 },
  { attribute: "Virtual (method)", wtp: -11.69, pVal: 0.019, se: 5.02 },
  { attribute: "Hybrid (method)", wtp: -7.95, pVal: 0.001, se: 2.51 },
  { attribute: "Weekly (frequency)", wtp: 16.93, pVal: 0.0, se: 2.73 },
  { attribute: "Monthly (frequency)", wtp: 9.21, pVal: 0.005, se: 3.26 },
  { attribute: "Two hour interaction", wtp: 5.08, pVal: 0.059, se: 2.69 },
  { attribute: "Four hour interaction", wtp: 5.85, pVal: 0.037, se: 2.79 },
  { attribute: "Local area accessibility", wtp: 1.62, pVal: 0.712, se: 4.41 },
  { attribute: "Wider community accessibility", wtp: -13.99, pVal: 0.0, se: 3.98 }
];

/***************************************************************************
 * Cost constants
 ***************************************************************************/
const QALY_SCENARIO_VALUES = { low: 0.02, moderate: 0.05, high: 0.1 };
const VALUE_PER_QALY = 50000;

const FIXED_COSTS = {
  advertisement: 2978.8,
  otherFixed: 26863.0
};

const VARIABLE_COSTS_PROVIDER = {
  printing: 0.12 * 10000,
  postage: 0.15 * 10000,
  admin: 49.99 * 10,
  trainer: 223.86 * 100,
  oncosts: 44.77 * 100,
  facilitator: 100.0 * 100,
  materials: 50.0 * 100,
  venue: 15.0 * 100
};

const OPPORTUNITY_COSTS = {
  sessionTime: 20.0 * 250,
  travel: 10.0 * 250
};

const FIXED_TOTAL = FIXED_COSTS.advertisement + FIXED_COSTS.otherFixed;
const VARIABLE_PROVIDER_TOTAL =
  VARIABLE_COSTS_PROVIDER.printing +
  VARIABLE_COSTS_PROVIDER.postage +
  VARIABLE_COSTS_PROVIDER.admin +
  VARIABLE_COSTS_PROVIDER.trainer +
  VARIABLE_COSTS_PROVIDER.oncosts +
  VARIABLE_COSTS_PROVIDER.facilitator +
  VARIABLE_COSTS_PROVIDER.materials +
  VARIABLE_COSTS_PROVIDER.venue;

const OPPORTUNITY_TOTAL =
  OPPORTUNITY_COSTS.sessionTime + OPPORTUNITY_COSTS.travel;

/***************************************************************************
 * Helper: build scenario from inputs
 ***************************************************************************/
function buildScenarioFromInputs(showAlerts = true) {
  const state = document.getElementById("state_select")
    ? document.getElementById("state_select").value
    : "";
  const adjustCosts = document.getElementById("adjustCosts")
    ? document.getElementById("adjustCosts").value
    : "no";
  const costSlider = document.getElementById("costSlider");
  const cost_val = costSlider ? parseInt(costSlider.value, 10) : 0;

  const scenarioNameEl = document.getElementById("scenarioName");
  const scenarioNotesEl = document.getElementById("scenarioNotes");
  const oppEl = document.getElementById("includeOppCost");

  const scenarioName = scenarioNameEl ? scenarioNameEl.value.trim() : "";
  const scenarioNotes = scenarioNotesEl ? scenarioNotesEl.value.trim() : "";
  const includeOppCost = oppEl ? !!oppEl.checked : true;

  const support = document.querySelector('input[name="support"]:checked');
  const frequency = document.querySelector('input[name="frequency"]:checked');
  const duration = document.querySelector('input[name="duration"]:checked');
  const accessibility = document.querySelector(
    'input[name="accessibility"]:checked'
  );
  const method = document.querySelector('input[name="method"]:checked');

  if (
    showAlerts &&
    (!support || !frequency || !duration || !accessibility)
  ) {
    alert(
      "Please select a level for support programme, frequency, duration and accessibility before applying the configuration."
    );
    return null;
  }

  const commCheck = support ? support.value === "community" : false;
  const psychCheck = support ? support.value === "counselling" : false;
  const vrCheck = support ? support.value === "vr" : false;

  const weeklyCheck = frequency ? frequency.value === "weekly" : false;
  const monthlyCheck = frequency ? frequency.value === "monthly" : false;

  const twoHCheck = duration ? duration.value === "2hr" : false;
  const fourHCheck = duration ? duration.value === "4hr" : false;

  const localCheck = accessibility ? accessibility.value === "local" : false;
  const widerCheck = accessibility ? accessibility.value === "wider" : false;

  let virtualCheck = false;
  let hybridCheck = false;
  if (method) {
    virtualCheck = method.value === "virtual";
    hybridCheck = method.value === "hybrid";
  }

  const scenarioInput = {
    scenarioName,
    scenarioNotes,
    state,
    adjustCosts,
    includeOppCost,
    cost_val,
    localCheck,
    widerCheck,
    weeklyCheck,
    monthlyCheck,
    virtualCheck,
    hybridCheck,
    twoHCheck,
    fourHCheck,
    commCheck,
    psychCheck,
    vrCheck
  };

  return scenarioInput;
}

/***************************************************************************
 * Compute programme uptake probability
 ***************************************************************************/
function computeProbability(sc, coefs) {
  let finalCost = sc.cost_val || 0;
  if (
    sc.adjustCosts === "yes" &&
    sc.state &&
    costOfLivingMultipliers[sc.state]
  ) {
    finalCost *= costOfLivingMultipliers[sc.state];
  }

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
    coefs.ASC_mean +
    coefs.type_comm * type_comm +
    coefs.type_psych * type_psych +
    coefs.type_vr * type_vr +
    coefs.mode_virtual * mode_virtual +
    coefs.mode_hybrid * mode_hybrid +
    coefs.freq_weekly * freq_weekly +
    coefs.freq_monthly * freq_monthly +
    coefs.dur_2hrs * dur_2hrs +
    coefs.dur_4hrs * dur_4hrs +
    coefs.dist_local * dist_local +
    coefs.dist_signif * dist_signif +
    coefs.cost_cont * finalCost;

  const U_optout = coefs.ASC_optout;
  const expAlt = Math.exp(U_alt);
  const expOpt = Math.exp(U_optout);

  return expAlt / (expAlt + expOpt);
}

/***************************************************************************
 * Compute WTP per participant for a scenario
 ***************************************************************************/
function computeWTPPerParticipant(sc) {
  let wtp = 0;

  if (sc.commCheck) wtp += 14.47;
  if (sc.psychCheck) wtp += 4.28;
  if (sc.vrCheck) wtp += -9.58;

  if (sc.virtualCheck) wtp += -11.69;
  if (sc.hybridCheck) wtp += -7.95;

  if (sc.weeklyCheck) wtp += 16.93;
  if (sc.monthlyCheck) wtp += 9.21;

  if (sc.twoHCheck) wtp += 5.08;
  if (sc.fourHCheck) wtp += 5.85;

  if (sc.localCheck) wtp += 1.62;
  if (sc.widerCheck) wtp += -13.99;

  return wtp;
}

/***************************************************************************
 * Compute scenario results (uptake, costs, QALY and WTP benefits)
 ***************************************************************************/
function computeScenarioResults(scenarioInput) {
  const baseParticipants = 250;
  const p = computeProbability(scenarioInput, mainCoefficients);
  const uptakePercentage = p * 100;
  const participants = baseParticipants * p;

  const qalySelect = document.getElementById("qalySelect");
  const qalyScenario = qalySelect ? qalySelect.value : "moderate";
  const qalyPerParticipant = QALY_SCENARIO_VALUES[qalyScenario] || 0.05;

  const totalQALY = participants * qalyPerParticipant;
  const monetisedBenefitsQALY = totalQALY * VALUE_PER_QALY;

  const variableBase = VARIABLE_PROVIDER_TOTAL;
  const variableTotal = scenarioInput.includeOppCost
    ? variableBase + OPPORTUNITY_TOTAL
    : variableBase;

  const totalCost = FIXED_TOTAL + variableTotal * p;

  const costPerParticipant =
    participants > 0 ? totalCost / participants : 0;

  const netBenefitQALY = monetisedBenefitsQALY - totalCost;
  const bcrQALY =
    totalCost > 0 ? monetisedBenefitsQALY / totalCost : 0;

  const wtpPerParticipant = computeWTPPerParticipant(scenarioInput);
  const totalWTPBenefit = wtpPerParticipant * participants;
  const netBenefitWTP = totalWTPBenefit - totalCost;
  const bcrWTP =
    totalCost > 0 ? totalWTPBenefit / totalCost : 0;

  const results = {
    ...scenarioInput,
    uptakeProbability: p,
    uptakePercentage,
    participants,
    qalyPerParticipant,
    totalQALY,
    monetisedBenefitsQALY,
    netBenefitQALY,
    bcrQALY,
    wtpPerParticipant,
    totalWTPBenefit,
    netBenefitWTP,
    bcrWTP,
    totalCost,
    costPerParticipant,
    // Backward compatible aliases
    predictedUptake: uptakePercentage,
    netBenefit: netBenefitWTP
  };

  return results;
}

/***************************************************************************
 * Configuration actions
 ***************************************************************************/
function applyConfiguration(showToastMessage) {
  const scenarioInput = buildScenarioFromInputs(true);
  if (!scenarioInput) {
    return null;
  }
  const results = computeScenarioResults(scenarioInput);
  appState.lastScenarioInput = scenarioInput;
  appState.lastResults = results;

  updateConfigSummary(results);
  updateHeadlineAndBriefing(results);
  renderCostsBenefits(results);

  if (showToastMessage) {
    showToast(
      "Configuration applied. You can now review uptake and cost benefit results or save this scenario."
    );
  }

  return results;
}

function viewResultsSummary() {
  let results = appState.lastResults;
  if (!results) {
    results = applyConfiguration(false);
    if (!results) return;
  }

  const modal = document.getElementById("resultModal");
  const modalResults = document.getElementById("modalResults");
  if (!modal || !modalResults) return;

  const uptakeText = results.uptakePercentage.toFixed(1);
  const bcrWTPText = results.bcrWTP.toFixed(2);
  const costText = results.totalCost.toLocaleString(undefined, {
    maximumFractionDigits: 0
  });
  const benefitText = results.totalWTPBenefit.toLocaleString(undefined, {
    maximumFractionDigits: 0
  });

  modalResults.innerHTML = `
    <h4>Results summary</h4>
    <p><strong>Scenario name:</strong> ${
      results.scenarioName || "Unnamed scenario"
    }</p>
    <p><strong>Predicted programme uptake:</strong> ${uptakeText} percent</p>
    <p><strong>DCE WTP based benefit cost ratio:</strong> ${bcrWTPText}</p>
    <p><strong>Total economic cost (A$):</strong> ${costText}</p>
    <p><strong>Total WTP based benefits (A$):</strong> ${benefitText}</p>
    <p><strong>Opportunity cost included:</strong> ${
      results.includeOppCost ? "Yes" : "No"
    }</p>
  `;

  openModal();
  showToast(
    "Results summary updated. Use this view together with the WTP, uptake and cost tabs."
  );
}

function handleSaveScenario() {
  const res = applyConfiguration(false);
  if (!res) return;
  saveScenario(res);
  showToast("Scenario saved and added to the table of saved scenarios.");
}

/***************************************************************************
 * Update configuration summary and narrative
 ***************************************************************************/
function updateConfigSummary(results) {
  const summaryEl = document.getElementById("currentConfigSummary");
  if (!summaryEl) return;

  const programmeType = results.commCheck
    ? "Community engagement"
    : results.psychCheck
    ? "Psychological counselling"
    : results.vrCheck
    ? "Virtual reality"
    : "Peer support (reference)";
  const method = results.virtualCheck
    ? "Virtual"
    : results.hybridCheck
    ? "Hybrid"
    : "In person";
  const frequency = results.weeklyCheck
    ? "Weekly"
    : results.monthlyCheck
    ? "Monthly"
    : "Daily (reference)";
  const duration = results.twoHCheck
    ? "Two hour"
    : results.fourHCheck
    ? "Four hour"
    : "Thirty minute (reference)";
  const accessibility = results.localCheck
    ? "Local area"
    : results.widerCheck
    ? "Wider community"
    : "At home (reference)";

  const uptakeText = results.uptakePercentage.toFixed(1);
  const bcrText = results.bcrWTP.toFixed(2);

  summaryEl.textContent =
    "Programme type: " +
    programmeType +
    ", method: " +
    method +
    ", frequency: " +
    frequency +
    ", duration: " +
    duration +
    ", accessibility: " +
    accessibility +
    ". Predicted programme uptake is around " +
    uptakeText +
    " percent with a DCE willingness to pay based benefit cost ratio of approximately " +
    bcrText +
    ".";
}

function updateHeadlineAndBriefing(results) {
  const headlineEl = document.getElementById("headlineRecommendation");
  const briefingEl = document.getElementById("briefingText");
  if (!headlineEl || !briefingEl) return;

  const uptake = results.uptakePercentage;
  const bcr = results.bcrWTP;
  const participants = results.participants;
  const costText = results.totalCost.toLocaleString(undefined, {
    maximumFractionDigits: 0
  });
  const benefitText = results.totalWTPBenefit.toLocaleString(undefined, {
    maximumFractionDigits: 0
  });

  let headline;

  if (uptake >= 70 && bcr >= 1.5) {
    headline =
      "This configuration appears highly attractive, combining strong expected programme uptake with a benefit cost ratio clearly above one.";
  } else if (uptake >= 50 && bcr >= 1.0) {
    headline =
      "This configuration appears promising, with moderate to high uptake and a benefit cost ratio at or above one under current assumptions.";
  } else if (bcr < 1.0) {
    headline =
      "This configuration does not appear cost effective under the current assumptions, as the DCE willingness to pay based benefits are below the total economic costs.";
  } else {
    headline =
      "This configuration delivers some gains but the strength of the case depends on local priorities, budget constraints and alternative options.";
  }

  const scenarioNameText = results.scenarioName
    ? 'The scenario "' + results.scenarioName + '"'
    : "This configuration";

  const oppText = results.includeOppCost
    ? "Opportunity costs of participants are included in the economic costs."
    : "Opportunity costs of participants are not currently included in the economic costs.";

  const briefing =
    scenarioNameText +
    " is estimated to achieve programme uptake of around " +
    uptake.toFixed(1) +
    " percent, with an expected number of participants of roughly " +
    participants.toFixed(0) +
    ". Under the DCE willingness to pay based valuation, the benefit cost ratio is approximately " +
    bcr.toFixed(2) +
    ". National or state level scale up is likely to deliver net benefits when the ratio is above one, subject to budget and implementation feasibility. Under these assumptions, the configuration would involve total economic costs of about A$" +
    costText +
    " and indicative DCE willingness to pay based benefits of about A$" +
    benefitText +
    ". " +
    oppText;

  headlineEl.textContent = headline;
  briefingEl.value = briefing;
}

/***************************************************************************
 * Toast notifications
 ***************************************************************************/
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

/***************************************************************************
 * WTP chart with error bars
 ***************************************************************************/
let wtpChartInstance = null;

function renderWTPChart() {
  const canvas = document.getElementById("wtpChartMain");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (wtpChartInstance) {
    wtpChartInstance.destroy();
  }

  const labels = wtpDataMain.map(item => item.attribute);
  const values = wtpDataMain.map(item => item.wtp);
  const errors = wtpDataMain.map(item => item.se);

  const dataConfig = {
    labels,
    datasets: [
      {
        label: "WTP (A$)",
        data: values,
        backgroundColor: values.map(v =>
          v >= 0 ? "rgba(0,123,255,0.6)" : "rgba(220,53,69,0.6)"
        ),
        borderColor: values.map(v =>
          v >= 0 ? "rgba(0,123,255,1)" : "rgba(220,53,69,1)"
        ),
        borderWidth: 1,
        error: errors
      }
    ]
  };

  wtpChartInstance = new Chart(ctx, {
    type: "bar",
    data: dataConfig,
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Willingness to pay for programme attributes (A$ per session)",
          font: { size: 14 }
        },
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const idx = context[0].dataIndex;
              return (
                "SE: " +
                dataConfig.datasets[0].error[idx] +
                ", p-value: " +
                wtpDataMain[idx].pVal
              );
            }
          }
        }
      }
    },
    plugins: [
      {
        id: "errorbars",
        afterDraw: chart => {
          const {
            ctx,
            scales: { y }
          } = chart;
          chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const centerX = bar.x;
            const value = values[i];
            const se = errors[i];
            if (typeof se === "number") {
              const topY = y.getPixelForValue(value + se);
              const bottomY = y.getPixelForValue(value - se);
              ctx.save();
              ctx.beginPath();
              ctx.strokeStyle = "#000000";
              ctx.lineWidth = 1;
              ctx.moveTo(centerX, topY);
              ctx.lineTo(centerX, bottomY);
              ctx.moveTo(centerX - 5, topY);
              ctx.lineTo(centerX + 5, topY);
              ctx.moveTo(centerX - 5, bottomY);
              ctx.lineTo(centerX + 5, bottomY);
              ctx.stroke();
              ctx.restore();
            }
          });
        }
      }
    ]
  });
}

/***************************************************************************
 * Toggle detailed cost breakdown and benefits analysis
 ***************************************************************************/
function toggleCostBreakdown() {
  const breakdown = document.getElementById("detailedCostBreakdown");
  if (!breakdown) return;
  breakdown.style.display =
    breakdown.style.display === "none" || breakdown.style.display === ""
      ? "flex"
      : "none";
}

function toggleBenefitsAnalysis() {
  const benefits = document.getElementById("detailedBenefitsAnalysis");
  if (!benefits) return;
  benefits.style.display =
    benefits.style.display === "none" || benefits.style.display === ""
      ? "flex"
      : "none";
}

/***************************************************************************
 * Scenario saving and PDF export
 ***************************************************************************/
function saveScenario(existingResults) {
  let results = existingResults;
  if (!results) {
    const scenarioInput = buildScenarioFromInputs(true);
    if (!scenarioInput) return;
    results = computeScenarioResults(scenarioInput);
  }

  const scenarioName =
    results.scenarioName && results.scenarioName.length > 0
      ? results.scenarioName
      : "Scenario " + (appState.savedScenarios.length + 1);

  const scenarioToSave = {
    ...results,
    name: scenarioName
  };

  appState.savedScenarios.push(scenarioToSave);

  const tableBody = document.querySelector("#scenarioTable tbody");
  if (!tableBody) return;

  const row = document.createElement("tr");
  const props = [
    "name",
    "scenarioNotes",
    "state",
    "adjustCosts",
    "includeOppCost",
    "cost_val",
    "localCheck",
    "widerCheck",
    "weeklyCheck",
    "monthlyCheck",
    "virtualCheck",
    "hybridCheck",
    "twoHCheck",
    "fourHCheck",
    "commCheck",
    "psychCheck",
    "vrCheck",
    "predictedUptake",
    "bcrWTP",
    "netBenefitWTP"
  ];

  props.forEach(prop => {
    const cell = document.createElement("td");
    const value = scenarioToSave[prop];

    if (prop === "cost_val") {
      cell.textContent = "A$" + value.toFixed(2);
    } else if (prop === "predictedUptake") {
      cell.textContent = value.toFixed(1);
    } else if (prop === "bcrWTP") {
      cell.textContent = value.toFixed(2);
    } else if (prop === "netBenefitWTP") {
      cell.textContent = "A$" + value.toLocaleString(undefined, {
        maximumFractionDigits: 0
      });
    } else if (typeof value === "boolean") {
      cell.textContent = value ? "Yes" : "No";
    } else if (value === null || value === undefined || value === "") {
      cell.textContent = "N/A";
    } else {
      cell.textContent = value;
    }
    row.appendChild(cell);
  });

  tableBody.appendChild(row);
}

function openComparison() {
  if (!appState.savedScenarios || appState.savedScenarios.length < 2) {
    alert("Save at least two scenarios to compare.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;

  doc.setFontSize(16);
  doc.text(
    "LonelyLessAustralia - scenarios comparison",
    pageWidth / 2,
    currentY,
    { align: "center" }
  );
  currentY += 10;

  appState.savedScenarios.forEach((scenario, index) => {
    if (currentY > 260) {
      doc.addPage();
      currentY = 15;
    }
    doc.setFontSize(14);
    doc.text(
      "Scenario " + (index + 1) + ": " + (scenario.name || "Unnamed"),
      15,
      currentY
    );
    currentY += 7;
    doc.setFontSize(11);
    doc.text("State: " + (scenario.state || "None"), 15, currentY);
    currentY += 5;
    doc.text(
      "Cost adjust: " +
        (scenario.adjustCosts === "yes" ? "Yes" : "No"),
      15,
      currentY
    );
    currentY += 5;
    doc.text(
      "Opportunity cost included: " +
        (scenario.includeOppCost ? "Yes" : "No"),
      15,
      currentY
    );
    currentY += 5;
    doc.text(
      "Cost per session: A$" + scenario.cost_val.toFixed(2),
      15,
      currentY
    );
    currentY += 5;
    doc.text(
      "Predicted uptake: " +
        scenario.predictedUptake.toFixed(1) +
        " percent",
      15,
      currentY
    );
    currentY += 5;
    doc.text(
      "Benefit cost ratio (WTP): " + scenario.bcrWTP.toFixed(2),
      15,
      currentY
    );
    currentY += 5;
    doc.text(
      "Net benefit (WTP): A$" +
        scenario.netBenefitWTP.toLocaleString(undefined, {
          maximumFractionDigits: 0
        }),
      15,
      currentY
    );
    currentY += 7;
    if (scenario.scenarioNotes) {
      const notesLines = doc.splitTextToSize(
        "Notes: " + scenario.scenarioNotes,
        pageWidth - 30
      );
      doc.text(notesLines, 15, currentY);
      currentY += notesLines.length * 5;
    }
    currentY += 4;
  });

  doc.save("LonelyLessAustralia_scenarios_comparison.pdf");
}

/***************************************************************************
 * Modal functions
 ***************************************************************************/
function openModal() {
  const modal = document.getElementById("resultModal");
  if (modal) {
    modal.style.display = "block";
  }
}

function closeModal() {
  const modal = document.getElementById("resultModal");
  if (modal) {
    modal.style.display = "none";
  }
}

/***************************************************************************
 * Predicted programme uptake chart
 ***************************************************************************/
let uptakeChart = null;

function renderProbChart() {
  const scenarioInput =
    appState.lastScenarioInput ||
    buildScenarioFromInputs(true);
  if (!scenarioInput) return;

  const pVal = computeProbability(scenarioInput, mainCoefficients) * 100;

  drawUptakeChart(pVal);

  const recommendation = getRecommendation(scenarioInput, pVal);
  const modalResults = document.getElementById("modalResults");
  if (modalResults) {
    modalResults.innerHTML =
      "<h4>Calculation results</h4>" +
      "<p><strong>Predicted uptake:</strong> " +
      pVal.toFixed(1) +
      " percent</p>" +
      "<p>" +
      recommendation +
      "</p>";
  }
}

function drawUptakeChart(uptakeVal) {
  const canvas = document.getElementById("uptakeChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (uptakeChart) {
    uptakeChart.destroy();
  }

  uptakeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Uptake", "Non uptake"],
      datasets: [
        {
          data: [uptakeVal, 100 - uptakeVal],
          backgroundColor: ["#28a745", "#dc3545"]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text:
            "Predicted programme uptake: " + uptakeVal.toFixed(1) + " percent",
          font: { size: 14 }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return (
                context.label +
                ": " +
                context.parsed.toFixed(1) +
                " percent"
              );
            }
          }
        }
      }
    }
  });
}

/***************************************************************************
 * Dynamic recommendation for predicted programme uptake
 ***************************************************************************/
function getRecommendation(scenario, uptake) {
  let rec = "Recommendation: ";

  if (!scenario.virtualCheck && !scenario.hybridCheck) {
    rec += "Delivery defaults to in person which may suit many older adults. ";
  } else if (scenario.virtualCheck && uptake < 50) {
    rec +=
      "Fully virtual delivery appears to reduce uptake, so shifting toward a hybrid or in person approach may be beneficial. ";
  } else if (scenario.hybridCheck && uptake < 50) {
    rec +=
      "Hybrid delivery may benefit from higher in person contact or additional engagement supports. ";
  }

  if (scenario.commCheck && uptake < 40) {
    rec +=
      "Community engagement is selected but uptake is modest, so further promotion or lower copayments may be needed. ";
  } else if (scenario.psychCheck && uptake < 40) {
    rec +=
      "Psychological counselling alone may be less appealing; combining it with social activities could support uptake. ";
  } else if (scenario.vrCheck && uptake < 40) {
    rec +=
      "Virtual reality based sessions may need careful introduction and support, or alternative options for those less comfortable with technology. ";
  }

  if (scenario.monthlyCheck && uptake < 50) {
    rec +=
      "Monthly sessions appear less attractive; moving to weekly contact could improve participation. ";
  }
  if (scenario.twoHCheck && uptake < 50) {
    rec +=
      "Shorter sessions may not be sufficient to engage some participants; consider complementary contacts or outreach. ";
  } else if (scenario.fourHCheck && uptake >= 70) {
    rec +=
      "Longer sessions appear acceptable and may support deeper relationships among participants. ";
  }

  if (scenario.widerCheck && uptake < 50) {
    rec +=
      "Offering the programme closer to where older adults live could further increase uptake. ";
  }

  if (uptake >= 70) {
    rec =
      "Uptake is high and the current configuration looks strong from an engagement perspective. Focus can shift to implementation details and equity of access.";
  }

  return rec;
}

/***************************************************************************
 * Costs and benefits analysis and chart
 ***************************************************************************/
let combinedChartInstance = null;

function renderCostsBenefits(existingResults) {
  let results = existingResults;

  if (!results) {
    const scenarioInput = appState.lastScenarioInput
      ? appState.lastScenarioInput
      : buildScenarioFromInputs(false);
    if (!scenarioInput) return null;
    results = computeScenarioResults(scenarioInput);
  }

  appState.lastResults = results;

  const costsTab = document.getElementById("costsBenefitsResults");
  if (!costsTab) return results;

  costsTab.innerHTML = "";

  const uptakePercentage = results.uptakePercentage;
  const participants = results.participants;
  const totalCost = results.totalCost;
  const costPerParticipant = results.costPerParticipant;
  const totalQALY = results.totalQALY;
  const monetisedBenefitsQALY = results.monetisedBenefitsQALY;
  const netBenefitQALY = results.netBenefitQALY;
  const totalWTPBenefit = results.totalWTPBenefit;
  const netBenefitWTP = results.netBenefitWTP;
  const bcrWTP = results.bcrWTP;

  const summaryDiv = document.createElement("div");
  summaryDiv.className = "calculation-info";
  summaryDiv.innerHTML = `
    <h4>Cost and benefits summary</h4>
    <p><strong>Uptake:</strong> ${uptakePercentage.toFixed(
      2
    )} percent</p>
    <p><strong>Expected number of participants:</strong> ${participants.toFixed(
      0
    )}</p>
    <p><strong>Total economic cost:</strong> A$${totalCost.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )}</p>
    <p><strong>Cost per participant:</strong> A$${costPerParticipant.toFixed(
      2
    )}</p>
    <p><strong>QALY based benefits:</strong> total QALYs of ${totalQALY.toFixed(
      2
    )} valued at A$${monetisedBenefitsQALY.toLocaleString(undefined, {
      maximumFractionDigits: 0
    })}, with net benefit of A$${netBenefitQALY.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}.</p>
    <p><strong>DCE WTP based benefits:</strong> total willingness to pay based benefits of A$${totalWTPBenefit.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )} and net benefit of A$${netBenefitWTP.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}, giving a benefit cost ratio of approximately ${bcrWTP.toFixed(
    2
  )}.</p>
    <p>
      QALY based and DCE WTP based results can be considered jointly. QALY values reflect health sector benchmarks, while DCE based values reflect how older adults themselves value the package of programme features.
    </p>
  `;

  costsTab.appendChild(summaryDiv);

  const combinedChartContainer = document.createElement("div");
  combinedChartContainer.id = "combinedChartContainer";
  combinedChartContainer.innerHTML = `<canvas id="combinedChart"></canvas>`;
  costsTab.appendChild(combinedChartContainer);

  const ctxCombined = document
    .getElementById("combinedChart")
    .getContext("2d");

  if (combinedChartInstance) {
    combinedChartInstance.destroy();
  }

  combinedChartInstance = new Chart(ctxCombined, {
    type: "bar",
    data: {
      labels: [
        "Total cost",
        "WTP based benefits",
        "Net benefit (WTP)"
      ],
      datasets: [
        {
          label: "A$",
          data: [totalCost, totalWTPBenefit, netBenefitWTP],
          backgroundColor: [
            "rgba(220,53,69,0.6)",
            "rgba(40,167,69,0.6)",
            "rgba(255,193,7,0.6)"
          ],
          borderColor: [
            "rgba(220,53,69,1)",
            "rgba(40,167,69,1)",
            "rgba(255,193,7,1)"
          ],
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "DCE WTP based cost benefit comparison",
          font: { size: 14 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax:
            Math.max(
              totalCost,
              totalWTPBenefit,
              Math.abs(netBenefitWTP)
            ) * 1.2
        }
      }
    }
  });

  return results;
}
