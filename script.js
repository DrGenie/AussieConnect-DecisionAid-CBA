/****************************************************************************
 * SCRIPT.JS
 * Enhanced tabs with working icons and tooltips, improved Inputs layout,
 * interactive Cost-Benefits section with toggle buttons and a combined bar chart,
 * detailed educational summaries, and export to PDF functionality.
 ****************************************************************************/

/** On page load, set default tab */
window.onload = function() {
  openTab('introTab', document.querySelector('.tablink'));
};

/** Tab Switching Function */
function openTab(tabId, btn) {
  const tabs = document.getElementsByClassName("tabcontent");
  for (let tab of tabs) {
    tab.style.display = "none";
  }
  const tabButtons = document.getElementsByClassName("tablink");
  for (let button of tabButtons) {
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
  }
  document.getElementById(tabId).style.display = "block";
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");

  if (tabId === 'wtpTab') renderWTPChart();
  if (tabId === 'costsTab') renderCostsBenefits();
}

/** Update Range Slider Display */
function updateCostDisplay(val) {
  document.getElementById("costLabel").textContent = val;
}

/***************************************************************************
 * Main DCE Coefficients & Cost Multipliers
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
  NSW: 1.10,
  VIC: 1.05,
  QLD: 1.00,
  WA: 1.08,
  SA: 1.02,
  TAS: 1.03,
  ACT: 1.15,
  NT: 1.07
};

/***************************************************************************
 * WTP Data
 ***************************************************************************/
const wtpDataMain = [
  { attribute: "Community engagement", wtp: 14.47, pVal: 0.000, se: 3.31 },
  { attribute: "Psychological counselling", wtp: 4.28, pVal: 0.245, se: 3.76 },
  { attribute: "Virtual reality", wtp: -9.58, pVal: 0.009, se: 3.72 },
  { attribute: "Virtual (method)", wtp: -11.69, pVal: 0.019, se: 5.02 },
  { attribute: "Hybrid (method)", wtp: -7.95, pVal: 0.001, se: 2.51 },
  { attribute: "Weekly (freq)", wtp: 16.93, pVal: 0.000, se: 2.73 },
  { attribute: "Monthly (freq)", wtp: 9.21, pVal: 0.005, se: 3.26 },
  { attribute: "2-hour interaction", wtp: 5.08, pVal: 0.059, se: 2.69 },
  { attribute: "4-hour interaction", wtp: 5.85, pVal: 0.037, se: 2.79 },
  { attribute: "Local area accessibility", wtp: 1.62, pVal: 0.712, se: 4.41 },
  { attribute: "Wider community accessibility", wtp: -13.99, pVal: 0.000, se: 3.98 }
];

/***************************************************************************
 * Build Scenario From Inputs & Validations
 ***************************************************************************/
function buildScenarioFromInputs() {
  const state = document.getElementById("state_select").value;
  const adjustCosts = document.getElementById("adjustCosts").value;
  const cost_val = parseInt(document.getElementById("costSlider").value, 10);
  const localCheck = document.getElementById("localCheck").checked;
  const widerCheck = document.getElementById("widerCheck").checked;
  const weeklyCheck = document.getElementById("weeklyCheck").checked;
  const monthlyCheck = document.getElementById("monthlyCheck").checked;
  const virtualCheck = document.getElementById("virtualCheck").checked;
  const hybridCheck = document.getElementById("hybridCheck").checked;
  const twoHCheck = document.getElementById("twoHCheck").checked;
  const fourHCheck = document.getElementById("fourHCheck").checked;
  const commCheck = document.getElementById("commCheck").checked;
  const psychCheck = document.getElementById("psychCheck").checked;
  const vrCheck = document.getElementById("vrCheck").checked;

  if ([commCheck, psychCheck, vrCheck].filter(Boolean).length > 1) {
    alert("Select only one Support Programme: Community, Counselling, or VR.");
    return null;
  }
  if ([virtualCheck, hybridCheck].filter(Boolean).length > 1) {
    alert("Select only one Method: Virtual or Hybrid.");
    return null;
  }
  if (localCheck && widerCheck) {
    alert("Cannot select both Local and Wider Community.");
    return null;
  }
  if (weeklyCheck && monthlyCheck) {
    alert("Cannot select both Weekly and Monthly.");
    return null;
  }
  if (twoHCheck && fourHCheck) {
    alert("Cannot select both 2-Hour and 4-Hour sessions.");
    return null;
  }
  if (adjustCosts === 'yes' && !state) {
    alert("Select a state when adjusting cost-of-living.");
    return null;
  }
  return { state, adjustCosts, cost_val, localCheck, widerCheck, weeklyCheck, monthlyCheck, virtualCheck, hybridCheck, twoHCheck, fourHCheck, commCheck, psychCheck, vrCheck };
}

/***************************************************************************
 * Compute Programme Uptake Probability
 ***************************************************************************/
function computeProbability(sc, coefs) {
  let finalCost = sc.cost_val;
  if (sc.adjustCosts === 'yes' && sc.state && costOfLivingMultipliers[sc.state]) {
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
  const U_alt = coefs.ASC_mean
    + coefs.type_comm * type_comm
    + coefs.type_psych * type_psych
    + coefs.type_vr * type_vr
    + coefs.mode_virtual * mode_virtual
    + coefs.mode_hybrid * mode_hybrid
    + coefs.freq_weekly * freq_weekly
    + coefs.freq_monthly * freq_monthly
    + coefs.dur_2hrs * dur_2hrs
    + coefs.dur_4hrs * dur_4hrs
    + coefs.dist_local * dist_local
    + coefs.dist_signif * dist_signif
    + coefs.cost_cont * finalCost;
  const U_optout = coefs.ASC_optout;
  return Math.exp(U_alt) / (Math.exp(U_alt) + Math.exp(U_optout));
}

/***************************************************************************
 * Render WTP Chart with Error Bars
 ***************************************************************************/
let wtpChartInstance = null;
function renderWTPChart() {
  const ctx = document.getElementById("wtpChartMain").getContext("2d");
  if (wtpChartInstance) wtpChartInstance.destroy();
  const labels = wtpDataMain.map(item => item.attribute);
  const values = wtpDataMain.map(item => item.wtp);
  const errors = wtpDataMain.map(item => item.se);
  const dataConfig = {
    labels,
    datasets: [{
      label: "WTP (A$)",
      data: values,
      backgroundColor: values.map(v => v >= 0 ? 'rgba(0,123,255,0.6)' : 'rgba(220,53,69,0.6)'),
      borderColor: values.map(v => v >= 0 ? 'rgba(0,123,255,1)' : 'rgba(220,53,69,1)'),
      borderWidth: 1,
      error: errors
    }]
  };
  wtpChartInstance = new Chart(ctx, {
    type: 'bar',
    data: dataConfig,
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: "WTP (A$) for Attributes", font: { size: 16 } },
        tooltip: {
          callbacks: {
            afterBody: function(context) {
              const idx = context[0].dataIndex;
              return `SE: ${dataConfig.datasets[0].error[idx]}, p-value: ${wtpDataMain[idx].pVal}`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'errorbars',
      afterDraw: chart => {
        const { ctx, scales: { y } } = chart;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const centerX = bar.x;
          const value = values[i];
          const se = errors[i];
          if (typeof se === 'number') {
            const topY = y.getPixelForValue(value + se);
            const bottomY = y.getPixelForValue(value - se);
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = '#000';
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
    }]
  });
}

/***************************************************************************
 * Toggle Detailed Cost Breakdown and Benefits Analysis
 ***************************************************************************/
function toggleCostBreakdown() {
  const breakdown = document.getElementById("detailedCostBreakdown");
  breakdown.style.display = (breakdown.style.display === "none" || breakdown.style.display === "") ? "flex" : "none";
}
function toggleBenefitsAnalysis() {
  const benefits = document.getElementById("detailedBenefitsAnalysis");
  benefits.style.display = (benefits.style.display === "none" || benefits.style.display === "") ? "flex" : "none";
}

/***************************************************************************
 * Scenario Saving & PDF Export
 ***************************************************************************/
let savedScenarios = [];
function saveScenario() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  scenario.name = `Scenario ${savedScenarios.length + 1}`;
  savedScenarios.push(scenario);
  const tableBody = document.querySelector("#scenarioTable tbody");
  const row = document.createElement("tr");
  const props = ["name", "state", "adjustCosts", "cost_val", "localCheck", "widerCheck", "weeklyCheck", "monthlyCheck", "virtualCheck", "hybridCheck", "twoHCheck", "fourHCheck", "commCheck", "psychCheck", "vrCheck"];
  props.forEach(prop => {
    const cell = document.createElement("td");
    if (prop === "cost_val") {
      cell.textContent = `A$${scenario[prop].toFixed(2)}`;
    } else if (typeof scenario[prop] === 'boolean') {
      cell.textContent = scenario[prop] ? 'Yes' : 'No';
    } else {
      cell.textContent = scenario[prop] || 'N/A';
    }
    row.appendChild(cell);
  });
  tableBody.appendChild(row);
  alert(`Scenario "${scenario.name}" saved successfully.`);
}

function openComparison() {
  if (savedScenarios.length < 2) {
    alert("Save at least two scenarios to compare.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;
  doc.setFontSize(16);
  doc.text("LonelyLessAustralia - Scenarios Comparison", pageWidth / 2, currentY, { align: 'center' });
  currentY += 10;
  savedScenarios.forEach((scenario, index) => {
    if (currentY > 260) {
      doc.addPage();
      currentY = 15;
    }
    doc.setFontSize(14);
    doc.text(`Scenario ${index + 1}: ${scenario.name}`, 15, currentY);
    currentY += 7;
    doc.setFontSize(12);
    doc.text(`State: ${scenario.state || 'None'}`, 15, currentY);
    currentY += 5;
    doc.text(`Cost Adjust: ${scenario.adjustCosts === 'yes' ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Cost per Session: A$${scenario.cost_val.toFixed(2)}`, 15, currentY);
    currentY += 5;
    doc.text(`Local: ${scenario.localCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Wider: ${scenario.widerCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Weekly: ${scenario.weeklyCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Monthly: ${scenario.monthlyCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Virtual: ${scenario.virtualCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Hybrid: ${scenario.hybridCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`2-Hour: ${scenario.twoHCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`4-Hour: ${scenario.fourHCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Community: ${scenario.commCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`Counselling: ${scenario.psychCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 5;
    doc.text(`VR: ${scenario.vrCheck ? 'Yes' : 'No'}`, 15, currentY);
    currentY += 10;
  });
  doc.save("Scenarios_Comparison.pdf");
}

/***************************************************************************
 * Combined Costs & Benefits Rendering (Bar Chart)
 ***************************************************************************/
let combinedChartInstance = null;
const QALY_SCENARIOS_VALUES = { low: 0.02, moderate: 0.05, high: 0.1 };
const VALUE_PER_QALY = 50000;
const FIXED_COSTS = { advertisement: 2978.80, training: 26863.00 }; // advertisement value as provided (A$2978.80 for 2 units)
const VARIABLE_COSTS = { 
  printing: 0.12, 
  postage: 0.15, 
  admin: 49.99, 
  trainer: 223.86, 
  oncosts: 44.77, 
  facilitator: 100.00, 
  materials: 50.00, 
  venue: 15.00, 
  sessionTime: 20.00, 
  travel: 10.00 
};
const FIXED_TOTAL = 2978.80 + 26863.00;
const VARIABLE_TOTAL = (0.12 * 10000) + (0.15 * 10000) + (49.99 * 10) + (223.86 * 100) + (44.77 * 100) + (100.00 * 100) + (50.00 * 100) + (15.00 * 100) + (20.00 * 250) + (10.00 * 250);

function renderCostsBenefits() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const pVal = computeProbability(scenario, mainCoefficients);
  const uptakePercentage = pVal * 100;
  const baseParticipants = 250;
  const numberOfParticipants = baseParticipants * pVal;
  const qalyScenario = document.getElementById("qalySelect").value;
  const qalyPerParticipant = QALY_SCENARIOS_VALUES[qalyScenario];
  const totalQALY = numberOfParticipants * qalyPerParticipant;
  const monetizedBenefits = totalQALY * VALUE_PER_QALY;
  const totalInterventionCost = FIXED_TOTAL + (VARIABLE_TOTAL * pVal);
  const costPerPerson = totalInterventionCost / numberOfParticipants;
  const netBenefit = monetizedBenefits - totalInterventionCost;
  
  const costsTab = document.getElementById("costsBenefitsResults");
  costsTab.innerHTML = "";
  
  // Render summary information with educational explanation
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "calculation-info";
  summaryDiv.innerHTML = `
    <h4>Cost &amp; Benefits Analysis</h4>
    <p><strong>Uptake:</strong> ${uptakePercentage.toFixed(2)}%</p>
    <p><strong>Participants:</strong> ${numberOfParticipants.toFixed(0)}</p>
    <p><strong>Total Intervention Cost:</strong> A$${totalInterventionCost.toFixed(2)}</p>
    <p><strong>Cost per Participant:</strong> A$${costPerPerson.toFixed(2)}</p>
    <p><strong>Total QALYs:</strong> ${totalQALY.toFixed(2)}</p>
    <p><strong>Monetised Benefits:</strong> A$${monetizedBenefits.toLocaleString()}</p>
    <p><strong>Net Benefit:</strong> A$${netBenefit.toLocaleString()}</p>
    <p>This analysis combines fixed costs (advertisements in local press and training) and variable costs (printing, postage, administrative personnel, trainer cost, on-costs, facilitator salaries, material costs, venue hire, session time and travel). Benefits are calculated based on QALY gains multiplied by a conversion factor of A$50,000.</p>
  `;
  costsTab.appendChild(summaryDiv);
  
  // Render combined cost-benefit bar chart
  const combinedChartContainer = document.createElement("div");
  combinedChartContainer.id = "combinedChartContainer";
  combinedChartContainer.innerHTML = `<canvas id="combinedChart"></canvas>`;
  costsTab.appendChild(combinedChartContainer);
  
  const ctxCombined = document.getElementById("combinedChart").getContext("2d");
  if (combinedChartInstance) combinedChartInstance.destroy();
  combinedChartInstance = new Chart(ctxCombined, {
    type: 'bar',
    data: {
      labels: ["Total Cost", "Monetised Benefits", "Net Benefit"],
      datasets: [{
        label: "A$",
        data: [totalInterventionCost, monetizedBenefits, netBenefit],
        backgroundColor: [
          'rgba(220,53,69,0.6)',
          'rgba(40,167,69,0.6)',
          'rgba(255,193,7,0.6)'
        ],
        borderColor: [
          'rgba(220,53,69,1)',
          'rgba(40,167,69,1)',
          'rgba(255,193,7,1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Combined Cost-Benefit Analysis", font: { size: 16 } }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(totalInterventionCost, monetizedBenefits, Math.abs(netBenefit)) * 1.2
        }
      }
    }
  });
}

/***************************************************************************
 * Integration: Calculate & View Results
 ***************************************************************************/
function openSingleScenario() {
  renderProbChart();
  renderCostsBenefits();
}

/***************************************************************************
 * Predicted Programme Uptake Chart
 ***************************************************************************/
let probChartInstance = null;
function renderProbChart() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  const pVal = computeProbability(scenario, mainCoefficients) * 100;
  const ctx = document.getElementById("probChartMain").getContext("2d");
  if (probChartInstance) probChartInstance.destroy();
  probChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ["Uptake Probability"],
      datasets: [{
        label: 'Uptake (%)',
        data: [pVal],
        backgroundColor: pVal < 30 ? 'rgba(220,53,69,0.6)' : pVal < 70 ? 'rgba(255,193,7,0.6)' : 'rgba(40,167,69,0.6)',
        borderColor: pVal < 30 ? 'rgba(220,53,69,1)' : pVal < 70 ? 'rgba(255,193,7,1)' : 'rgba(40,167,69,1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: { x: { beginAtZero: true, max: 100 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: `Uptake Probability: ${pVal.toFixed(2)}%`, font: { size: 16 } }
      }
    }
  });
  let interpretation = pVal < 30 ? "Low uptake. Adjust programme cost or enhance local accessibility." :
                       pVal < 70 ? "Moderate uptake. Consider increasing session frequency or optimising cost." :
                       "High uptake. The current configuration is effective.";
  alert(`Predicted uptake: ${pVal.toFixed(2)}%. ${interpretation}`);
}
