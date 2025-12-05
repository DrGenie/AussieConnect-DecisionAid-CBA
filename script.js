/* ===================================================
   LonelyLessAustralia Decision Aid – script.js
   Premium loneliness version aligned with index.html
   - Uses loneliness attributes and levels
   - Integrates cost-of-living multipliers
   - Benefits are DCE-based only (no extra outcome monetisation)
   - WTP is per participant per session
   =================================================== */

(() => {
  "use strict";

  /* ===========================
     Global state
     =========================== */

  const state = {
    lastResults: null,
    charts: {
      uptakeSensitivity: null
    },
    sensitivity: {
      costPct: 0,
      uptakePct: 0
    }
  };

  /***************************************************************************
   * Main DCE Coefficients & Cost-of-living Multipliers
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
   * WTP Data (AUD per participant per session)
   * DCE-based WTP estimates for loneliness attributes
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

  const OPP_COST_RATE = 0.2; // 20% opportunity cost on top of direct costs

  /* ===========================
     Attribute configuration for dynamic controls
     =========================== */

  const attributeControlsConfig = [
    {
      id: "programmeType",
      label: "Type of support programme",
      help: "Main focus of the loneliness support programme.",
      default: "comm",
      options: [
        { value: "peer", label: "Peer support (baseline option)" },
        { value: "comm", label: "Community engagement activities" },
        { value: "psych", label: "Psychological counselling" },
        { value: "vr", label: "Virtual reality-based support" }
      ]
    },
    {
      id: "method",
      label: "Method of participation",
      help: "How older adults participate in the programme.",
      default: "inperson",
      options: [
        { value: "inperson", label: "In-person only" },
        { value: "virtual", label: "Virtual only" },
        { value: "hybrid", label: "Hybrid (virtual and in-person)" }
      ]
    },
    {
      id: "frequency",
      label: "Frequency of interaction",
      help: "How often each participant attends the programme.",
      default: "weekly",
      options: [
        { value: "weekly", label: "Weekly interactions" },
        { value: "monthly", label: "Monthly interactions" },
        { value: "daily", label: "Daily (approx. weekly in model)" }
      ]
    },
    {
      id: "duration",
      label: "Duration of each session",
      help: "Length of each programme session.",
      default: "2hrs",
      options: [
        { value: "30min", label: "Short (around 30 minutes)" },
        { value: "2hrs", label: "2-hour sessions" },
        { value: "4hrs", label: "4-hour sessions" }
      ]
    },
    {
      id: "accessibility",
      label: "Accessibility / travel distance",
      help: "Distance older adults need to travel to attend.",
      default: "local",
      options: [
        { value: "home", label: "At-home access" },
        { value: "local", label: "Local area (up to 12 km travel)" },
        { value: "wider", label: "Wider community (50+ km travel)" }
      ]
    }
  ];

  /* ===========================
     Helpers
     =========================== */

  function $(id) {
    return document.getElementById(id);
  }

  function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return "–";
    return value.toLocaleString("en-AU", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  }

  function formatPercent(value, decimals = 1) {
    if (value === null || value === undefined || !isFinite(value)) return "–";
    const pct = value * 100;
    return `${pct.toFixed(decimals)}`;
  }

  function formatCurrency(valueInAud, decimals = 0) {
    if (valueInAud === null || valueInAud === undefined || isNaN(valueInAud))
      return "–";
    return valueInAud.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  }

  function formatCurrencyMillions(valueInAud, decimals = 2) {
    if (valueInAud === null || valueInAud === undefined || isNaN(valueInAud))
      return "–";
    const millions = valueInAud / 1_000_000;
    return millions.toLocaleString("en-AU", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  }

  function setText(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
  }

  function wtpFor(attributeName) {
    const row = wtpDataMain.find(d => d.attribute === attributeName);
    return row ? row.wtp : 0;
  }

  function logistic(x) {
    if (x > 35) return 1;
    if (x < -35) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  /* ===========================
     Pretty labels
     =========================== */

  function prettyProgrammeType(v) {
    if (v === "comm") return "Community engagement";
    if (v === "psych") return "Psychological counselling";
    if (v === "vr") return "Virtual reality";
    return "Peer support";
  }

  function prettyMethod(v) {
    if (v === "virtual") return "Virtual participation";
    if (v === "hybrid") return "Hybrid participation";
    return "In-person participation";
  }

  function prettyFrequency(v) {
    if (v === "daily") return "Daily interactions";
    if (v === "monthly") return "Monthly interactions";
    return "Weekly interactions";
  }

  function prettyDuration(v) {
    if (v === "30min") return "Short sessions (30 minutes)";
    if (v === "4hrs") return "4-hour sessions";
    return "2-hour sessions";
  }

  function prettyAccessibility(v) {
    if (v === "wider") return "Wider community travel (50+ km)";
    if (v === "local") return "Local area (up to 12 km travel)";
    return "At-home access";
  }

  /* ===========================
     Dynamic attribute controls
     =========================== */

  function renderAttributeControls() {
    const container = $("attribute-controls");
    if (!container) return;
    container.innerHTML = "";

    attributeControlsConfig.forEach(attr => {
      const group = document.createElement("div");
      group.className = "form-group";

      const label = document.createElement("label");
      label.className = "form-label";
      label.htmlFor = `attr-${attr.id}`;
      label.textContent = attr.label;

      const select = document.createElement("select");
      select.id = `attr-${attr.id}`;
      select.className = "form-control";

      attr.options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === attr.default) option.selected = true;
        select.appendChild(option);
      });

      group.appendChild(label);
      group.appendChild(select);
      container.appendChild(group);
    });
  }

  /* ===========================
     Cost-of-living UI
     =========================== */

  function populateCostOfLivingControls() {
    const select = $("select-col-region");
    const tbody = $("table-col-multipliers").querySelector("tbody");
    if (!select || !tbody) return;

    select.innerHTML = "";
    tbody.innerHTML = "";

    Object.entries(costOfLivingMultipliers).forEach(([key, mult]) => {
      // Dropdown option
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      select.appendChild(opt);

      // Table row
      const tr = document.createElement("tr");
      const notes =
        key === "ACT"
          ? "Highest cost of living (benchmark for national agencies)."
          : "Illustrative multiplier for this setting.";
      tr.innerHTML = `
        <td>${key}</td>
        <td>${mult.toFixed(2)}</td>
        <td>${notes}</td>
      `;
      tbody.appendChild(tr);
    });

    // Default selection
    select.value = "NSW";
  }

  /* ===========================
     Read configuration from inputs
     =========================== */

  function readScenarioFromInputs() {
    const programmeType =
      $("attr-programmeType")?.value || attributeControlsConfig[0].default;
    const method =
      $("attr-method")?.value || attributeControlsConfig[1].default;
    const frequency =
      $("attr-frequency")?.value || attributeControlsConfig[2].default;
    const duration =
      $("attr-duration")?.value || attributeControlsConfig[3].default;
    const accessibility =
      $("attr-accessibility")?.value || attributeControlsConfig[4].default;

    const baseCostPerSession =
      parseFloat($("input-cost-per-session")?.value) || 0;
    const numSessions =
      parseInt($("input-number-of-sessions")?.value, 10) || 0;
    const cohortSize =
      parseInt($("input-target-cohort")?.value, 10) || 0;

    const region = $("select-col-region")?.value || "NSW";
    const multiplier = costOfLivingMultipliers[region] || 1.0;
    const adjustedCostPerSession = baseCostPerSession * multiplier;

    return {
      programmeType,
      method,
      frequency,
      duration,
      accessibility,
      region,
      multiplier,
      baseCostPerSession,
      adjustedCostPerSession,
      numSessions,
      cohortSize
    };
  }

  /* ===========================
     DCE utility and endorsement
     =========================== */

  function computeAttributeUtility(cfg) {
    let u = 0;

    // Programme type (peer support baseline)
    if (cfg.programmeType === "comm") {
      u += mainCoefficients.type_comm;
    } else if (cfg.programmeType === "psych") {
      u += mainCoefficients.type_psych;
    } else if (cfg.programmeType === "vr") {
      u += mainCoefficients.type_vr;
    }

    // Method of participation (in-person baseline)
    if (cfg.method === "virtual") {
      u += mainCoefficients.mode_virtual;
    } else if (cfg.method === "hybrid") {
      u += mainCoefficients.mode_hybrid;
    }

    // Frequency (weekly baseline; daily treated as weekly)
    if (cfg.frequency === "weekly" || cfg.frequency === "daily") {
      u += mainCoefficients.freq_weekly;
    } else if (cfg.frequency === "monthly") {
      u += mainCoefficients.freq_monthly;
    }

    // Duration (short baseline)
    if (cfg.duration === "2hrs") {
      u += mainCoefficients.dur_2hrs;
    } else if (cfg.duration === "4hrs") {
      u += mainCoefficients.dur_4hrs;
    }

    // Accessibility / distance
    if (cfg.accessibility === "local") {
      u += mainCoefficients.dist_local;
    } else if (cfg.accessibility === "wider") {
      u += mainCoefficients.dist_signif;
    } else if (cfg.accessibility === "home") {
      // Treat at-home as at least as attractive as local area
      u += mainCoefficients.dist_local;
    }

    return u;
  }

  function computeEndorsement(cfg) {
    const baseUtility = computeAttributeUtility(cfg);

    const ascProg = mainCoefficients.ASC_mean || 0;
    const ascOpt = mainCoefficients.ASC_optout || 0;
    const costBeta = mainCoefficients.cost_cont || 0;

    const costPerPersonPerSession = cfg.adjustedCostPerSession;
    const costTerm = costBeta * costPerPersonPerSession;

    const U_prog = ascProg + baseUtility + costTerm;
    const U_opt = ascOpt;

    const expP = Math.exp(U_prog);
    const expO = Math.exp(U_opt);
    const denom = expP + expO;

    const endorseProb = denom === 0 ? 0 : expP / denom;
    const optoutProb = denom === 0 ? 1 : expO / denom;

    return {
      endorseProb,
      optoutProb,
      baseUtility,
      ascProg,
      ascOpt,
      costTerm,
      costPerPersonPerSession
    };
  }

  /* ===========================
     Scenario-level WTP per participant per session
     =========================== */

  function computeWtpPerParticipantPerSession(cfg) {
    let wtp = 0;

    // Programme type
    if (cfg.programmeType === "comm") {
      wtp += wtpFor("Community engagement");
    } else if (cfg.programmeType === "psych") {
      wtp += wtpFor("Psychological counselling");
    } else if (cfg.programmeType === "vr") {
      wtp += wtpFor("Virtual reality");
    }

    // Method
    if (cfg.method === "virtual") {
      wtp += wtpFor("Virtual (method)");
    } else if (cfg.method === "hybrid") {
      wtp += wtpFor("Hybrid (method)");
    }

    // Frequency
    if (cfg.frequency === "weekly" || cfg.frequency === "daily") {
      wtp += wtpFor("Weekly (freq)");
    } else if (cfg.frequency === "monthly") {
      wtp += wtpFor("Monthly (freq)");
    }

    // Duration
    if (cfg.duration === "2hrs") {
      wtp += wtpFor("2-hour interaction");
    } else if (cfg.duration === "4hrs") {
      wtp += wtpFor("4-hour interaction");
    }

    // Accessibility
    if (cfg.accessibility === "local") {
      wtp += wtpFor("Local area accessibility");
    } else if (cfg.accessibility === "wider") {
      wtp += wtpFor("Wider community accessibility");
    } else if (cfg.accessibility === "home") {
      wtp += wtpFor("Local area accessibility");
    }

    return wtp; // AUD per participant per session
  }

  /* ===========================
     Cost and DCE-based benefit calculations
     =========================== */

  function computeCostsAndBenefits(cfg) {
    const util = computeEndorsement(cfg);
    const wtpPerParticipantPerSession =
      computeWtpPerParticipantPerSession(cfg);

    const uptake = util.endorseProb;
    const cohortSize = Math.max(0, cfg.cohortSize || 0);
    const numSessions = Math.max(0, cfg.numSessions || 0);

    const endorsedParticipants = cohortSize * uptake;
    const totalSessionsAll = endorsedParticipants * numSessions;

    const directCostAll =
      cfg.adjustedCostPerSession * totalSessionsAll;
    const oppCostAll = directCostAll * OPP_COST_RATE;
    const totalEconomicCostAll = directCostAll + oppCostAll;

    const totalBenefitsAll =
      wtpPerParticipantPerSession * totalSessionsAll;

    const netBenefitAll = totalBenefitsAll - totalEconomicCostAll;
    const bcr =
      totalEconomicCostAll > 0
        ? totalBenefitsAll / totalEconomicCostAll
        : null;

    return {
      cfg,
      util,
      uptake,
      endorsedParticipants,
      totalSessionsAll,
      wtpPerParticipantPerSession,
      totalBenefitsAll,
      directCostAll,
      oppCostAll,
      totalEconomicCostAll,
      netBenefitAll,
      bcr
    };
  }

  /* ===========================
     Overview tab update
     =========================== */

  function updateOverviewTab(results) {
    const uptakePct = results.uptake;
    const netBenefitMillion = formatCurrencyMillions(
      results.netBenefitAll,
      2
    );

    setText("summary-uptake", formatPercent(uptakePct, 1));
    setText(
      "summary-benefit-per-participant",
      formatNumber(results.wtpPerParticipantPerSession, 1)
    );
    setText("summary-net-benefit-all", netBenefitMillion);

    const cfg = results.cfg;

    setText(
      "context-cohort-size",
      formatNumber(cfg.cohortSize, 0)
    );
    setText(
      "context-cost-per-session",
      formatNumber(cfg.adjustedCostPerSession, 0)
    );
    setText(
      "context-col-multiplier",
      cfg.multiplier ? cfg.multiplier.toFixed(2) : "–"
    );

    const formatStr = [
      prettyFrequency(cfg.frequency),
      prettyDuration(cfg.duration),
      prettyMethod(cfg.method),
      prettyAccessibility(cfg.accessibility)
    ].join(" · ");
    setText("context-session-format", formatStr);
  }

  /* ===========================
     Scenario & costs tab update
     =========================== */

  function updateScenarioCostsTab(results) {
    const cfg = results.cfg;

    setText(
      "cost-summary-base-session",
      formatNumber(cfg.baseCostPerSession, 0)
    );
    setText(
      "cost-summary-adjusted-session",
      formatNumber(cfg.adjustedCostPerSession, 0)
    );
    setText(
      "cost-summary-total-all",
      formatCurrencyMillions(results.totalEconomicCostAll, 2)
    );
  }

  /* ===========================
     Benefits & results tab update
     =========================== */

  function updateBenefitsResultsTab(results) {
    const cfg = results.cfg;

    setText(
      "benefits-uptake",
      formatPercent(results.uptake, 1)
    );
    setText(
      "benefits-endorsed-participants",
      formatNumber(results.endorsedParticipants, 0)
    );
    setText(
      "benefits-per-session",
      formatNumber(results.wtpPerParticipantPerSession, 1)
    );
    setText(
      "benefits-total-all",
      formatCurrencyMillions(results.totalBenefitsAll, 2)
    );

    // Cost–benefit summary
    setText(
      "cb-benefits-all",
      formatCurrencyMillions(results.totalBenefitsAll, 2)
    );
    setText(
      "cb-costs-all",
      formatCurrencyMillions(results.totalEconomicCostAll, 2)
    );
    setText(
      "cb-net-benefit-all",
      formatCurrencyMillions(results.netBenefitAll, 2)
    );
    setText(
      "cb-bcr",
      results.bcr === null ? "–" : results.bcr.toFixed(2)
    );

    // Base net benefit for sensitivity table
    setText(
      "sens-net-base",
      formatCurrencyMillions(results.netBenefitAll, 2)
    );

    updateUptakeSensitivityChart(results, cfg);
  }

  /* ===========================
     Uptake sensitivity chart (Chart.js)
     =========================== */

  function updateUptakeSensitivityChart(results, cfg) {
    const canvas = $("chart-uptake-sensitivity");
    const ChartLib = window.Chart;
    if (!canvas || !ChartLib) return;

    // Simple sensitivity: current cost vs ±25% cost change
    const currentCfg = { ...cfg };
    const lowCostCfg = {
      ...cfg,
      adjustedCostPerSession: cfg.adjustedCostPerSession * 0.75
    };
    const highCostCfg = {
      ...cfg,
      adjustedCostPerSession: cfg.adjustedCostPerSession * 1.25
    };

    const currentUptake = results.uptake;
    const lowCostUptake = computeEndorsement(lowCostCfg).endorseProb;
    const highCostUptake = computeEndorsement(highCostCfg).endorseProb;

    const data = {
      labels: [
        "Lower cost (–25%)",
        "Current cost",
        "Higher cost (+25%)"
      ],
      datasets: [
        {
          data: [
            lowCostUptake * 100,
            currentUptake * 100,
            highCostUptake * 100
          ]
        }
      ]
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              return `${v.toFixed(1)} % uptake`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback(value) {
              return value + "%";
            }
          }
        }
      }
    };

    if (state.charts.uptakeSensitivity) {
      state.charts.uptakeSensitivity.destroy();
    }
    state.charts.uptakeSensitivity = new ChartLib(canvas, {
      type: "bar",
      data,
      options
    });
  }

  /* ===========================
     Sensitivity sliders
     =========================== */

  function updateSensitivityFromSliders() {
    if (!state.lastResults) return;

    const base = state.lastResults;

    const costPct = state.sensitivity.costPct;
    const uptakePct = state.sensitivity.uptakePct;

    const adjustedCost =
      base.totalEconomicCostAll * (1 + costPct / 100);
    const adjustedUptake = Math.max(
      0,
      Math.min(1, base.uptake * (1 + uptakePct / 100))
    );

    const cohortSize = base.cfg.cohortSize;
    const numSessions = base.cfg.numSessions;

    const endorsedParticipantsAdj = cohortSize * adjustedUptake;
    const totalSessionsAdj = endorsedParticipantsAdj * numSessions;

    const totalBenefitsAdj =
      base.wtpPerParticipantPerSession * totalSessionsAdj;

    const netBenefitAdj = totalBenefitsAdj - adjustedCost;

    setText(
      "sens-net-adjusted",
      formatCurrencyMillions(netBenefitAdj, 2)
    );
  }

  function initSensitivitySliders() {
    const sliderCost = $("slider-sens-cost");
    const labelCost = $("label-sens-cost");
    const sliderUptake = $("slider-sens-uptake");
    const labelUptake = $("label-sens-uptake");

    if (sliderCost && labelCost) {
      sliderCost.addEventListener("input", () => {
        const val = parseInt(sliderCost.value, 10) || 0;
        state.sensitivity.costPct = val;
        labelCost.textContent = `${val}%`;
        updateSensitivityFromSliders();
      });
    }

    if (sliderUptake && labelUptake) {
      sliderUptake.addEventListener("input", () => {
        const val = parseInt(sliderUptake.value, 10) || 0;
        state.sensitivity.uptakePct = val;
        labelUptake.textContent = `${val}%`;
        updateSensitivityFromSliders();
      });
    }
  }

  /* ===========================
     Assumptions and DCE parameter tables
     =========================== */

  function populateAssumptionsTable(results) {
    const tbody = $("table-assumptions")?.querySelector("tbody");
    if (!tbody || !results) return;

    const cfg = results.cfg;

    tbody.innerHTML = "";

    const rows = [
      {
        assumption: "Benefit metric",
        value: "DCE-based willingness to pay per participant per session",
        notes:
          "Benefits are derived solely from the LonelyLessAustralia discrete choice experiment and expressed in AUD per participant per session."
      },
      {
        assumption: "Cost metric",
        value: "Economic cost per participant per session",
        notes:
          "Costs include base programme costs per participant per session multiplied by a cost-of-living multiplier and an additional 20% opportunity cost."
      },
      {
        assumption: "Target population",
        value: `${formatNumber(cfg.cohortSize, 0)} older adults`,
        notes:
          "Cohort size represents the number of eligible older adults for the programme scenario."
      },
      {
        assumption: "Programme horizon",
        value: `${formatNumber(cfg.numSessions, 0)} sessions per participant`,
        notes:
          "Total number of sessions per participant over the evaluation period, as specified in the Scenario and costs tab."
      },
      {
        assumption: "Cost-of-living setting",
        value: `${cfg.region} (multiplier ${cfg.multiplier.toFixed(2)})`,
        notes:
          "Base costs per session are scaled by this multiplier to approximate differences in local cost of living across Australian settings."
      },
      {
        assumption: "Uptake measure",
        value: "Binary choice model (programme vs opt-out)",
        notes:
          "Predicted programme uptake is calculated from a mixed logit model with an alternative-specific constant and a continuous cost coefficient per session."
      },
      {
        assumption: "Net benefit definition",
        value: "Total DCE-based benefits minus total economic costs",
        notes:
          "Net benefit and benefit–cost ratios are based purely on preference-derived willingness to pay and economic costs; no separate health outcome monetisation is included."
      }
    ];

    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.assumption}</td>
        <td>${r.value}</td>
        <td>${r.notes}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function populateDceParametersTable() {
    const tbody = $("table-dce-parameters")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const maxAbs = Math.max(
      ...wtpDataMain.map(d => Math.abs(d.wtp))
    );

    function relativeStrength(absVal) {
      const ratio = absVal / maxAbs;
      if (ratio >= 0.75) return "Very strong";
      if (ratio >= 0.5) return "Strong";
      if (ratio >= 0.25) return "Moderate";
      return "Modest";
    }

    wtpDataMain.forEach(row => {
      const direction =
        row.wtp > 0 ? "Preferred" : row.wtp < 0 ? "Less preferred" : "Neutral";
      const strength = relativeStrength(Math.abs(row.wtp));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.attribute}</td>
        <td>${direction}</td>
        <td>${strength} (approx. ${row.wtp.toFixed(1)} A$ / session)</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ===========================
     Export preview and downloads
     =========================== */

  function updateExportPreview(results) {
    const preview = $("export-preview");
    if (!preview || !results) return;

    const cfg = results.cfg;

    const text =
      `Scenario summary\n\n` +
      `Programme: ${prettyProgrammeType(cfg.programmeType)} delivered as ${prettyMethod(
        cfg.method
      ).toLowerCase()} with ${prettyFrequency(
        cfg.frequency
      ).toLowerCase()} and ${prettyDuration(
        cfg.duration
      ).toLowerCase()}, offered with ${prettyAccessibility(
        cfg.accessibility
      ).toLowerCase()}.\n\n` +
      `Target cohort: ${formatNumber(
        cfg.cohortSize,
        0
      )} older adults, each with ${formatNumber(
        cfg.numSessions,
        0
      )} planned sessions.\n` +
      `Cost-of-living setting: ${cfg.region} (multiplier ${cfg.multiplier.toFixed(
        2
      )}).\n\n` +
      `Predicted uptake: ${formatPercent(
        results.uptake,
        1
      )}% of eligible older adults.\n` +
      `Per-session DCE-based benefit: ${formatCurrency(
        results.wtpPerParticipantPerSession,
        1
      )} per participant per session.\n\n` +
      `Total DCE-based benefits (all cohorts): approximately ${formatCurrency(
        results.totalBenefitsAll,
        0
      )} (around ${formatCurrencyMillions(
        results.totalBenefitsAll,
        2
      )} million).\n` +
      `Total economic costs (including 20% opportunity cost): about ${formatCurrency(
        results.totalEconomicCostAll,
        0
      )} (around ${formatCurrencyMillions(
        results.totalEconomicCostAll,
        2
      )} million).\n` +
      `Net benefit: ${formatCurrency(
        results.netBenefitAll,
        0
      )} (around ${formatCurrencyMillions(
        results.netBenefitAll,
        2
      )} million), with a benefit–cost ratio of ${
        results.bcr === null ? "–" : results.bcr.toFixed(2)
      }.`;

    preview.textContent = text;
  }

  function exportPdfSummary() {
    if (!state.lastResults) return;
    if (!window.jspdf || !window.jspdf.jsPDF) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4"
    });

    doc.setFontSize(14);
    doc.text("LonelyLessAustralia – Scenario summary", 40, 60);

    const preview = $("export-preview");
    const text =
      preview?.textContent ||
      "Configure a scenario first to generate a summary.";

    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, 515);
    doc.text(lines, 40, 90);

    doc.save("lonelyless_scenario_summary.pdf");
  }

  function exportExcelSummary() {
    if (!state.lastResults) return;
    if (!window.XLSX) return;

    const r = state.lastResults;
    const cfg = r.cfg;

    const rows = [
      ["Item", "Value"],
      ["Programme type", prettyProgrammeType(cfg.programmeType)],
      ["Method", prettyMethod(cfg.method)],
      ["Frequency", prettyFrequency(cfg.frequency)],
      ["Duration", prettyDuration(cfg.duration)],
      ["Accessibility", prettyAccessibility(cfg.accessibility)],
      ["Cost-of-living region", cfg.region],
      ["Multiplier", cfg.multiplier.toFixed(2)],
      ["Base cost per session (A$)", cfg.baseCostPerSession],
      ["Adjusted cost per session (A$)", cfg.adjustedCostPerSession],
      ["Number of sessions per participant", cfg.numSessions],
      ["Target cohort size", cfg.cohortSize],
      [
        "Predicted uptake (%)",
        parseFloat(formatPercent(r.uptake, 1))
      ],
      [
        "Per-session DCE benefit (A$)",
        r.wtpPerParticipantPerSession
      ],
      ["Total DCE benefits (A$)", r.totalBenefitsAll],
      ["Total economic costs (A$)", r.totalEconomicCostAll],
      ["Net benefit (A$)", r.netBenefitAll],
      [
        "Benefit–cost ratio",
        r.bcr === null ? "" : r.bcr.toFixed(3)
      ]
    ];

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Summary");
    window.XLSX.writeFile(wb, "lonelyless_scenario_summary.xlsx");
  }

  /* ===========================
     Tabs (navigation)
     =========================== */

  function initTabs() {
    const tabs = document.querySelectorAll(".nav-tab");
    const panels = document.querySelectorAll(".tab-panel");

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-tab-target");
        if (!target) return;

        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        panels.forEach(panel => {
          if (panel.getAttribute("data-tab") === target) {
            panel.classList.add("active");
          } else {
            panel.classList.remove("active");
          }
        });
      });
    });
  }

  /* ===========================
     Cost slider display
     =========================== */

  function initCostSlider() {
    const slider = $("input-cost-per-session");
    const display = $("display-cost-per-session");
    if (!slider || !display) return;

    const updateDisplay = () => {
      const v = parseFloat(slider.value) || 0;
      display.textContent = v.toFixed(0);
    };

    slider.addEventListener("input", updateDisplay);
    updateDisplay();
  }

  /* ===========================
     Example scenario loader
     =========================== */

  function loadExampleScenario() {
    // Illustrative example: community engagement, in-person, weekly, 2hrs, local
    const setValue = (id, value) => {
      const el = $(id);
      if (el) el.value = value;
    };

    setValue("attr-programmeType", "comm");
    setValue("attr-method", "inperson");
    setValue("attr-frequency", "weekly");
    setValue("attr-duration", "2hrs");
    setValue("attr-accessibility", "local");

    setValue("input-cost-per-session", "40");
    setValue("input-number-of-sessions", "8");
    setValue("input-target-cohort", "1000");
    setValue("select-col-region", "NSW");

    // Refresh slider label
    const slider = $("input-cost-per-session");
    const display = $("display-cost-per-session");
    if (slider && display) {
      display.textContent = (parseFloat(slider.value) || 0).toFixed(0);
    }

    applyCurrentScenario();
  }

  /* ===========================
     Main apply scenario handler
     =========================== */

  function applyCurrentScenario() {
    const cfg = readScenarioFromInputs();
    if (!cfg.cohortSize || !cfg.numSessions || cfg.cohortSize <= 0 || cfg.numSessions <= 0) {
      // Minimal silent guard; UI remains unchanged if inputs are not yet valid
      return;
    }

    const results = computeCostsAndBenefits(cfg);
    state.lastResults = results;

    updateOverviewTab(results);
    updateScenarioCostsTab(results);
    updateBenefitsResultsTab(results);
    populateAssumptionsTable(results);
    updateExportPreview(results);

    // Reset sensitivity sliders and recompute
    state.sensitivity.costPct = 0;
    state.sensitivity.uptakePct = 0;
    if ($("slider-sens-cost")) {
      $("slider-sens-cost").value = "0";
      setText("label-sens-cost", "0%");
    }
    if ($("slider-sens-uptake")) {
      $("slider-sens-uptake").value = "0";
      setText("label-sens-uptake", "0%");
    }
    updateSensitivityFromSliders();
  }

  /* ===========================
     Event wiring
     =========================== */

  function initButtonsAndExports() {
    const btnUpdate = $("btn-update-scenario");
    if (btnUpdate) {
      btnUpdate.addEventListener("click", applyCurrentScenario);
    }

    const btnExample = $("btn-load-example-scenario");
    if (btnExample) {
      btnExample.addEventListener("click", loadExampleScenario);
    }

    const btnPdf = $("btn-export-pdf");
    if (btnPdf) {
      btnPdf.addEventListener("click", exportPdfSummary);
    }

    const btnExcel = $("btn-export-excel");
    if (btnExcel) {
      btnExcel.addEventListener("click", exportExcelSummary);
    }
  }

  /* ===========================
     DOMContentLoaded initialisation
     =========================== */

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    renderAttributeControls();
    populateCostOfLivingControls();
    initCostSlider();
    initSensitivitySliders();
    initButtonsAndExports();
    populateDceParametersTable();

    // Run once to populate with default values
    applyCurrentScenario();
  });
})();
