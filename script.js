/* ===================================================
   LonelyLessAustralia Decision Aid – script.js
   Premium loneliness version aligned with index.html
   - Uses loneliness attributes and levels
   - Integrates cost-of-living multipliers
   - No STEPS / FETP / frontline / intermediate / advanced
   =================================================== */

(() => {
  /* ===========================
     Global state
     =========================== */

  const state = {
    currency: "AUD",                // Currency display (AUD or USD)
    includeOppCost: true,           // Include opportunity cost in totals
    scenarios: [],                  // Saved scenarios
    charts: {
      uptake: null,
      bcr: null,
      epi: null,
      natCostBenefit: null,
      natEpi: null
    },
    lastResults: null,
    modelLabel: "Loneliness sample (mixed logit)"
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

  // Simple illustrative cost-of-living multipliers by state / territory
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
   * WTP Data (AUD per person per month)
   * These are already loneliness WTP estimates
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

  /* ===========================
     Helpers
     =========================== */

  function wtpFor(attributeName) {
    const row = wtpDataMain.find(d => d.attribute === attributeName);
    return row ? row.wtp : 0;
  }

  function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return "-";
    return value.toLocaleString("en-AU", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    });
  }

  function formatPercent(value, decimals = 1) {
    if (value === null || value === undefined || !isFinite(value)) return "-";
    const pct = value * 100;
    return `${pct.toFixed(decimals)} %`;
  }

  function formatCurrency(valueInAud, decimals = 0) {
    if (valueInAud === null || valueInAud === undefined || isNaN(valueInAud))
      return "-";

    if (state.currency === "USD") {
      const rate = 1.5; // simple AUD per USD; can be linked to advanced tab later
      const valueUsd = valueInAud / rate;
      return `USD ${valueUsd.toLocaleString("en-US", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1
      })}`;
    }

    return `AUD ${valueInAud.toLocaleString("en-AU", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    })}`;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
  }

  function showToast(message, kind = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = "toast"; // reset
    toast.classList.remove("hidden");
    toast.classList.add(`toast-${kind}`);
    toast.classList.add("show");
    if (showToast._timeout) clearTimeout(showToast._timeout);
    showToast._timeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
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
    if (v === "hybrid") return "Hybrid (virtual and in-person)";
    return "In-person participation";
  }

  function prettyFrequency(v) {
    if (v === "daily") return "Daily interactions";
    if (v === "monthly") return "Monthly interactions";
    return "Weekly interactions";
  }

  function prettyDuration(v) {
    if (v === "30min") return "30-minute sessions";
    if (v === "4hrs") return "4-hour sessions";
    return "2-hour sessions";
  }

  function prettyAccessibility(v) {
    if (v === "wider") return "Wider community travel (50+ km)";
    if (v === "local") return "Local area (up to 12 km travel)";
    return "At-home access";
  }

  /* ===========================
     Read configuration from form
     =========================== */

  function readConfigurationFromInputs() {
    // Programme type
    const typeEl = document.getElementById("program-tier");
    const programmeType = typeEl ? typeEl.value || "peer" : "peer"; // peer / comm / psych / vr

    // Method of engagement
    const methodEl = document.getElementById("career-track");
    const method = methodEl ? methodEl.value || "inperson" : "inperson";

    // Frequency
    const freqEl = document.getElementById("mentorship");
    const frequency = freqEl ? freqEl.value || "weekly" : "weekly";

    // Duration
    const durEl = document.getElementById("delivery");
    const duration = durEl ? durEl.value || "2hrs" : "2hrs";

    // Accessibility
    const accEl = document.getElementById("response");
    const accessibility = accEl ? accEl.value || "home" : "home";

    // Region / state for cost-of-living
    const regionEl = document.getElementById("region-select");
    const region = regionEl ? regionEl.value || "NSW" : "NSW";
    const multiplier = costOfLivingMultipliers[region] || 1.0;

    // Cost slider (per session, in AUD – experimental range)
    const slider = document.getElementById("cost-slider");
    const baseCostPerSession = slider ? parseFloat(slider.value) || 0 : 0;
    const adjustedCostPerSession = baseCostPerSession * multiplier;

    // Participants and groups
    const partEl = document.getElementById("trainees");
    const groupEl = document.getElementById("cohorts");
    const participantsPerGroup = partEl
      ? parseInt(partEl.value, 10) || 0
      : 0;
    const numberOfGroups = groupEl
      ? parseInt(groupEl.value, 10) || 0
      : 0;

    // Programme horizon in months
    const monthsEl = document.getElementById("programme-months");
    let programmeMonths = 12;
    if (monthsEl) {
      const mv = parseFloat(monthsEl.value);
      if (!isNaN(mv) && mv > 0) programmeMonths = mv;
    }

    // Name and notes
    const nameEl = document.getElementById("scenario-name");
    const notesEl = document.getElementById("scenario-notes");

    return {
      programmeType,              // peer / comm / psych / vr
      method,                     // inperson / virtual / hybrid
      frequency,                  // daily / weekly / monthly
      duration,                   // 30min / 2hrs / 4hrs
      accessibility,             // home / local / wider
      region,
      multiplier,
      baseCostPerSession,
      adjustedCostPerSession,
      participantsPerGroup,
      numberOfGroups,
      programmeMonths,
      scenarioName: nameEl ? nameEl.value.trim() : "",
      scenarioNotes: notesEl ? notesEl.value.trim() : ""
    };
  }

  /* ===========================
     DCE utility and endorsement
     (per person per month basis)
     =========================== */

  function computeAttributeUtility(cfg) {
    let u = 0;

    // Programme type: peer support is implicit baseline
    if (cfg.programmeType === "comm") {
      u += mainCoefficients.type_comm;
    } else if (cfg.programmeType === "psych") {
      u += mainCoefficients.type_psych;
    } else if (cfg.programmeType === "vr") {
      u += mainCoefficients.type_vr;
    }

    // Method of engagement (reference: in-person)
    if (cfg.method === "virtual") {
      u += mainCoefficients.mode_virtual;
    } else if (cfg.method === "hybrid") {
      u += mainCoefficients.mode_hybrid;
    }

    // Frequency (your HTML has daily / weekly / monthly; coefficients are weekly vs monthly vs baseline)
    if (cfg.frequency === "weekly") {
      u += mainCoefficients.freq_weekly;
    } else if (cfg.frequency === "monthly") {
      u += mainCoefficients.freq_monthly;
    } else if (cfg.frequency === "daily") {
      // daily not directly in model: treat as at least as strong as weekly
      u += mainCoefficients.freq_weekly;
    }

    // Duration (reference: shorter baseline; you use 30min / 2hrs / 4hrs)
    if (cfg.duration === "2hrs") {
      u += mainCoefficients.dur_2hrs;
    } else if (cfg.duration === "4hrs") {
      u += mainCoefficients.dur_4hrs;
    } else if (cfg.duration === "30min") {
      // baseline – no extra effect
    }

    // Accessibility / distance
    if (cfg.accessibility === "local") {
      u += mainCoefficients.dist_local;
    } else if (cfg.accessibility === "wider") {
      u += mainCoefficients.dist_signif;
    } else if (cfg.accessibility === "home") {
      // At-home is likely at least as good as local; treat as local or slightly better
      u += mainCoefficients.dist_local;
    }

    return u;
  }

  function computeEndorsement(cfg) {
    const baseUtility = computeAttributeUtility(cfg);

    const ascProg = mainCoefficients.ASC_mean || 0;
    const ascOpt = mainCoefficients.ASC_optout || 0;
    const costBeta = mainCoefficients.cost_cont || 0;

    // Translate cost per session into "cost per month" for the cost coefficient.
    // Simple approach: assume 4 sessions per month at the chosen frequency.
    const sessionsPerMonth = cfg.frequency === "monthly" ? 1 : 4;
    const costPerPersonPerMonth = cfg.adjustedCostPerSession * sessionsPerMonth;
    const costTerm = costBeta * costPerPersonPerMonth;

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
      costPerPersonPerMonth
    };
  }

  /* ===========================
     Scenario-level WTP per person per month
     =========================== */

  function computeWtpPerParticipantPerMonth(cfg) {
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
      // treat as at least as attractive as local
      wtp += wtpFor("Local area accessibility");
    }

    return wtp; // AUD per person per month
  }

  /* ===========================
     Cost and benefit calculations
     =========================== */

  function getOppCostRate() {
    // Simple default: 20% of direct costs when opportunity cost is included
    return state.includeOppCost ? 0.2 : 0.0;
  }

  function computeCostsAndBenefits(cfg) {
    const util = computeEndorsement(cfg);

    const durationMonths = cfg.programmeMonths || 12;
    const participantsPerGroup = cfg.participantsPerGroup;
    const groups = cfg.numberOfGroups;

    // For budgeting, treat adjusted cost as cost per session and assume the same sessions per month rule
    const sessionsPerMonth = cfg.frequency === "monthly" ? 1 : 4;
    const costPerParticipantPerMonth = cfg.adjustedCostPerSession * sessionsPerMonth;

    // Direct programme cost per group (over full horizon)
    const directCostPerGroup =
      costPerParticipantPerMonth * participantsPerGroup * durationMonths;

    // Opportunity cost
    const oppRate = getOppCostRate();
    const oppCostPerGroup = directCostPerGroup * oppRate;
    const totalEconomicCostPerGroup = directCostPerGroup + oppCostPerGroup;
    const totalCostAllGroups = totalEconomicCostPerGroup * groups;

    // WTP per participant per month
    const wtpPerParticipantPerMonth = computeWtpPerParticipantPerMonth(cfg);
    const wtpPerGroup =
      wtpPerParticipantPerMonth *
      participantsPerGroup *
      durationMonths;
    const totalWtpAllGroups = wtpPerGroup * groups;

    const netBenefitAllGroups = totalWtpAllGroups - totalCostAllGroups;
    const bcr =
      totalCostAllGroups > 0 ? totalWtpAllGroups / totalCostAllGroups : null;
    const effectiveBenefit = totalWtpAllGroups * util.endorseProb;

    return {
      cfg: {
        ...cfg,
        costPerParticipantPerMonth: costPerParticipantPerMonth,
        costPerPersonPerMonthFromDCE: util.costPerPersonPerMonth
      },
      util,
      durationMonths,
      directCostPerGroup,
      oppCostPerGroup,
      totalEconomicCostPerGroup,
      totalCostAllGroups,
      wtpPerParticipantPerMonth,
      wtpPerGroup,
      totalWtpAllGroups,
      netBenefitAllGroups,
      bcr,
      effectiveBenefit
    };
  }

  /* ===========================
     Configuration summary UI
     =========================== */

  function updateConfigSummary(results) {
    const cfg = results.cfg;
    const summaryEl = document.getElementById("config-summary");
    if (!summaryEl) return;
    summaryEl.innerHTML = "";

    const rows = [
      ["Type of support programme", prettyProgrammeType(cfg.programmeType)],
      ["Method of engagement", prettyMethod(cfg.method)],
      ["Frequency of interaction", prettyFrequency(cfg.frequency)],
      ["Duration of each interaction", prettyDuration(cfg.duration)],
      ["Accessibility / convenience", prettyAccessibility(cfg.accessibility)],
      ["Region (cost-of-living)", cfg.region],
      ["Participants per group", formatNumber(cfg.participantsPerGroup, 0)],
      ["Number of groups", formatNumber(cfg.numberOfGroups, 0)],
      ["Programme horizon", `${formatNumber(cfg.programmeMonths, 0)} months`],
      [
        "Cost per participant per month (adjusted)",
        formatCurrency(cfg.costPerParticipantPerMonth, 1)
      ],
      [
        "Base cost per session",
        formatCurrency(cfg.baseCostPerSession, 0)
      ],
      ["Model", state.modelLabel]
    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "config-summary-row";
      const left = document.createElement("div");
      left.className = "config-summary-label";
      left.textContent = label;
      const right = document.createElement("div");
      right.className = "config-summary-value";
      right.textContent = value;
      row.appendChild(left);
      row.appendChild(right);
      summaryEl.appendChild(row);
    });

    setText(
      "config-endorsement-value",
      formatPercent(results.util.endorseProb, 1)
    );

    const statusTag = document.getElementById("headline-status-tag");
    const headline = document.getElementById("headline-recommendation");
    const briefing = document.getElementById("headline-briefing-text");
    if (!statusTag || !headline || !briefing) return;

    statusTag.className = "status-pill status-neutral";
    statusTag.textContent = "Assessment pending";

    if (results.bcr !== null) {
      if (results.bcr >= 1.5) {
        statusTag.className = "status-pill status-good";
        statusTag.textContent = "Strong value for money";
      } else if (results.bcr >= 1.0) {
        statusTag.className = "status-pill status-warning";
        statusTag.textContent = "Borderline value for money";
      } else {
        statusTag.className = "status-pill status-poor";
        statusTag.textContent = "Costs likely exceed benefits";
      }
    }

    headline.textContent =
      results.bcr === null
        ? "Configure the programme and cost assumptions to assess whether benefits of reducing loneliness are likely to justify the costs."
        : `With an estimated endorsement of ${formatPercent(
            results.util.endorseProb,
            1
          )}, a benefit–cost ratio of ${
            results.bcr ? results.bcr.toFixed(2) : "-"
          } and total economic costs of ${formatCurrency(
            results.totalCostAllGroups
          )}, this configuration provides a ${
            results.bcr && results.bcr >= 1 ? "promising" : "weaker"
          } balance between value and cost under current assumptions.`;

    briefing.textContent =
      `In this scenario, a ${prettyProgrammeType(
        cfg.programmeType
      ).toLowerCase()} programme is delivered as ${prettyMethod(
        cfg.method
      ).toLowerCase()} with ${prettyFrequency(
        cfg.frequency
      ).toLowerCase()} and ${prettyDuration(
        cfg.duration
      ).toLowerCase()} in terms of session length, offered with ${prettyAccessibility(
        cfg.accessibility
      ).toLowerCase()}. It targets ${formatNumber(
        cfg.participantsPerGroup,
        0
      )} participants per group across ${formatNumber(
        cfg.numberOfGroups,
        0
      )} groups over ${formatNumber(
        cfg.programmeMonths,
        0
      )} months. ` +
      `The mixed logit model implies that around ${formatPercent(
        results.util.endorseProb,
        1
      )} of older adults would be willing to take up this offer at an adjusted cost of ${formatCurrency(
        cfg.costPerParticipantPerMonth,
        1
      )} per person per month after applying the cost-of-living multiplier for ${cfg.region}. ` +
      `Total economic costs are approximately ${formatCurrency(
        results.totalCostAllGroups
      )}, while preference-based benefits are around ${formatCurrency(
        results.totalWtpAllGroups
      )}, yielding a benefit–cost ratio of ${
        results.bcr ? results.bcr.toFixed(2) : "-"
      } on current assumptions.`;
  }

  /* ===========================
     Results tab
     =========================== */

  function updateResultsTab(results) {
    setText(
      "endorsement-rate",
      formatPercent(results.util.endorseProb, 1)
    );
    setText("optout-rate", formatPercent(results.util.optoutProb, 1));

    setText(
      "wtp-per-trainee",
      formatCurrency(results.wtpPerParticipantPerMonth, 1)
    );
    setText(
      "wtp-total-cohort",
      formatCurrency(results.wtpPerGroup)
    );

    setText(
      "prog-cost-per-cohort",
      formatCurrency(results.directCostPerGroup)
    );
    setText(
      "total-cost",
      formatCurrency(results.totalEconomicCostPerGroup)
    );

    setText(
      "net-benefit",
      formatCurrency(results.netBenefitAllGroups)
    );
    setText(
      "bcr",
      results.bcr === null ? "-" : results.bcr.toFixed(2)
    );

    const totalParticipants =
      results.cfg.participantsPerGroup * results.cfg.numberOfGroups;
    const endorsedParticipants =
      totalParticipants * results.util.endorseProb;

    setText(
      "epi-graduates",
      formatNumber(endorsedParticipants, 0)
    );
    setText(
      "epi-outbreaks",
      formatNumber(totalParticipants, 0)
    );
    setText(
      "epi-benefit",
      formatCurrency(results.totalWtpAllGroups)
    );

    updateCharts(results);
  }

  /* ===========================
     Charts (Chart.js)
     =========================== */

  function updateCharts(results) {
    const ChartLib = window.Chart;
    if (!ChartLib) return;

    const uptakeCtx = document.getElementById("chart-uptake");
    if (uptakeCtx) {
      if (state.charts.uptake) state.charts.uptake.destroy();
      state.charts.uptake = new ChartLib(uptakeCtx, {
        type: "doughnut",
        data: {
          labels: ["Support loneliness programme", "Choose opt-out"],
          datasets: [
            {
              data: [
                Math.round(results.util.endorseProb * 100),
                Math.round(results.util.optoutProb * 100)
              ]
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const v = ctx.parsed;
                  return `${ctx.label}: ${v.toFixed(1)} %`;
                }
              }
            }
          }
        }
      });
    }

    const bcrCtx = document.getElementById("chart-bcr");
    if (bcrCtx) {
      if (state.charts.bcr) state.charts.bcr.destroy();
      state.charts.bcr = new ChartLib(bcrCtx, {
        type: "bar",
        data: {
          labels: ["Total economic cost", "Total WTP benefit"],
          datasets: [
            {
              data: [
                results.totalCostAllGroups || 0,
                results.totalWtpAllGroups || 0
              ]
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              ticks: {
                callback(value) {
                  if (value >= 1_000_000) {
                    return (value / 1_000_000).toFixed(1) + "m";
                  }
                  if (value >= 1_000) {
                    return (value / 1_000).toFixed(1) + "k";
                  }
                  return value;
                }
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label(ctx) {
                  return formatCurrency(ctx.parsed.y);
                }
              }
            }
          }
        }
      });
    }

    const epiCtx = document.getElementById("chart-epi");
    if (epiCtx) {
      if (state.charts.epi) state.charts.epi.destroy();
      const totalParticipants =
        results.cfg.participantsPerGroup * results.cfg.numberOfGroups;
      const endorsedParticipants =
        totalParticipants * results.util.endorseProb;
      state.charts.epi = new ChartLib(epiCtx, {
        type: "bar",
        data: {
          labels: ["Total participants", "Participants in endorsed programme"],
          datasets: [
            {
              data: [totalParticipants, endorsedParticipants]
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  /* ===========================
     Costing tab
     =========================== */

  function updateCostingTab(results) {
    const summary = document.getElementById("cost-breakdown-summary");
    if (summary) {
      summary.innerHTML = "";
      const items = [
        {
          label: "Direct programme cost per group",
          value: formatCurrency(results.directCostPerGroup)
        },
        {
          label: "Opportunity cost per group",
          value: formatCurrency(results.oppCostPerGroup)
        },
        {
          label: "Total economic cost per group",
          value: formatCurrency(results.totalEconomicCostPerGroup)
        },
        {
          label: "Total economic cost (all groups)",
          value: formatCurrency(results.totalCostAllGroups)
        }
      ];
      items.forEach(it => {
        const card = document.createElement("div");
        card.className = "cost-summary-card";
        const l = document.createElement("div");
        l.className = "cost-summary-label";
        l.textContent = it.label;
        const v = document.createElement("div");
        v.className = "cost-summary-value";
        v.textContent = it.value;
        card.appendChild(l);
        card.appendChild(v);
        summary.appendChild(card);
      });
    }

    const tbody = document.getElementById("cost-components-list");
    if (tbody) {
      tbody.innerHTML = "";
      const durationMonths = results.durationMonths;
      const ppg = results.cfg.participantsPerGroup;

      const shares = [
        { label: "Facilitators and staff time", share: 0.45 },
        { label: "Venue and overheads", share: 0.25 },
        { label: "Materials and digital tools", share: 0.15 },
        { label: "Coordination and management", share: 0.15 }
      ];

      shares.forEach(comp => {
        const amountPerGroup =
          results.directCostPerGroup * comp.share;
        const perParticipantPerMonth =
          durationMonths > 0 && ppg > 0
            ? amountPerGroup / (durationMonths * ppg)
            : 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${comp.label}</td>
          <td>${(comp.share * 100).toFixed(0)} %</td>
          <td class="numeric-cell">${formatCurrency(amountPerGroup)}</td>
          <td class="numeric-cell">${formatCurrency(perParticipantPerMonth, 1)}</td>
          <td>Illustrative breakdown for this loneliness configuration; can be refined using partner-specific templates.</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  /* ===========================
     Population simulation tab
     =========================== */

  function updateNationalSimulation(results) {
    const totalCost = results.totalCostAllGroups;
    const totalBenefit = results.totalWtpAllGroups;
    const net = results.netBenefitAllGroups;
    const bcrNat =
      totalCost > 0 ? totalBenefit / totalCost : results.bcr;

    const totalParticipants =
      results.cfg.participantsPerGroup * results.cfg.numberOfGroups;
    const endorsedParticipants =
      totalParticipants * results.util.endorseProb;

    setText("nat-total-cost", formatCurrency(totalCost));
    setText("nat-total-benefit", formatCurrency(totalBenefit));
    setText("nat-net-benefit", formatCurrency(net));
    setText("nat-bcr", bcrNat === null ? "-" : bcrNat.toFixed(2));
    setText("nat-total-wtp", formatCurrency(totalBenefit));
    setText("nat-graduates", formatNumber(endorsedParticipants, 0));
    setText("nat-outbreaks", formatNumber(totalParticipants, 0));

    const summary = document.getElementById("natsim-summary-text");
    if (summary) {
      summary.textContent =
        `At this scale the configuration would reach around ${formatNumber(
          totalParticipants,
          0
        )} older adults, with about ${formatNumber(
          endorsedParticipants,
          0
        )} participants expected to endorse and take up the programme given the modelled preferences. ` +
        `Total economic costs are approximately ${formatCurrency(
          totalCost
        )}, while preference-based benefits are around ${formatCurrency(
          totalBenefit
        )}, implying a population benefit–cost ratio of ${
          bcrNat ? bcrNat.toFixed(2) : "-"
        }.`;
    }

    const ChartLib = window.Chart;
    if (!ChartLib) return;

    const natCostCtx = document.getElementById("chart-nat-cost-benefit");
    if (natCostCtx) {
      if (state.charts.natCostBenefit) state.charts.natCostBenefit.destroy();
      state.charts.natCostBenefit = new ChartLib(natCostCtx, {
        type: "bar",
        data: {
          labels: ["Total economic cost", "Total WTP benefit"],
          datasets: [
            {
              data: [totalCost || 0, totalBenefit || 0]
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } }
        }
      });
    }

    const natEpiCtx = document.getElementById("chart-nat-epi");
    if (natEpiCtx) {
      if (state.charts.natEpi) state.charts.natEpi.destroy();
      state.charts.natEpi = new ChartLib(natEpiCtx, {
        type: "bar",
        data: {
          labels: ["Total participants", "Participants in endorsed programme"],
          datasets: [
            {
              data: [totalParticipants || 0, endorsedParticipants || 0]
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  /* ===========================
     Sensitivity / DCE benefits tab
     =========================== */

  function updateSensitivityTab() {
    const baseResults = state.lastResults;
    if (!baseResults) return;

    const scenarios = [
      {
        label: "Current configuration",
        results: baseResults
      },
      ...state.scenarios.map(s => ({
        label: s.name || "Saved scenario",
        results: s.results
      }))
    ];

    const mainBody = document.getElementById("dce-benefits-table-body");
    if (mainBody) {
      mainBody.innerHTML = "";
      scenarios.forEach(sc => {
        const r = sc.results;
        const cost = r.totalCostAllGroups;
        const totalWtp = r.totalWtpAllGroups;
        const endorsement = r.util.endorseProb;
        const effective = totalWtp * endorsement;
        const npvDce = totalWtp - cost;
        const bcrDce = cost > 0 ? totalWtp / cost : null;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${sc.label}</td>
          <td class="numeric-col">${formatCurrency(cost)}</td>
          <td class="numeric-col">${formatCurrency(totalWtp)}</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">${formatPercent(endorsement, 1)}</td>
          <td class="numeric-col">${formatCurrency(effective)}</td>
          <td class="numeric-col">${bcrDce === null ? "-" : bcrDce.toFixed(2)}</td>
          <td class="numeric-col">${formatCurrency(npvDce)}</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">-</td>
        `;
        mainBody.appendChild(tr);
      });
    }

    const detailBody = document.getElementById("sensitivity-table-body");
    if (detailBody) {
      detailBody.innerHTML = "";
      scenarios.forEach(sc => {
        const r = sc.results;
        const costPerGroup = r.totalEconomicCostPerGroup;
        const endRate = r.util.endorseProb;
        const totalWtp = r.totalWtpAllGroups;
        const npvDce = totalWtp - r.totalCostAllGroups;
        const bcrDce =
          r.totalCostAllGroups > 0 ? totalWtp / r.totalCostAllGroups : null;

        const effWtpOverall = totalWtp * endRate;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${sc.label}</td>
          <td>${state.modelLabel}</td>
          <td class="numeric-col">${formatPercent(endRate, 1)}</td>
          <td class="numeric-col">${formatCurrency(costPerGroup)}</td>
          <td class="numeric-col">${formatCurrency(totalWtp)}</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">${bcrDce === null ? "-" : bcrDce.toFixed(2)}</td>
          <td class="numeric-col">${formatCurrency(npvDce)}</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">${formatCurrency(effWtpOverall)}</td>
          <td class="numeric-col">-</td>
        `;
        detailBody.appendChild(tr);
      });
    }
  }

  /* ===========================
     Saved scenarios
     =========================== */

  function saveCurrentScenario() {
    if (!state.lastResults) {
      showToast("Apply a configuration before saving a scenario.", "warning");
      return;
    }

    const cfg = state.lastResults.cfg;
    const name =
      cfg.scenarioName || `Scenario ${state.scenarios.length + 1}`;

    const scenario = {
      id: Date.now(),
      name,
      cfg: { ...cfg },
      results: state.lastResults
    };

    state.scenarios.push(scenario);
    updateScenarioTable();
    updateSensitivityTab();
    showToast("Scenario saved.", "success");
  }

  function updateScenarioTable() {
    const tbody = document.querySelector("#scenario-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    state.scenarios.forEach(s => {
      const r = s.results;
      const cfg = r.cfg;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" /></td>
        <td>${s.name}</td>
        <td>
          <span class="chip chip-tier">${prettyProgrammeType(cfg.programmeType)}</span>
          <span class="chip chip-mentorship">${prettyFrequency(cfg.frequency)}</span>
        </td>
        <td>${prettyProgrammeType(cfg.programmeType)}</td>
        <td>${prettyMethod(cfg.method)}</td>
        <td>${prettyFrequency(cfg.frequency)}</td>
        <td>${prettyDuration(cfg.duration)}</td>
        <td>${prettyAccessibility(cfg.accessibility)}</td>
        <td class="numeric-cell">${formatNumber(cfg.numberOfGroups, 0)}</td>
        <td class="numeric-cell">${formatNumber(cfg.participantsPerGroup, 0)}</td>
        <td class="numeric-cell">${formatCurrency(cfg.baseCostPerSession, 0)}</td>
        <td>${state.modelLabel}</td>
        <td class="numeric-cell">${formatPercent(r.util.endorseProb, 1)}</td>
        <td class="numeric-cell">${formatCurrency(r.wtpPerParticipantPerMonth, 1)}</td>
        <td class="numeric-cell">${formatCurrency(r.totalWtpAllGroups)}</td>
        <td class="numeric-cell">${r.bcr === null ? "-" : r.bcr.toFixed(2)}</td>
        <td class="numeric-cell">${formatCurrency(r.totalCostAllGroups)}</td>
        <td class="numeric-cell">${formatCurrency(r.totalWtpAllGroups)}</td>
        <td class="numeric-cell">${formatCurrency(r.netBenefitAllGroups)}</td>
        <td class="numeric-cell">${cfg.numberOfGroups * cfg.participantsPerGroup}</td>
        <td>${cfg.scenarioNotes || ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ===========================
     Export utilities
     =========================== */

  function exportTableToExcel(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) {
      showToast("Table not found for export.", "error");
      return;
    }
    if (!window.XLSX) {
      showToast("Excel export library not loaded.", "error");
      return;
    }
    const wb = window.XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
    window.XLSX.writeFile(wb, filename);
  }

  function exportElementToPdf(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el) {
      showToast("Content not found for PDF export.", "error");
      return;
    }
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
      showToast("PDF export library not loaded.", "error");
      return;
    }
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    doc.html(el, {
      callback(pdf) {
        pdf.save(filename);
      },
      margin: [24, 24, 24, 24],
      autoPaging: "text"
    });
  }

  /* ===========================
     Tabs
     =========================== */

  function setupTabs() {
    const links = document.querySelectorAll(".tab-link");
    const panels = document.querySelectorAll(".tab-panel");

    links.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabKey = btn.getAttribute("data-tab");
        links.forEach(b => b.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = document.getElementById(`tab-${tabKey}`);
        if (panel) panel.classList.add("active");
      });
    });
  }

  /* ===========================
     Tooltips
     =========================== */

  function setupTooltips() {
    let currentBubble = null;

    function hideBubble() {
      if (currentBubble && currentBubble.parentNode) {
        currentBubble.parentNode.removeChild(currentBubble);
      }
      currentBubble = null;
    }

    document.addEventListener("mouseover", e => {
      const target = e.target.closest(".info-icon");
      if (!target || !target.dataset.tooltip) return;
      hideBubble();

      const bubble = document.createElement("div");
      bubble.className = "tooltip-bubble";
      bubble.innerHTML = `<p>${target.dataset.tooltip}</p><div class="tooltip-arrow"></div>`;
      document.body.appendChild(bubble);
      currentBubble = bubble;

      const rect = target.getBoundingClientRect();
      const bRect = bubble.getBoundingClientRect();
      let left = rect.left + window.scrollX;
      if (left + bRect.width > window.innerWidth) {
        left = window.innerWidth - bRect.width - 16;
      }
      bubble.style.left = `${left}px`;
      bubble.style.top = `${rect.bottom + 8 + window.scrollY}px`;
      const arrow = bubble.querySelector(".tooltip-arrow");
      if (arrow) {
        arrow.style.top = "-4px";
        arrow.style.left = "12px";
      }
    });

    document.addEventListener("mouseout", e => {
      if (e.relatedTarget && e.relatedTarget.closest(".tooltip-bubble")) {
        return;
      }
      hideBubble();
    });

    document.addEventListener("scroll", hideBubble);
  }

  /* ===========================
     Slider display and toggles
     =========================== */

  function setupSliderDisplay() {
    const slider = document.getElementById("cost-slider");
    const display = document.getElementById("cost-display");
    const regionEl = document.getElementById("region-select");
    if (!slider || !display) return;

    const update = () => {
      const val = parseFloat(slider.value) || 0;
      const region = regionEl ? regionEl.value || "NSW" : "NSW";
      const multiplier = costOfLivingMultipliers[region] || 1.0;
      const adjusted = val * multiplier;
      display.textContent =
        `${formatCurrency(val, 0)} per session (base) – ${formatCurrency(
          adjusted,
          0
        )} per session after ${region} cost-of-living adjustment`;
    };

    slider.addEventListener("input", update);
    if (regionEl) regionEl.addEventListener("change", update);
    update();
  }

  function setupCurrencyToggle() {
    const buttons = document.querySelectorAll(".pill-toggle[data-currency]");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.currency = btn.dataset.currency || "AUD";
        if (state.lastResults) {
          const cfg = state.lastResults.cfg;
          const results = computeCostsAndBenefits(cfg);
          refreshAll(results, { skipToast: true });
        }
      });
    });
  }

  function setupOppToggle() {
    const btn = document.getElementById("opp-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      btn.classList.toggle("on");
      const labelSpan = btn.querySelector(".switch-label");
      if (btn.classList.contains("on")) {
        state.includeOppCost = true;
        if (labelSpan) labelSpan.textContent = "Opportunity cost included";
      } else {
        state.includeOppCost = false;
        if (labelSpan) labelSpan.textContent = "Opportunity cost excluded";
      }
      if (state.lastResults) {
        const cfg = state.lastResults.cfg;
        const results = computeCostsAndBenefits(cfg);
        refreshAll(results, { skipToast: true });
      }
    });
  }

  /* ===========================
     Results modal
     =========================== */

  function setupResultsModal() {
    const openBtn = document.getElementById("open-snapshot");
    const modal = document.getElementById("results-modal");
    const closeBtn = document.getElementById("close-modal");
    const body = document.getElementById("modal-body");
    if (!openBtn || !modal || !closeBtn || !body) return;

    openBtn.addEventListener("click", () => {
      if (!state.lastResults) {
        showToast("Apply a configuration to open a summary.", "warning");
        return;
      }
      const r = state.lastResults;
      const cfg = r.cfg;

      body.innerHTML = `
        <h3>Headline summary</h3>
        <p>
          The selected configuration offers a ${prettyProgrammeType(
            cfg.programmeType
          ).toLowerCase()} programme delivered as ${prettyMethod(
        cfg.method
      ).toLowerCase()} with ${prettyFrequency(
        cfg.frequency
      ).toLowerCase()} and ${prettyDuration(
        cfg.duration
      ).toLowerCase()}, accessible via ${prettyAccessibility(
        cfg.accessibility
      ).toLowerCase()}. It is planned for ${formatNumber(
        cfg.programmeMonths,
        0
      )} months.
        </p>
        <p>
          The loneliness mixed logit model suggests that around ${formatPercent(
            r.util.endorseProb,
            1
          )} of older adults would endorse and take up this offer at an adjusted cost of ${formatCurrency(
        cfg.costPerParticipantPerMonth,
        1
      )} per person per month in ${cfg.region}. Total economic costs are around ${formatCurrency(
        r.totalCostAllGroups
      )}, compared with preference-based benefits of ${formatCurrency(
        r.totalWtpAllGroups
      )}. This implies a benefit–cost ratio of ${
        r.bcr ? r.bcr.toFixed(2) : "-"
      } and net benefits of ${formatCurrency(
        r.netBenefitAllGroups
      )} under the current assumptions.
        </p>
        <h3>Key indicators</h3>
        <ul>
          <li>Endorsement: ${formatPercent(r.util.endorseProb, 1)}</li>
          <li>Cost per participant per month (adjusted): ${formatCurrency(
            cfg.costPerParticipantPerMonth,
            1
          )}</li>
          <li>Total economic cost (all groups): ${formatCurrency(
            r.totalCostAllGroups
          )}</li>
          <li>Total WTP benefit (all groups): ${formatCurrency(
            r.totalWtpAllGroups
          )}</li>
          <li>Benefit–cost ratio: ${
            r.bcr ? r.bcr.toFixed(2) : "-"
          }</li>
        </ul>
      `;
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    });

    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    });

    modal.addEventListener("click", e => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      }
    });
  }

  /* ===========================
     Guided tour
     =========================== */

  function setupGuidedTour() {
    const startBtn = document.getElementById("btn-start-tour");
    const overlay = document.getElementById("tour-overlay");
    const pop = document.getElementById("tour-popover");
    const titleEl = document.getElementById("tour-title");
    const contentEl = document.getElementById("tour-content");
    const indicator = document.getElementById("tour-step-indicator");
    const nextBtn = document.getElementById("tour-next");
    const prevBtn = document.getElementById("tour-prev");
    const closeBtn = document.getElementById("tour-close");
    if (!startBtn || !overlay || !pop) return;

    const steps = Array.from(
      document.querySelectorAll("[data-tour-step]")
    ).map(el => ({
      el,
      title: el.getAttribute("data-tour-title") || "Step",
      content: el.getAttribute("data-tour-content") || "",
      key: el.getAttribute("data-tour-step") || ""
    }));

    let idx = 0;

    function showStep(i) {
      if (!steps.length) return;
      if (i < 0) i = 0;
      if (i >= steps.length) i = steps.length - 1;
      idx = i;
      const step = steps[idx];
      const rect = step.el.getBoundingClientRect();

      overlay.classList.remove("hidden");
      pop.classList.remove("hidden");

      titleEl.textContent = step.title;
      contentEl.textContent = step.content;
      indicator.textContent = `Step ${idx + 1} of ${steps.length}`;

      const top = rect.bottom + window.scrollY + 8;
      let left = rect.left + window.scrollX;
      const popWidth = pop.offsetWidth || 320;
      if (left + popWidth > window.innerWidth) {
        left = window.innerWidth - popWidth - 16;
      }
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
    }

    function endTour() {
      overlay.classList.add("hidden");
      pop.classList.add("hidden");
    }

    startBtn.addEventListener("click", () => {
      showStep(0);
    });

    nextBtn.addEventListener("click", () => {
      showStep(idx + 1);
    });

    prevBtn.addEventListener("click", () => {
      showStep(idx - 1);
    });

    closeBtn.addEventListener("click", endTour);
    overlay.addEventListener("click", endTour);
  }

  /* ===========================
     Refresh all views
     =========================== */

  function refreshAll(results, options = {}) {
    state.lastResults = results;
    updateConfigSummary(results);
    updateResultsTab(results);
    updateCostingTab(results);
    updateNationalSimulation(results);
    updateSensitivityTab();
    if (!options.skipToast) {
      showToast("Configuration applied. Results updated.", "success");
    }
  }

  /* ===========================
     Buttons and init
     =========================== */

  function setupButtons() {
    const applyBtn = document.getElementById("update-results");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        const cfg = readConfigurationFromInputs();
        const results = computeCostsAndBenefits(cfg);
        refreshAll(results);
      });
    }

    const saveBtn = document.getElementById("save-scenario");
    if (saveBtn) {
      saveBtn.addEventListener("click", saveCurrentScenario);
    }

    const exportScenExcel = document.getElementById("export-excel");
    if (exportScenExcel) {
      exportScenExcel.addEventListener("click", () =>
        exportTableToExcel("scenario-table", "lonelyless_scenarios.xlsx")
      );
    }

    const exportScenPdf = document.getElementById("export-pdf");
    if (exportScenPdf) {
      exportScenPdf.addEventListener("click", () =>
        exportElementToPdf("tab-scenarios", "lonelyless_policy_brief.pdf")
      );
    }

    const exportSensExcel = document.getElementById(
      "export-sensitivity-benefits-excel"
    );
    if (exportSensExcel) {
      exportSensExcel.addEventListener("click", () =>
        exportTableToExcel("dce-benefits-table", "lonelyless_sensitivity.xlsx")
      );
    }

    const exportSensPdf = document.getElementById(
      "export-sensitivity-benefits-pdf"
    );
    if (exportSensPdf) {
      exportSensPdf.addEventListener("click", () =>
        exportElementToPdf("tab-sensitivity", "lonelyless_sensitivity.pdf")
      );
    }

    const refreshSensBtn = document.getElementById(
      "refresh-sensitivity-benefits"
    );
    if (refreshSensBtn) {
      refreshSensBtn.addEventListener("click", () =>
        updateSensitivityTab()
      );
    }
  }

  function init() {
    setupTabs();
    setupTooltips();
    setupSliderDisplay();
    setupCurrencyToggle();
    setupOppToggle();
    setupResultsModal();
    setupGuidedTour();
    setupButtons();

    // Apply default configuration once on load
    const cfg = readConfigurationFromInputs();
    const results = computeCostsAndBenefits(cfg);
    refreshAll(results, { skipToast: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
