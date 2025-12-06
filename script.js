/****************************************************************************
 * SCRIPT.JS
 * Enhanced interactivity, new inputs, dynamic summaries, WTP-based benefits,
 * and refined cost-benefit analysisss.
 ****************************************************************************/

// Ensure DOM is loaded before attaching events
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tablink");
  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      openTab(button.getAttribute("data-tab"), button);
    });
  });
  // Initialize default tab (Introduction)
  openTab("introTab", document.querySelector(".tablink"));

  // Optional: Pre-render default charts or results if needed
});

/** Tab Switching Function */
function openTab(tabId, btn) {
  // Hide all tabs and remove active states
  document.querySelectorAll(".tabcontent").forEach(tab => tab.style.display = "none");
  document.querySelectorAll(".tablink").forEach(button => {
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
  });
  // Show selected tab and mark as active
  document.getElementById(tabId).style.display = "block";
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");

  // Auto-render charts when their tab is opened (if data available)
  if (tabId === 'wtpTab' && scenarioComputed) renderWTPChart();
  if (tabId === 'probTab' && scenarioComputed) renderProbChart();
  if (tabId === 'costsTab' && scenarioComputed) renderCostsBenefits();
}

/** Update displayed cost label for slider */
function updateCostDisplay(val) {
  document.getElementById("costLabel").textContent = val;
}

// Flag to indicate if a scenario has been computed (to auto-render charts on tab switch)
let scenarioComputed = false;

/***************************************************************************
 * Coefficients and Multipliers (from DCE and cost-of-living data)
 ***************************************************************************/
const mainCoefficients = {
  ASC_mean: -0.112,      // Alternate specific constant (for taking a program vs opt-out)
  ASC_optout: 0.131,     // Opt-out constant
  type_comm: 0.527,      // Community engagement
  type_psych: 0.156,     // Psychological counselling
  type_vr: -0.349,       // Virtual reality
  mode_virtual: -0.426,  // Virtual method
  mode_hybrid: -0.289,   // Hybrid method
  freq_weekly: 0.617,    // Weekly
  freq_monthly: 0.336,   // Monthly
  dur_2hrs: 0.185,       // 2-hour
  dur_4hrs: 0.213,       // 4-hour
  dist_local: 0.059,     // Local area (12 km)
  dist_signif: -0.509,   // Wider community (50+ km)
  cost_cont: -0.036      // Cost coefficient (per $1)
};
const costOfLivingMultipliers = { // relative multipliers for cost coefficient
  "NSW": 1.10,
  "VIC": 1.05,
  "QLD": 1.00,
  "WA": 1.08,
  "SA": 1.02,
  "TAS": 1.03,
  "ACT": 1.15,
  "NT": 1.07
};

/***************************************************************************
 * WTP Data (for reference in charts and calculations)
 ***************************************************************************/
const wtpDataMain = [
  { attribute: "Community engagement", wtp: 14.47, se: 3.31, pVal: "<0.001" },
  { attribute: "Psychological counselling", wtp: 4.28, se: 3.76, pVal: "0.245" },
  { attribute: "Virtual reality", wtp: -9.58, se: 3.72, pVal: "0.009" },
  { attribute: "Virtual (method)", wtp: -11.69, se: 5.02, pVal: "0.019" },
  { attribute: "Hybrid (method)", wtp: -7.95, se: 2.51, pVal: "0.001" },
  { attribute: "Weekly (freq)", wtp: 16.93, se: 2.73, pVal: "<0.001" },
  { attribute: "Monthly (freq)", wtp: 9.21, se: 3.26, pVal: "0.005" },
  { attribute: "2-hour interaction", wtp: 5.08, se: 2.69, pVal: "0.059" },
  { attribute: "4-hour interaction", wtp: 5.85, se: 2.79, pVal: "0.037" },
  { attribute: "Local area accessibility", wtp: 1.62, se: 4.41, pVal: "0.712" },
  { attribute: "Wider community accessibility", wtp: -13.99, se: 3.98, pVal: "<0.001" }
];

/***************************************************************************
 * Build scenario object from current inputs
 ***************************************************************************/
function buildScenarioFromInputs() {
  // Read simple inputs
  const state = document.getElementById("state_select").value;
  const adjustCosts = document.getElementById("adjustCosts").value;
  const oppCostSetting = document.getElementById("oppCostSelect").value;
  const cost_val = parseInt(document.getElementById("costSlider").value, 10);

  // Required attributes (radio groups)
  const supportInput = document.querySelector('input[name="support"]:checked');
  const frequencyInput = document.querySelector('input[name="frequency"]:checked');
  const durationInput = document.querySelector('input[name="duration"]:checked');
  const accessibilityInput = document.querySelector('input[name="accessibility"]:checked');
  // Optional method
  const methodInput = document.querySelector('input[name="method"]:checked');

  // Validate required fields
  if (!supportInput || !frequencyInput || !durationInput || !accessibilityInput) {
    alert("Please select a level for all required attributes: Support Programme, Frequency, Duration, and Accessibility.");
    return null;
  }

  // Determine boolean flags for each option
  const commCheck = (supportInput.value === "community");
  const psychCheck = (supportInput.value === "counselling");
  const vrCheck = (supportInput.value === "vr");

  const weeklyCheck = (frequencyInput.value === "weekly");
  const monthlyCheck = (frequencyInput.value === "monthly");

  const twoHCheck = (durationInput.value === "2hr");
  const fourHCheck = (durationInput.value === "4hr");

  const localCheck = (accessibilityInput.value === "local");
  const widerCheck = (accessibilityInput.value === "wider");

  let virtualCheck = false, hybridCheck = false;
  if (methodInput) {
    virtualCheck = (methodInput.value === "virtual");
    hybridCheck = (methodInput.value === "hybrid");
  }
  // (If neither virtual nor hybrid is selected, assume in-person implicitly)

  // Compute predicted uptake probability using the choice model
  const prob = computeProbability({
    cost_val, state, adjustCosts,
    commCheck, psychCheck, vrCheck,
    virtualCheck, hybridCheck,
    weeklyCheck, monthlyCheck,
    twoHCheck, fourHCheck,
    localCheck, widerCheck
  }, mainCoefficients);
  const uptakePercentage = prob * 100;

  // Compute number of participants (assuming base population of 250)
  const baseParticipants = 250;
  const numberOfParticipants = baseParticipants * prob;

  // QALY scenario values
  const QALY_VALUES = { low: 0.02, moderate: 0.05, high: 0.1 };
  const qalyScenario = document.getElementById("qalySelect") ? document.getElementById("qalySelect").value : "moderate";
  const qalyPerParticipant = QALY_VALUES[qalyScenario];

  // Compute total QALYs and monetized benefits (using $50,000 per QALY)
  const totalQALY = numberOfParticipants * qalyPerParticipant;
  const VALUE_PER_QALY = 50000;
  const monetizedBenefits = totalQALY * VALUE_PER_QALY;

  // Cost calculations
  // Fixed costs: Advertising + fixed portion of training (advertising: 2978.80, training total: 26863.00)
  const FIXED_TOTAL = 2978.80 + 26863.00;
  // Variable costs (scale with prob): printing, postage, project manager, facilitator training & oncost, facilitator session costs, materials, venue, participant time & travel
  const VARIABLE_TOTAL = (0.12 * 10000)   // printing
                       + (0.147 * 10000)  // postage (adjusted 0.15 to 0.147 for given total)
                       + (49.99 * 10)    // admin (project manager)
                       + (223.86 * 100)  // training cost
                       + (44.77 * 100)   // on-costs
                       + (100.00 * 100)  // facilitator salaries for sessions
                       + (50.00 * 100)   // materials
                       + (30.00 * 100)   // venue (15*2h assumed as 30 per session)
                       + (oppCostSetting === 'yes' ? (20.00 * 250 + 10.00 * 250) : 0);  // participant time + travel if included
  const totalCost = FIXED_TOTAL + VARIABLE_TOTAL * prob;

  // Net benefit (QALY-based)
  const netBenefit = monetizedBenefits - totalCost;

  return {
    // Input selections
    state,
    adjustCosts,
    oppCostSetting,
    cost_val,
    localCheck, widerCheck,
    weeklyCheck, monthlyCheck,
    virtualCheck, hybridCheck,
    twoHCheck, fourHCheck,
    commCheck, psychCheck, vrCheck,
    // Results
    predictedUptake: uptakePercentage.toFixed(2),
    numberOfParticipants: numberOfParticipants,
    totalCost: totalCost,
    monetizedBenefits: monetizedBenefits,
    netBenefit: netBenefit,
    // Additional info for saving
    name: "", // to be filled by scenarioName if provided
    notes: "" // to be filled by scenarioNotes if provided
  };
}

/***************************************************************************
 * Logit Model to Compute Programme Uptake Probability
 ***************************************************************************/
function computeProbability(selection, coefs) {
  // Apply cost-of-living multiplier if applicable
  let effectiveCost = selection.cost_val;
  if (selection.adjustCosts === 'yes' && selection.state && costOfLivingMultipliers[selection.state]) {
    effectiveCost *= costOfLivingMultipliers[selection.state];
  }
  // Translate booleans to 0/1 for model
  const x_type_comm = selection.commCheck ? 1 : 0;
  const x_type_psych = selection.psychCheck ? 1 : 0;
  const x_type_vr = selection.vrCheck ? 1 : 0;
  const x_mode_virtual = selection.virtualCheck ? 1 : 0;
  const x_mode_hybrid = selection.hybridCheck ? 1 : 0;
  const x_freq_weekly = selection.weeklyCheck ? 1 : 0;
  const x_freq_monthly = selection.monthlyCheck ? 1 : 0;
  const x_dur_2hrs = selection.twoHCheck ? 1 : 0;
  const x_dur_4hrs = selection.fourHCheck ? 1 : 0;
  const x_dist_local = selection.localCheck ? 1 : 0;
  const x_dist_signif = selection.widerCheck ? 1 : 0;

  // Utility of choosing the program (vs not participating)
  const U_alt = coefs.ASC_mean
    + coefs.type_comm * x_type_comm
    + coefs.type_psych * x_type_psych
    + coefs.type_vr * x_type_vr
    + coefs.mode_virtual * x_mode_virtual
    + coefs.mode_hybrid * x_mode_hybrid
    + coefs.freq_weekly * x_freq_weekly
    + coefs.freq_monthly * x_freq_monthly
    + coefs.dur_2hrs * x_dur_2hrs
    + coefs.dur_4hrs * x_dur_4hrs
    + coefs.dist_local * x_dist_local
    + coefs.dist_signif * x_dist_signif
    + coefs.cost_cont * effectiveCost;
  const U_optout = coefs.ASC_optout;
  // Logistic choice probability of choosing the program
  return Math.exp(U_alt) / (Math.exp(U_alt) + Math.exp(U_optout));
}

/***************************************************************************
 * Render WTP Chart (Bar chart with error bars)
 ***************************************************************************/
let wtpChartInstance = null;
function renderWTPChart() {
  const ctx = document.getElementById("wtpChartMain").getContext("2d");
  if (wtpChartInstance) wtpChartInstance.destroy();
  const labels = wtpDataMain.map(item => item.attribute);
  const values = wtpDataMain.map(item => item.wtp);
  const errors = wtpDataMain.map(item => item.se);
  wtpChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: "WTP (A$)",
        data: values,
        backgroundColor: values.map(v => v >= 0 ? 'rgba(52, 152, 219, 0.6)' : 'rgba(231, 76, 60, 0.6)'),
        borderColor: values.map(v => v >= 0 ? 'rgba(41, 128, 185, 1)' : 'rgba(192, 57, 43, 1)'),
        borderWidth: 1,
        // We will draw error bars manually
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          callbacks: {
            afterBody: ctx => {
              const idx = ctx[0].dataIndex;
              return `SE: ${errors[idx]}, p-value: ${wtpDataMain[idx].pVal}`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'errorbars',
      afterDraw: chart => {
        const { ctx, chartArea: { top, bottom } } = chart;
        const scaleY = chart.scales.y;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const value = values[i];
          const err = errors[i];
          if (typeof err === 'number') {
            const x = bar.x;
            const yValue = scaleY.getPixelForValue(value);
            const yTop = scaleY.getPixelForValue(value + err);
            const yBottom = scaleY.getPixelForValue(value - err);
            // Draw vertical error line
            ctx.save();
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, yTop);
            ctx.lineTo(x, yBottom);
            ctx.stroke();
            // Draw top cap
            ctx.beginPath();
            ctx.moveTo(x - 5, yTop);
            ctx.lineTo(x + 5, yTop);
            ctx.stroke();
            // Draw bottom cap
            ctx.beginPath();
            ctx.moveTo(x - 5, yBottom);
            ctx.lineTo(x + 5, yBottom);
            ctx.stroke();
            ctx.restore();
          }
        });
      }
    }]
  });
}

/***************************************************************************
 * Render Predicted Uptake Chart (Doughnut) and provide recommendation
 ***************************************************************************/
let uptakeChartInstance = null;
function renderProbChart() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  scenarioComputed = true;
  // Draw doughnut chart
  const ctx = document.getElementById("uptakeChart").getContext("2d");
  const uptakeVal = parseFloat(scenario.predictedUptake); // % value
  const nonUptakeVal = 100 - uptakeVal;
  const chartData = [uptakeVal, nonUptakeVal];
  const chartLabels = ["Uptake", "Non‑uptake"];
  if (uptakeChartInstance) uptakeChartInstance.destroy();
  uptakeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: ["#28a745", "#dc3545"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 12 } }
        },
        title: {
          display: true,
          text: `Predicted Uptake: ${uptakeVal.toFixed(1)}%`,
          font: { size: 16 }
        },
        tooltip: {
          callbacks: {
            label: context => `${context.label}: ${context.parsed.toFixed(1)}%`
          }
        }
      }
    }
  });
  // Generate recommendation text
  const recommendationText = generateRecommendation(scenario, uptakeVal);
  // Show recommendation in modal and on page (for accessibility)
  const modalResultsDiv = document.getElementById("modalResults");
  if (modalResultsDiv && modalResultsDiv.innerHTML) {
    // If modal is already open or content exists, update it accordingly
    modalResultsDiv.innerHTML = `<h4>Calculation Results</h4>
      <p><strong>Predicted Uptake:</strong> ${uptakeVal.toFixed(1)}%</p>
      <p>${recommendationText}</p>`;
  }
  // Also update the uptakeRecommendation div on the page
  const recContainer = document.getElementById("uptakeRecommendation");
  recContainer.innerHTML = `<p>${recommendationText}</p>`;
}

/** Generate recommendation text based on scenario and uptake. */
function generateRecommendation(sc, uptake) {
  let rec = "";
  const uptakeRounded = uptake.toFixed(1);
  // Overall judgement
  if (uptake >= 70) {
    rec += "Uptake is high. The current configuration is very appealing to the target group. ";
  } else if (uptake >= 50) {
    rec += "Uptake is moderate. The configuration attracts a fair share of participants, but there might be room for improvement. ";
  } else {
    rec += "Uptake is low. Many older adults may not enroll under this configuration. Consider adjustments to improve appeal. ";
  }
  // Check each attribute for suggestions
  if (!sc.virtualCheck && !sc.hybridCheck) {
    // In-person by default
    rec += "Delivery is in-person (default). ";
  }
  if (sc.virtualCheck && uptake < 50) {
    rec += "Fully virtual delivery likely lowers uptake; consider adding in-person elements or support for technology use. ";
  }
  if (sc.hybridCheck && uptake < 50) {
    rec += "Hybrid delivery could be improved by increasing in-person interaction if possible. ";
  }
  if (sc.commCheck && uptake < 40) {
    rec += "Community engagement is chosen but uptake is still low – ensure the community activity aligns with interests or consider additional outreach. ";
  }
  if (sc.psychCheck && uptake < 40) {
    rec += "Counselling alone may be less enticing; pairing it with group activities might improve uptake. ";
  }
  if (sc.vrCheck && uptake < 40) {
    rec += "VR-based sessions seem less preferred; perhaps provide trial sessions or combine with in-person meetups to boost interest. ";
  }
  if (sc.monthlyCheck && uptake < 50) {
    rec += "Monthly sessions are quite infrequent; increasing frequency (e.g., weekly) could improve engagement. ";
  }
  if (sc.twoHCheck && uptake < 50) {
    rec += "2-hour interactions might be a bit long for some – consider shorter, more frequent meetups. ";
  }
  if (sc.fourHCheck && uptake >= 70) {
    rec += "Notably, the long 4-hour sessions do not deter participation here, suggesting participants are keen on extended interactions. ";
  }
  if (sc.widerCheck && uptake < 50) {
    rec += "Offering the program only in a wider community (far away) likely dampens uptake – providing local options could boost participation. ";
  }
  if (uptake >= 70) {
    rec += "The program’s features strongly align with participant preferences, indicating a good chance of success.";
  }
  return "Recommendation: " + rec.trim();
}

/***************************************************************************
 * Render Costs & Benefits Analysis (Bar chart + Summary for QALY and WTP)
 ***************************************************************************/
let combinedChartInstance = null;
function renderCostsBenefits() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  scenarioComputed = true;
  const uptakePercentage = parseFloat(scenario.predictedUptake);
  const participants = scenario.numberOfParticipants;
  const totalCost = scenario.totalCost;
  const monetizedBenefits = scenario.monetizedBenefits;
  const netBenefit = scenario.netBenefit;
  // Compute benefit-cost ratio for QALY perspective
  const BCR = totalCost > 0 ? monetizedBenefits / totalCost : Infinity;

  // Compute WTP-based benefit outcomes
  let wtpPerPerson = 0;
  if (scenario.commCheck) wtpPerPerson += 14.47;
  if (scenario.psychCheck) wtpPerPerson += 4.28;
  if (scenario.vrCheck) wtpPerPerson += -9.58;
  if (scenario.virtualCheck) wtpPerPerson += -11.69;
  if (scenario.hybridCheck) wtpPerPerson += -7.95;
  if (scenario.weeklyCheck) wtpPerPerson += 16.93;
  if (scenario.monthlyCheck) wtpPerPerson += 9.21;
  if (scenario.twoHCheck) wtpPerPerson += 5.08;
  if (scenario.fourHCheck) wtpPerPerson += 5.85;
  if (scenario.localCheck) wtpPerPerson += 1.62;
  if (scenario.widerCheck) wtpPerPerson += -13.99;
  const totalWTPBenefit = wtpPerPerson * participants;
  const netBenefitWTP = totalWTPBenefit - totalCost;
  const BCR_WTP = totalCost > 0 ? totalWTPBenefit / totalCost : Infinity;

  // Construct summary HTML
  const resultsDiv = document.getElementById("costsBenefitsResults");
  resultsDiv.innerHTML = ""; // clear previous
  // Summary (QALY-based)
  const summaryHtml = `
    <div class="calculation-info">
      <p><strong>Uptake:</strong> ${uptakePercentage.toFixed(2)}% (${participants.toFixed(0)} participants)</p>
      <p><strong>Total Intervention Cost:</strong> A$${totalCost.toFixed(2)}</p>
      <p><strong>Cost per Participant:</strong> A$${(totalCost / (participants || 1)).toFixed(2)}</p>
      <p><strong>Total QALYs Gained:</strong> ${ (scenario.monetizedBenefits / 50000).toFixed(2) }</p>
      <p><strong>Monetised Benefits (QALY-based):</strong> A$${monetizedBenefits.toFixed(2)}</p>
      <p><strong>Net Benefit (QALY-based):</strong> A$${netBenefit.toFixed(2)} ${ BCR >= 1 ? "(positive)" : "(negative)"}</p>
      <p><em>Benefit-Cost Ratio (QALY): ${ BCR === Infinity ? "N/A" : BCR.toFixed(2) }</em></p>
    </div>`;
  resultsDiv.insertAdjacentHTML('beforeend', summaryHtml);
  // Bar chart for cost vs benefits (QALY)
  const chartContainer = document.createElement("div");
  chartContainer.className = "chart-box";
  chartContainer.innerHTML = `<h3>Cost-Benefit Summary (A$)</h3><canvas id="combinedChart"></canvas>`;
  resultsDiv.appendChild(chartContainer);
  const ctx = document.getElementById("combinedChart").getContext("2d");
  if (combinedChartInstance) combinedChartInstance.destroy();
  combinedChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ["Total Cost", "Monetised Benefits", "Net Benefit"],
      datasets: [{
        label: "Amount (A$)",
        data: [totalCost, monetizedBenefits, netBenefit],
        backgroundColor: [
          'rgba(231, 76, 60, 0.6)',
          'rgba(46, 204, 113, 0.6)',
          'rgba(52, 152, 219, 0.6)'
        ],
        borderColor: [
          'rgba(192, 57, 43, 1)',
          'rgba(39, 174, 96, 1)',
          'rgba(41, 128, 185, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        title: { display: false }
      }
    }
  });
  // WTP-based analysis summary
  const wtpAnalysisHtml = `
    <div class="calculation-info">
      <h4>WTP-based Benefit Analysis</h4>
      <p><strong>Avg WTP per Participant:</strong> A$${wtpPerPerson.toFixed(2)}</p>
      <p><strong>Total WTP Benefit (all participants):</strong> A$${totalWTPBenefit.toFixed(2)}</p>
      <p><strong>Net Benefit (WTP-based):</strong> A$${netBenefitWTP.toFixed(2)} ${ BCR_WTP >= 1 ? "(positive)" : "(negative)"}</p>
      <p><em>Benefit-Cost Ratio (WTP): ${ BCR_WTP === Infinity ? "N/A" : BCR_WTP.toFixed(2) }</em></p>
      <p>This perspective values the program by participants’ willingness-to-pay. A positive net benefit here means participants collectively value the program more than it costs to run.</p>
    </div>`;
  resultsDiv.insertAdjacentHTML('beforeend', wtpAnalysisHtml);
}

/***************************************************************************
 * Toggle visibility of detailed cost breakdown and benefits analysis sections
 ***************************************************************************/
function toggleCostBreakdown() {
  const breakdownEl = document.getElementById("detailedCostBreakdown");
  if (!breakdownEl) return;
  breakdownEl.style.display = (breakdownEl.style.display === "none" || breakdownEl.style.display === "") ? "flex" : "none";
}
function toggleBenefitsAnalysis() {
  const benefitsEl = document.getElementById("detailedBenefitsAnalysis");
  if (!benefitsEl) return;
  benefitsEl.style.display = (benefitsEl.style.display === "none" || benefitsEl.style.display === "") ? "flex" : "none";
}

/***************************************************************************
 * Scenario Saving and PDF Export
 ***************************************************************************/
let savedScenarios = [];
function saveScenario() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  // Assign scenario name and notes from inputs (or default if empty)
  const nameInput = document.getElementById("scenarioName").value.trim();
  scenario.name = nameInput || `Scenario ${savedScenarios.length + 1}`;
  scenario.notes = document.getElementById("scenarioNotes").value.trim();
  // Add scenario to list
  savedScenarios.push(scenario);
  // Add a row to the scenarios table
  const tbody = document.querySelector("#scenarioTable tbody");
  const row = document.createElement("tr");
  const fields = ["name", "state", "adjustCosts", "oppCostSetting", "cost_val",
                  "localCheck", "widerCheck", "weeklyCheck", "monthlyCheck",
                  "virtualCheck", "hybridCheck", "twoHCheck", "fourHCheck",
                  "commCheck", "psychCheck", "vrCheck", "predictedUptake", "netBenefit"];
  fields.forEach(field => {
    const cell = document.createElement("td");
    let value = scenario[field];
    if (field === "cost_val") {
      cell.textContent = `A$${value.toFixed(2)}`;
    } else if (typeof value === "boolean") {
      cell.textContent = value ? "Yes" : "No";
    } else if (field === "predictedUptake") {
      cell.textContent = `${parseFloat(value).toFixed(1)}%`;
    } else if (field === "netBenefit") {
      cell.textContent = `A$${parseFloat(value).toFixed(2)}`;
    } else {
      cell.textContent = value || "N/A";
    }
    row.appendChild(cell);
  });
  tbody.appendChild(row);
  // Show toast notification
  const toast = document.getElementById("toast");
  toast.textContent = `Scenario "${scenario.name}" saved.`;
  toast.className = "toast show";
  setTimeout(() => { toast.className = "toast"; }, 3000);
}

function openComparison() {
  if (savedScenarios.length < 1) {
    alert("No scenarios saved to export. Please save at least one scenario.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = 50;
  doc.setFont("Helvetica");
  doc.setFontSize(14);
  doc.text("LonelyLessAustralia – Scenarios Comparison", margin, y);
  y += 20;
  doc.setFontSize(11);
  savedScenarios.forEach((sc, index) => {
    if (y > 760) { // roughly end of page, add new
      doc.addPage();
      y = 50;
    }
    doc.text(`${index + 1}. Scenario Name: ${sc.name}`, margin, y);
    y += 14;
    if (sc.notes) {
      doc.text(`Notes: ${sc.notes}`, margin + 20, y);
      y += 12;
    }
    doc.text(`State: ${sc.state || 'None'}; Cost-of-Living Adjust: ${sc.adjustCosts === 'yes' ? 'Yes' : 'No'}; Opp. Cost Included: ${sc.oppCostSetting === 'yes' ? 'Yes' : 'No'}`, margin + 20, y);
    y += 12;
    doc.text(`Cost per Session: A$${sc.cost_val.toFixed(2)}`, margin + 20, y);
    y += 12;
    doc.text(`Local Area: ${sc.localCheck ? 'Yes' : 'No'}; Wider Community: ${sc.widerCheck ? 'Yes' : 'No'}`, margin + 20, y);
    y += 12;
    doc.text(`Weekly: ${sc.weeklyCheck ? 'Yes' : 'No'}; Monthly: ${sc.monthlyCheck ? 'Yes' : 'No'}`, margin + 20, y);
    y += 12;
    doc.text(`In-person (default): ${(!sc.virtualCheck && !sc.hybridCheck) ? 'Yes' : 'No'}; Virtual: ${sc.virtualCheck ? 'Yes' : 'No'}; Hybrid: ${sc.hybridCheck ? 'Yes' : 'No'}`, margin + 20, y);
    y += 12;
    doc.text(`2-hour: ${sc.twoHCheck ? 'Yes' : 'No'}; 4-hour: ${sc.fourHCheck ? 'Yes' : 'No'}`, margin + 20, y);
    y += 12;
    doc.text(`Community: ${sc.commCheck ? 'Yes' : 'No'}; Counselling: ${sc.psychCheck ? 'Yes' : 'No'}; VR: ${sc.vrCheck ? 'Yes' : 'No'}`, margin + 20, y);
    y += 12;
    doc.text(`Predicted Uptake: ${parseFloat(sc.predictedUptake).toFixed(1)}%`, margin + 20, y);
    y += 12;
    const nbText = parseFloat(sc.netBenefit) ? `A$${parseFloat(sc.netBenefit).toFixed(2)}` : sc.netBenefit;
    doc.text(`Net Benefit (QALY-based): ${nbText}`, margin + 20, y);
    y += 20;
  });
  doc.save("LonelyLessAustralia_Scenarios.pdf");
}

/***************************************************************************
 * Modal Popup Controls
 ***************************************************************************/
function openSummary() {
  const scenario = buildScenarioFromInputs();
  if (!scenario) return;
  scenarioComputed = true;
  // Render all results to ensure charts and numbers are up to date
  renderCostsBenefits();
  renderProbChart();
  // Prepare summary content
  const uptakeVal = parseFloat(scenario.predictedUptake);
  const recommendation = generateRecommendation(scenario, uptakeVal);
  const netBenefitNum = parseFloat(scenario.netBenefit);
  const bcr = scenario.totalCost > 0 ? scenario.monetizedBenefits / scenario.totalCost : null;
  // Create a briefing text
  const bcrStr = (bcr === null) ? "N/A" : bcr.toFixed(2);
  const briefText = `Estimated uptake is ~${uptakeVal.toFixed(1)}% and the benefit-cost ratio is ${bcrStr}. ` +
    (bcr !== null && bcr >= 1 ? "Benefits exceed costs, indicating a positive net return. " : "Costs exceed monetized benefits in this scenario. ") +
    `Approximately ${scenario.numberOfParticipants.toFixed(0)} participants would enroll (out of 250 targeted). ` +
    `Total costs are roughly A$${scenario.totalCost.toFixed(0)}, with expected benefits valued at A$${scenario.monetizedBenefits.toFixed(0)}.`;
  const modalResultsDiv = document.getElementById("modalResults");
  modalResultsDiv.innerHTML = `
    <h4>Calculation Results</h4>
    <p><strong>Predicted Uptake:</strong> ${uptakeVal.toFixed(1)}%</p>
    <p>${recommendation}</p>
    <p><strong>Briefing Text:</strong> <em>${briefText}</em></p>
  `;
  openModal();
}
function openModal() {
  document.getElementById("resultModal").style.display = "block";
}
function closeModal() {
  document.getElementById("resultModal").style.display = "none";
}
