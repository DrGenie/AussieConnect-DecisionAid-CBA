/* ===================================================
   LonelyLessAustralia Decision Aid – script.js
   Premium loneliness version aligned with index.html
   - Uses loneliness attributes and levels
   - Integrates cost-of-living multipliers
   - Benefits are DCE-based only (no extra outcome monetisation)
   - WTP is per participant per session
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
    modelLabel: "Loneliness sample (mixed logit)",
    advanced: {
      audPerUsd: 1.5
    },
    tour: {
      steps: [],
      currentIndex: 0,
      active: false
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
   * WTP Data (AUD per participant per session)
   * These are DCE-based WTP estimates for loneliness attributes
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
      const rate = state.advanced?.audPerUsd || 1.5; // AUD per USD
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
    toast.className = "toast";
    toast.classList.remove("hidden");
    toast.classList.add(`toast-${kind}`);
    toast.classList.add("visible");
    if (showToast._timeout) clearTimeout(showToast._timeout);
    showToast._timeout = setTimeout(() => {
      toast.classList.remove("visible");
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
    const typeEl = document.getElementById("program-tier");
    const programmeType = typeEl ? typeEl.value || "peer" : "peer";

    const methodEl = document.getElementById("career-track");
    const method = methodEl ? methodEl.value || "inperson" : "inperson";

    const freqEl = document.getElementById("mentorship");
    const frequency = freqEl ? freqEl.value || "weekly" : "weekly";

    const durEl = document.getElementById("delivery");
    const duration = durEl ? durEl.value || "2hrs" : "2hrs";

    const accEl = document.getElementById("response");
    const accessibility = accEl ? accEl.value || "home" : "home";

    const regionEl = document.getElementById("region-select");
    const region = regionEl ? regionEl.value || "NSW" : "NSW";
    const multiplier = costOfLivingMultipliers[region] || 1.0;

    const slider = document.getElementById("cost-slider");
    const baseCostPerSession = slider ? parseFloat(slider.value) || 0 : 0;
    const adjustedCostPerSession = baseCostPerSession * multiplier;

    const partEl = document.getElementById("trainees");
    const groupEl = document.getElementById("cohorts");
    const participantsPerGroup = partEl
      ? parseInt(partEl.value, 10) || 0
      : 0;
    const numberOfGroups = groupEl
      ? parseInt(groupEl.value, 10) || 0
      : 0;

    const monthsEl = document.getElementById("programme-months");
    let programmeMonths = 12;
    if (monthsEl) {
      const mv = parseFloat(monthsEl.value);
      if (!isNaN(mv) && mv > 0) programmeMonths = mv;
    }

    const nameEl = document.getElementById("scenario-name");
    const notesEl = document.getElementById("scenario-notes");

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
      participantsPerGroup,
      numberOfGroups,
      programmeMonths,
      scenarioName: nameEl ? nameEl.value.trim() : "",
      scenarioNotes: notesEl ? notesEl.value.trim() : ""
    };
  }

  /* ===========================
     DCE utility and endorsement
     (cost treated per session as in DCE)
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

    // Frequency (daily approximated as weekly)
    if (cfg.frequency === "weekly" || cfg.frequency === "daily") {
      u += mainCoefficients.freq_weekly;
    } else if (cfg.frequency === "monthly") {
      u += mainCoefficients.freq_monthly;
    }

    // Duration (reference: short baseline)
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
      // Treat at-home as at least as attractive as local
      u += mainCoefficients.dist_local;
    }

    return u;
  }

  function computeEndorsement(cfg) {
    const baseUtility = computeAttributeUtility(cfg);

    const ascProg = mainCoefficients.ASC_mean || 0;
    const ascOpt = mainCoefficients.ASC_optout || 0;
    const costBeta = mainCoefficients.cost_cont || 0;

    // Cost treated per session in the DCE
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

  function getOppCostRate() {
    // Simple default: 20% of direct costs when opportunity cost is included
    return state.includeOppCost ? 0.2 : 0.0;
  }

  function computeCostsAndBenefits(cfg) {
    const util = computeEndorsement(cfg);

    const durationMonths = cfg.programmeMonths || 12;
    const participantsPerGroup = cfg.participantsPerGroup;
    const groups = cfg.numberOfGroups;

    // Sessions per month (simple rule)
    const sessionsPerMonth =
      cfg.frequency === "monthly" ? 1 : 4;
    const totalSessions = sessionsPerMonth * durationMonths;

    // Direct programme cost per group over full horizon
    const costPerParticipantPerMonth = cfg.adjustedCostPerSession * sessionsPerMonth;
    const directCostPerGroup =
      cfg.adjustedCostPerSession *
      totalSessions *
      participantsPerGroup;

    const oppRate = getOppCostRate();
    const oppCostPerGroup = directCostPerGroup * oppRate;
    const totalEconomicCostPerGroup = directCostPerGroup + oppCostPerGroup;
    const totalCostAllGroups = totalEconomicCostPerGroup * groups;

    // DCE-based WTP per participant per session
    const wtpPerParticipantPerSession = computeWtpPerParticipantPerSession(cfg);
    const wtpPerGroup =
      wtpPerParticipantPerSession *
      participantsPerGroup *
      totalSessions;
    const totalWtpAllGroups = wtpPerGroup * groups;

    const netBenefitAllGroups = totalWtpAllGroups - totalCostAllGroups;
    const bcr =
      totalCostAllGroups > 0 ? totalWtpAllGroups / totalCostAllGroups : null;
    const effectiveBenefit = totalWtpAllGroups * util.endorseProb;

    return {
      cfg: {
        ...cfg,
        sessionsPerMonth,
        totalSessions,
        costPerParticipantPerMonth,
        costPerPersonPerSessionFromDCE: util.costPerPersonPerSession
      },
      util,
      durationMonths,
      directCostPerGroup,
      oppCostPerGroup,
      totalEconomicCostPerGroup,
      totalCostAllGroups,
      wtpPerParticipantPerSession,
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
          } balance between DCE-based benefits and costs under current assumptions.`;

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
      )}, while preference-based DCE benefits are around ${formatCurrency(
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
      formatCurrency(results.wtpPerParticipantPerSession, 1)
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
    // For the social outcome monetary metric we retain DCE benefit only
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
                Math.round(results.util.endorseProb * 1000) / 10,
                Math.round(results.util.optoutProb * 1000) / 10
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
          labels: ["Total economic cost", "Total DCE WTP benefit"],
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
        )}, while DCE-based preference benefits are around ${formatCurrency(
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
          labels: ["Total economic cost", "Total DCE WTP benefit"],
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

    const benefitDefinitionEl = document.getElementById("benefit-definition-select");
    const benefitDefinition = benefitDefinitionEl ? benefitDefinitionEl.value : "wtp_only";

    const epiToggleEl = document.getElementById("sensitivity-epi-toggle");
    const includeOutcomeBenefits = epiToggleEl
      ? epiToggleEl.classList.contains("on")
      : false;

    const uptakeOverrideEl = document.getElementById("endorsement-override");
    let overrideRate = null;
    if (uptakeOverrideEl && uptakeOverrideEl.value !== "") {
      const val = parseFloat(uptakeOverrideEl.value);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        overrideRate = val / 100;
      }
    }

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

        const baseUptake = r.util.endorseProb;
        const uptakeUsed =
          benefitDefinition === "endorsement_adjusted" && overrideRate !== null
            ? overrideRate
            : baseUptake;

        const outcomeBenefit = includeOutcomeBenefits
          ? 0 // by design we keep benefits DCE-based only
          : 0;

        const totalCombinedBenefit = totalWtp + outcomeBenefit;
        const effectiveWtp = totalWtp * uptakeUsed;
        const npvDce = totalWtp - cost;
        const bcrDce = cost > 0 ? totalWtp / cost : null;

        const npvCombined = totalCombinedBenefit - cost;
        const bcrCombined = cost > 0 ? totalCombinedBenefit / cost : null;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${sc.label}</td>
          <td class="numeric-col">${formatCurrency(cost)}</td>
          <td class="numeric-col">${formatCurrency(totalWtp)}</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">${includeOutcomeBenefits ? formatCurrency(outcomeBenefit) : "-"}</td>
          <td class="numeric-col">${formatPercent(uptakeUsed, 1)}</td>
          <td class="numeric-col">${formatCurrency(effectiveWtp)}</td>
          <td class="numeric-col">${bcrDce === null ? "-" : bcrDce.toFixed(2)}</td>
          <td class="numeric-col">${formatCurrency(npvDce)}</td>
          <td class="numeric-col">${bcrCombined === null ? "-" : bcrCombined.toFixed(2)}</td>
          <td class="numeric-col">${formatCurrency(npvCombined)}</td>
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
        const baseUptake = r.util.endorseProb;
        const uptakeUsed =
          benefitDefinition === "endorsement_adjusted" && overrideRate !== null
            ? overrideRate
            : baseUptake;

        const totalWtp = r.totalWtpAllGroups;
        const outcomeBenefit = includeOutcomeBenefits ? 0 : 0; // kept at zero
        const combinedBenefit = totalWtp + outcomeBenefit;
        const npvDce = totalWtp - r.totalCostAllGroups;
        const bcrDce =
          r.totalCostAllGroups > 0 ? totalWtp / r.totalCostAllGroups : null;

        const npvCombined = combinedBenefit - r.totalCostAllGroups;
        const bcrCombined =
          r.totalCostAllGroups > 0 ? combinedBenefit / r.totalCostAllGroups : null;

        const effWtpOverall = totalWtp * uptakeUsed;
        const effCombined = combinedBenefit * uptakeUsed;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${sc.label}</td>
          <td>${state.modelLabel}</td>
          <td class="numeric-col">${formatPercent(uptakeUsed, 1)}</td>
          <td class="numeric-col">${formatCurrency(costPerGroup)}</td>
          <td class="numeric-col">${formatCurrency(totalWtp)}</td>
          <td class="numeric-col">-</td>
          <td class="numeric-col">${includeOutcomeBenefits ? formatCurrency(outcomeBenefit) : "-"}</td>
          <td class="numeric-col">${bcrDce === null ? "-" : bcrDce.toFixed(2)}</td>
          <td class="numeric-col">${formatCurrency(npvDce)}</td>
          <td class="numeric-col">${bcrCombined === null ? "-" : bcrCombined.toFixed(2)}</td>
          <td class="numeric-col">${formatCurrency(npvCombined)}</td>
          <td class="numeric-col">${formatCurrency(effWtpOverall)}</td>
          <td class="numeric-col">${formatCurrency(effCombined)}</td>
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
      const totalParticipantsAllGroups =
        cfg.numberOfGroups * cfg.participantsPerGroup;

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
        <td class="numeric-cell">${formatCurrency(r.wtpPerParticipantPerSession, 1)}</td>
        <td class="numeric-cell">${formatCurrency(r.totalWtpAllGroups)}</td>
        <td class="numeric-cell">${r.bcr === null ? "-" : r.bcr.toFixed(2)}</td>
        <td class="numeric-cell">${formatCurrency(r.totalCostAllGroups)}</td>
        <td class="numeric-cell">${formatCurrency(r.totalWtpAllGroups)}</td>
        <td class="numeric-cell">${formatCurrency(r.netBenefitAllGroups)}</td>
        <td class="numeric-cell">${formatNumber(totalParticipantsAllGroups, 0)}</td>
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
      showToast("Excel export library not available.", "error");
      return;
    }
    try {
      const wb = window.XLSX.utils.book_new();
      const ws = window.XLSX.utils.table_to_sheet(table);
      window.XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      window.XLSX.writeFile(wb, filename);
    } catch (e) {
      showToast("Unable to export to Excel in this browser.", "error");
    }
  }

  function exportTableToPdf(tableId, title, filename) {
    const table = document.getElementById(tableId);
    if (!table) {
      showToast("Table not found for PDF export.", "error");
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast("PDF export library not available.", "error");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4"
    });

    doc.setFontSize(14);
    doc.text(title, 40, 40);
    doc.setFontSize(8);

    doc.html(table, {
      x: 40,
      y: 60,
      html2canvas: {
        scale: 0.65,
        useCORS: true
      },
      callback: function (docInstance) {
        docInstance.save(filename);
      }
    });
  }

  function exportScenarioPolicyBriefPdf() {
    const table = document.getElementById("scenario-table");
    if (!table) {
      showToast("Scenario table not found for PDF export.", "error");
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast("PDF export library not available.", "error");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4"
    });

    doc.setFontSize(14);
    doc.text("LonelyLessAustralia – Scenario summary", 40, 50);
    doc.setFontSize(10);
    doc.text(
      "This brief summarises the shortlisted loneliness support programme scenarios including DCE-based benefits and costs.",
      40,
      70,
      { maxWidth: 520 }
    );

    doc.setFontSize(8);
    doc.html(table, {
      x: 40,
      y: 100,
      html2canvas: {
        scale: 0.6,
        useCORS: true
      },
      callback: function (docInstance) {
        docInstance.save("lonelyless_scenarios_policy_brief.pdf");
      }
    });
  }

  /* ===========================
     Advanced settings & assumption log
     =========================== */

  const defaultAdvancedValues = {
    audPerUsd: 1.5,
    frontlineGrads: 0.8,
    frontlineOutbreaks: 40,
    frontlineVGrad: 500,
    frontlineVOutbreak: 150,
    intermediateGrads: 0.75,
    intermediateOutbreaks: 60,
    intermediateVGrad: 700,
    intermediateVOutbreak: 200,
    advancedGrads: 0.7,
    advancedOutbreaks: 80,
    advancedVGrad: 900,
    advancedVOutbreak: 250
  };

  function applyAdvancedDefaultsToInputs() {
    const m = defaultAdvancedValues;
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && (el.value === "" || el.value === undefined)) {
        el.value = v;
      }
    };
    setVal("adv-inr-per-usd", m.audPerUsd);
    setVal("adv-frontline-grads", m.frontlineGrads);
    setVal("adv-frontline-outbreaks", m.frontlineOutbreaks);
    setVal("adv-frontline-vgrad", m.frontlineVGrad);
    setVal("adv-frontline-voutbreak", m.frontlineVOutbreak);
    setVal("adv-intermediate-grads", m.intermediateGrads);
    setVal("adv-intermediate-outbreaks", m.intermediateOutbreaks);
    setVal("adv-intermediate-vgrad", m.intermediateVGrad);
    setVal("adv-intermediate-voutbreak", m.intermediateVOutbreak);
    setVal("adv-advanced-grads", m.advancedGrads);
    setVal("adv-advanced-outbreaks", m.advancedOutbreaks);
    setVal("adv-advanced-vgrad", m.advancedVGrad);
    setVal("adv-advanced-voutbreak", m.advancedVOutbreak);
  }

  function applyAdvancedSettings() {
    const rateEl = document.getElementById("adv-inr-per-usd");
    if (rateEl) {
      const rv = parseFloat(rateEl.value);
      if (!isNaN(rv) && rv > 0.1 && rv < 10) {
        state.advanced.audPerUsd = rv;
      } else {
        state.advanced.audPerUsd = defaultAdvancedValues.audPerUsd;
      }
    }
    // Other advanced fields are currently used descriptively only
    if (state.lastResults) {
      updateConfigSummary(state.lastResults);
      updateResultsTab(state.lastResults);
      updateCostingTab(state.lastResults);
      updateNationalSimulation(state.lastResults);
      updateSensitivityTab();
      updateAssumptionLog(state.lastResults);
    }
    showToast("Advanced settings applied.", "success");
  }

  function resetAdvancedSettings() {
    const ids = [
      "adv-inr-per-usd",
      "adv-frontline-grads",
      "adv-frontline-outbreaks",
      "adv-frontline-vgrad",
      "adv-frontline-voutbreak",
      "adv-intermediate-grads",
      "adv-intermediate-outbreaks",
      "adv-intermediate-vgrad",
      "adv-intermediate-voutbreak",
      "adv-advanced-grads",
      "adv-advanced-outbreaks",
      "adv-advanced-vgrad",
      "adv-advanced-voutbreak"
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    applyAdvancedDefaultsToInputs();
    state.advanced.audPerUsd = defaultAdvancedValues.audPerUsd;
    if (state.lastResults) {
      updateAssumptionLog(state.lastResults);
    }
    showToast("Advanced settings reset.", "success");
  }

  function updateAssumptionLog(results) {
    const logEl = document.getElementById("assumption-log-text");
    if (!logEl || !results) return;

    const cfg = results.cfg;

    const lines = [];
    lines.push("LonelyLessAustralia assumption log");
    lines.push("--------------------------------");
    lines.push(`Currency base: AUD (display can switch to USD).`);
    lines.push(
      `AUD per USD for display: ${state.advanced.audPerUsd.toFixed(2)} (does not affect underlying AUD calculations).`
    );
    lines.push(
      `Cost-of-living multiplier: ${cfg.multiplier.toFixed(2)} for region ${cfg.region}.`
    );
    lines.push(
      `Opportunity cost included in economic cost: ${state.includeOppCost ? "Yes (20% of direct programme cost)" : "No (budgetary costs only)"}.`
    );
    lines.push(
      `WTP unit: All willingness-to-pay values are expressed as AUD per participant per session based solely on the loneliness discrete choice experiment.`
    );
    lines.push("");
    lines.push("Configuration snapshot");
    lines.push(
      `Programme type: ${prettyProgrammeType(cfg.programmeType)}; method: ${prettyMethod(
        cfg.method
      )}; frequency: ${prettyFrequency(cfg.frequency)}; duration: ${prettyDuration(
        cfg.duration
      )}; accessibility: ${prettyAccessibility(cfg.accessibility)}.`
    );
    lines.push(
      `Participants per group: ${formatNumber(
        cfg.participantsPerGroup,
        0
      )}; number of groups: ${formatNumber(
        cfg.numberOfGroups,
        0
      )}; programme horizon: ${formatNumber(cfg.programmeMonths, 0)} months.`
    );
    lines.push(
      `Cost per participant per month (adjusted): ${formatCurrency(
        cfg.costPerParticipantPerMonth,
        1
      )}.`
    );
    lines.push("");
    lines.push("Model notes");
    lines.push(
      `Preference model: single mixed logit for loneliness DCE with cost per session; no latent classes are used in this decision aid.`
    );
    lines.push(
      `Benefits used in benefit–cost ratios and net present values are DCE-based willingness-to-pay only; social outcomes and connections are tracked descriptively but are not monetised separately.`
    );

    logEl.textContent = lines.join("\n");
  }

  /* ===========================
     Tooltips
     =========================== */

  let activeTooltip = null;

  function hideTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltipForElement(el) {
    const text = el.getAttribute("data-tooltip");
    if (!text) return;
    hideTooltip();

    const bubble = document.createElement("div");
    bubble.className = "tooltip-bubble";
    const p = document.createElement("p");
    p.textContent = text;
    const arrow = document.createElement("div");
    arrow.className = "tooltip-arrow";
    bubble.appendChild(p);
    bubble.appendChild(arrow);
    document.body.appendChild(bubble);

    const rect = el.getBoundingClientRect();
    const bb = bubble.getBoundingClientRect();
    let top = rect.bottom + 8 + window.scrollY;
    let left = rect.left + window.scrollX;

    if (left + bb.width > window.innerWidth - 16) {
      left = window.innerWidth - bb.width - 16;
    }

    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;

    const arrowOffset = Math.min(
      Math.max(rect.left + rect.width / 2 - left - 4, 8),
      bb.width - 16
    );
    arrow.style.left = `${arrowOffset}px`;
    arrow.style.top = `-4px`;

    activeTooltip = bubble;
  }

  function initTooltips() {
    document.addEventListener("click", (evt) => {
      const icon = evt.target.closest(".info-icon");
      if (icon && icon.hasAttribute("data-tooltip")) {
        evt.stopPropagation();
        if (activeTooltip) {
          hideTooltip();
        } else {
          showTooltipForElement(icon);
        }
      } else {
        hideTooltip();
      }
    });
    window.addEventListener("scroll", hideTooltip, { passive: true });
  }

  /* ===========================
     Tabs
     =========================== */

  function initTabs() {
    const links = document.querySelectorAll(".tab-link");
    links.forEach(link => {
      link.addEventListener("click", () => {
        const target = link.getAttribute("data-tab");
        if (!target) return;
        document
          .querySelectorAll(".tab-link")
          .forEach(l => l.classList.remove("active"));
        document
          .querySelectorAll(".tab-panel")
          .forEach(p => p.classList.remove("active"));

        link.classList.add("active");
        const panel = document.getElementById(`tab-${target}`);
        if (panel) panel.classList.add("active");
      });
    });
  }

  /* ===========================
     Modal for scenario snapshot
     =========================== */

  function openResultsModal() {
    const modal = document.getElementById("results-modal");
    const body = document.getElementById("modal-body");
    if (!modal || !body) return;
    body.innerHTML = "";

    if (!state.lastResults) {
      body.textContent = "Apply a configuration to generate a scenario summary.";
    } else {
      const r = state.lastResults;
      const cfg = r.cfg;

      const lines = [];
      lines.push(
        `Scenario: ${
          cfg.scenarioName || "LonelyLessAustralia configuration"
        }`
      );
      lines.push("");
      lines.push(
        `Programme type: ${prettyProgrammeType(
          cfg.programmeType
        )}, delivered as ${prettyMethod(cfg.method).toLowerCase()} with ${prettyFrequency(
          cfg.frequency
        ).toLowerCase()} and ${prettyDuration(cfg.duration).toLowerCase()}, offered with ${prettyAccessibility(
          cfg.accessibility
        ).toLowerCase()}.`
      );
      lines.push(
        `Scale: ${formatNumber(
          cfg.numberOfGroups,
          0
        )} groups with ${formatNumber(
          cfg.participantsPerGroup,
          0
        )} participants per group over ${formatNumber(
          cfg.programmeMonths,
          0
        )} months.`
      );
      lines.push(
        `Cost-of-living region: ${cfg.region} (multiplier ${cfg.multiplier.toFixed(
          2
        )}).`
      );
      lines.push("");
      lines.push(
        `Predicted uptake: ${formatPercent(
          r.util.endorseProb,
          1
        )} would support this loneliness programme rather than opting out.`
      );
      lines.push(
        `DCE-based willingness-to-pay per participant per session: ${formatCurrency(
          r.wtpPerParticipantPerSession,
          1
        )}.`
      );
      lines.push(
        `Total DCE-based benefit across all groups: ${formatCurrency(
          r.totalWtpAllGroups
        )}.`
      );
      lines.push(
        `Total economic cost across all groups: ${formatCurrency(
          r.totalCostAllGroups
        )}.`
      );
      lines.push(
        `Net benefit (DCE-based benefits minus economic costs): ${formatCurrency(
          r.netBenefitAllGroups
        )}.`
      );
      lines.push(
        `Benefit–cost ratio: ${
          r.bcr === null ? "-" : r.bcr.toFixed(2)
        } (values above 1 indicate that DCE-based benefits exceed costs).`
      );

      const pre = document.createElement("pre");
      pre.textContent = lines.join("\n");
      body.appendChild(pre);
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeResultsModal() {
    const modal = document.getElementById("results-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  /* ===========================
     Guided tour
     =========================== */

  function collectTourSteps() {
    const nodes = document.querySelectorAll("[data-tour-step]");
    const steps = [];
    nodes.forEach(node => {
      steps.push({
        element: node,
        title: node.getAttribute("data-tour-title") || "LonelyLess step",
        content:
          node.getAttribute("data-tour-content") ||
          "This area is part of the LonelyLessAustralia decision aid.",
        key: node.getAttribute("data-tour-step") || ""
      });
    });
    state.tour.steps = steps;
  }

  function positionTourPopover(step) {
    const overlay = document.getElementById("tour-overlay");
    const popover = document.getElementById("tour-popover");
    if (!overlay || !popover || !step) return;

    const rect = step.element.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();

    let top = rect.bottom + 12 + window.scrollY;
    let left = rect.left + window.scrollX;

    if (top + popRect.height > window.scrollY + window.innerHeight - 20) {
      top = rect.top - popRect.height - 12 + window.scrollY;
    }
    if (left + popRect.width > window.innerWidth - 16) {
      left = window.innerWidth - popRect.width - 16;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function showTourStep(index) {
    const overlay = document.getElementById("tour-overlay");
    const popover = document.getElementById("tour-popover");
    const titleEl = document.getElementById("tour-title");
    const contentEl = document.getElementById("tour-content");
    const indicator = document.getElementById("tour-step-indicator");

    if (!overlay || !popover || !titleEl || !contentEl || !indicator) return;

    const steps = state.tour.steps;
    if (!steps.length || index < 0 || index >= steps.length) {
      endTour();
      return;
    }

    state.tour.currentIndex = index;
    const step = steps[index];

    overlay.classList.remove("hidden");
    popover.classList.remove("hidden");

    titleEl.textContent = step.title;
    contentEl.textContent = step.content;
    indicator.textContent = `Step ${index + 1} of ${steps.length}`;

    positionTourPopover(step);
    state.tour.active = true;
  }

  function endTour() {
    const overlay = document.getElementById("tour-overlay");
    const popover = document.getElementById("tour-popover");
    if (overlay) overlay.classList.add("hidden");
    if (popover) popover.classList.add("hidden");
    state.tour.active = false;
  }

  function initTour() {
    collectTourSteps();
    const startBtn = document.getElementById("btn-start-tour");
    const nextBtn = document.getElementById("tour-next");
    const prevBtn = document.getElementById("tour-prev");
    const closeBtn = document.getElementById("tour-close");
    const overlay = document.getElementById("tour-overlay");

    if (startBtn) {
      startBtn.addEventListener("click", () => {
        if (!state.tour.steps.length) collectTourSteps();
        showTourStep(0);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        showTourStep(state.tour.currentIndex + 1);
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        showTourStep(state.tour.currentIndex - 1);
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", endTour);
    }
    if (overlay) {
      overlay.addEventListener("click", endTour);
    }

    window.addEventListener("resize", () => {
      if (state.tour.active) {
        showTourStep(state.tour.currentIndex);
      }
    });
  }

  /* ===========================
     Currency & opportunity toggles
     =========================== */

  function initCurrencyToggle() {
    const buttons = document.querySelectorAll(".pill-toggle[data-currency]");
    const labelEl = document.getElementById("currency-label");

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const currency = btn.getAttribute("data-currency");
        if (!currency) return;
        state.currency = currency;

        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (labelEl) {
          labelEl.textContent = currency;
        }

        if (state.lastResults) {
          updateConfigSummary(state.lastResults);
          updateResultsTab(state.lastResults);
          updateCostingTab(state.lastResults);
          updateNationalSimulation(state.lastResults);
          updateSensitivityTab();
          updateScenarioTable();
        }
      });
    });
  }

  function recomputeFromCurrentConfig() {
    if (!state.lastResults) return;
    const cfg = state.lastResults.cfg;
    const newResults = computeCostsAndBenefits(cfg);
    state.lastResults = newResults;
    updateConfigSummary(newResults);
    updateResultsTab(newResults);
    updateCostingTab(newResults);
    updateNationalSimulation(newResults);
    updateSensitivityTab();
    updateAssumptionLog(newResults);
  }

  function initOppCostToggle() {
    const toggle = document.getElementById("opp-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const isOn = toggle.classList.contains("on");
      const label = toggle.querySelector(".switch-label");
      if (isOn) {
        toggle.classList.remove("on");
        state.includeOppCost = false;
        if (label) label.textContent = "Opportunity cost excluded";
      } else {
        toggle.classList.add("on");
        state.includeOppCost = true;
        if (label) label.textContent = "Opportunity cost included";
      }
      recomputeFromCurrentConfig();
    });
  }

  /* ===========================
     Cost slider display
     =========================== */

  function initCostSliderDisplay() {
    const slider = document.getElementById("cost-slider");
    const display = document.getElementById("cost-display");
    if (!slider || !display) return;

    const updateDisplay = () => {
      const value = parseFloat(slider.value) || 0;
      display.textContent = `AUD ${value.toFixed(0)} per session`;
    };

    slider.addEventListener("input", updateDisplay);
    updateDisplay();
  }

  /* ===========================
     Cost template source
     =========================== */

  function initCostSourceOptions() {
    const select = document.getElementById("cost-source");
    if (!select) return;
    if (select.options.length > 0) return;

    const options = [
      { value: "generic_peer", label: "Generic template – peer support" },
      { value: "generic_comm", label: "Generic template – community engagement" },
      { value: "generic_psych", label: "Generic template – psychological counselling" },
      { value: "generic_vr", label: "Generic template – virtual reality" }
    ];
    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
  }

  /* ===========================
     Apply configuration
     =========================== */

  function handleApplyConfiguration() {
    const cfg = readConfigurationFromInputs();
    if (
      !cfg.participantsPerGroup ||
      !cfg.numberOfGroups ||
      cfg.participantsPerGroup <= 0 ||
      cfg.numberOfGroups <= 0
    ) {
      showToast(
        "Please enter a positive number of participants per group and number of groups before applying.",
        "warning"
      );
      return;
    }

    const results = computeCostsAndBenefits(cfg);
    state.lastResults = results;

    updateConfigSummary(results);
    updateResultsTab(results);
    updateCostingTab(results);
    updateNationalSimulation(results);
    updateSensitivityTab();
    updateAssumptionLog(results);

    showToast("Configuration applied.", "success");
  }

  /* ===========================
     Event wiring
     =========================== */

  function initButtonsAndExports() {
    const applyBtn = document.getElementById("update-results");
    if (applyBtn) {
      applyBtn.addEventListener("click", handleApplyConfiguration);
    }

    const snapshotBtn = document.getElementById("open-snapshot");
    if (snapshotBtn) {
      snapshotBtn.addEventListener("click", openResultsModal);
    }

    const closeModalBtn = document.getElementById("close-modal");
    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", closeResultsModal);
    }

    const saveScenarioBtn = document.getElementById("save-scenario");
    if (saveScenarioBtn) {
      saveScenarioBtn.addEventListener("click", saveCurrentScenario);
    }

    const exportScenExcel = document.getElementById("export-excel");
    if (exportScenExcel) {
      exportScenExcel.addEventListener("click", () =>
        exportTableToExcel("scenario-table", "lonelyless_scenarios.xlsx")
      );
    }

    const exportScenPdf = document.getElementById("export-pdf");
    if (exportScenPdf) {
      exportScenPdf.addEventListener("click", exportScenarioPolicyBriefPdf);
    }

    const advApply = document.getElementById("advanced-apply");
    if (advApply) {
      advApply.addEventListener("click", applyAdvancedSettings);
    }

    const advReset = document.getElementById("advanced-reset");
    if (advReset) {
      advReset.addEventListener("click", resetAdvancedSettings);
    }

    const sensUpdate = document.getElementById("refresh-sensitivity-benefits");
    if (sensUpdate) {
      sensUpdate.addEventListener("click", updateSensitivityTab);
    }

    const sensExcel = document.getElementById("export-sensitivity-benefits-excel");
    if (sensExcel) {
      sensExcel.addEventListener("click", () => {
        exportTableToExcel(
          "dce-benefits-table",
          "lonelyless_dce_benefits.xlsx"
        );
      });
    }

    const sensPdf = document.getElementById("export-sensitivity-benefits-pdf");
    if (sensPdf) {
      sensPdf.addEventListener("click", () => {
        exportTableToPdf(
          "dce-benefits-table",
          "LonelyLessAustralia – DCE benefit sensitivity",
          "lonelyless_dce_benefits.pdf"
        );
      });
    }
  }

  /* ===========================
     DOMContentLoaded initialisation
     =========================== */

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initTooltips();
    initCurrencyToggle();
    initOppCostToggle();
    initCostSliderDisplay();
    initCostSourceOptions();
    initButtonsAndExports();
    applyAdvancedDefaultsToInputs();
    initTour();

    // Apply an initial configuration so that panels are populated
    handleApplyConfiguration();
  });
})();
