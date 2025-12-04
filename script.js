/* ===================================================
   LonelyLessAustralia Decision Aid – script.js (updated)
   – Aligned with HTML (no latent class UI)
   – Cost-of-living adjustment by state/territory
   – Advanced settings integrated for social outcomes
   =================================================== */

(() => {
  /* ===========================
     Global state
     =========================== */

  const state = {
    currency: "AUD",                // AUD by default; USD for display only
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
    modelLabel: "Main sample (mixed logit)",
    advanced: {
      exchangeRateAudPerUsd: 1.5,
      tiers: {
        frontline: {
          completionRate: 0.70,
          connectionsPerGroup: 40,
          valuePerCompleter: 400,
          valuePerConnection: 250
        },
        intermediate: {
          completionRate: 0.80,
          connectionsPerGroup: 60,
          valuePerCompleter: 600,
          valuePerConnection: 300
        },
        advanced: {
          completionRate: 0.85,
          connectionsPerGroup: 80,
          valuePerCompleter: 800,
          valuePerConnection: 350
        }
      }
    }
  };

  /***************************************************************************
   * Main DCE Coefficients (existing loneliness mixed logit)
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

  /***************************************************************************
   * Cost-of-living multipliers by state/territory
   * (Indicative only; can be refined as new evidence becomes available)
   ***************************************************************************/

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
   * WTP Data (AUD per person per month, main model)
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
      const rate = state.advanced.exchangeRateAudPerUsd || 1.5;
      const valueUsd = valueInAud / rate;
      return `USD ${valueUsd.toLocaleString("en-US", {
        maximumFractionDigits: decimals === 0 ? 1 : decimals,
        minimumFractionDigits: decimals === 0 ? 1 : decimals
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
    toast.classList.remove(
      "toast-success",
      "toast-warning",
      "toast-error",
      "hidden"
    );
    if (kind === "success") toast.classList.add("toast-success");
    if (kind === "warning") toast.classList.add("toast-warning");
    if (kind === "error") toast.classList.add("toast-error");
    toast.classList.add("show");
    if (showToast._timeout) clearTimeout(showToast._timeout);
    showToast._timeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  /* ===========================
     Pretty labels
     =========================== */

  function prettyProgrammeTier(t) {
    if (t === "intermediate") return "Structured group programme";
    if (t === "advanced") return "Intensive individual and group package";
    return "Light-touch social support";
  }

  function prettyConnectionFormat(v) {
    if (v === "one_to_one") return "One-to-one support";
    if (v === "small_group") return "Small group sessions";
    return "Community-based activities and clubs";
  }

  function prettyFrequencyFromMentorship(m) {
    if (m === "high") return "Intensive contact (multiple times per week)";
    if (m === "medium") return "Regular contact (weekly)";
    return "Low contact (e.g. fortnightly)";
  }

  function prettyModeFromDelivery(d) {
    if (d === "inperson") return "In-person";
    if (d === "online") return "Online / virtual";
    return "Blended (in-person and online)";
  }

  function prettyDurationFromTier(tier) {
    // Simple mapping: more intensive programmes tend to have longer sessions
    if (tier === "advanced") return "4-hour sessions";
    if (tier === "intermediate") return "2-hour sessions";
    return "1-hour sessions";
  }

  function prettyExpectedImprovement(v) {
    if (v === "30") return "Meaningful improvement for most participants";
    if (v === "15") return "Moderate improvement for some participants";
    return "Small improvement for a subset of participants";
  }

  /* ===========================
     Read configuration from form
     =========================== */

  function readConfigurationFromInputs() {
    const tierEl = document.getElementById("program-tier");
    const connectionEl = document.getElementById("career-track");
    const mentorshipEl = document.getElementById("mentorship");
    const deliveryEl = document.getElementById("delivery");
    const responseEl = document.getElementById("response");
    const costSlider = document.getElementById("cost-slider");
    const participantsInput = document.getElementById("trainees");
    const groupsInput = document.getElementById("cohorts");
    const monthsInput = document.getElementById("programme-months");
    const nameInput = document.getElementById("scenario-name");
    const notesInput = document.getElementById("scenario-notes");
    const stateSelect = document.getElementById("state_select");
    const adjustCostsEl = document.getElementById("adjustCosts");

    const programmeTier = tierEl ? tierEl.value || "frontline" : "frontline"; // frontline/intermediate/advanced
    const connectionFormat = connectionEl ? connectionEl.value || "small_group" : "small_group";
    const mentorship = mentorshipEl ? mentorshipEl.value || "medium" : "medium"; // low/medium/high
    const delivery = deliveryEl ? deliveryEl.value || "blended" : "blended";
    const responseLevel = responseEl ? responseEl.value || "30" : "30";

    const monthsVal = monthsInput ? parseFloat(monthsInput.value) : 12;
    const programmeMonths = !isNaN(monthsVal) && monthsVal > 0 ? monthsVal : 12;

    const baseCost = costSlider ? parseFloat(costSlider.value) || 0 : 0;

    const participantsPerGroup = participantsInput
      ? parseInt(participantsInput.value, 10) || 0
      : 0;

    const numberOfGroups = groupsInput
      ? parseInt(groupsInput.value, 10) || 0
      : 0;

    const stateCode = stateSelect ? stateSelect.value || "" : "";
    const adjustCosts = adjustCostsEl ? adjustCostsEl.value || "no" : "no";
    const applyCol =
      adjustCosts === "yes" && stateCode && costOfLivingMultipliers[stateCode];

    const multiplier = applyCol ? costOfLivingMultipliers[stateCode] : 1.0;
    const costPerParticipantPerMonth = baseCost * multiplier;

    return {
      programmeTier,              // frontline/intermediate/advanced
      connectionFormat,           // one_to_one/small_group/community_based
      mentorship,                 // low/medium/high
      delivery,                   // blended/inperson/online
      responseLevel,              // 30/15/7
      programmeMonths,
      baseCostPerParticipantPerMonth: baseCost,
      stateCode,
      applyCostOfLiving: adjustCosts === "yes",
      costPerParticipantPerMonth,
      participantsPerGroup,
      numberOfGroups,
      scenarioName: nameInput ? nameInput.value.trim() : "",
      scenarioNotes: notesInput ? notesInput.value.trim() : ""
    };
  }

  /* ===========================
     Mapping to DCE attributes
     =========================== */

  function mapToDceAttributes(cfg) {
    // Programme type -> DCE "type" attribute
    let serviceType = "comm";
    if (cfg.programmeTier === "intermediate") serviceType = "psych";
    if (cfg.programmeTier === "advanced") serviceType = "vr";

    // Mentorship -> frequency
    let frequency = "fortnightly"; // baseline
    if (cfg.mentorship === "medium") frequency = "weekly";
    if (cfg.mentorship === "high") frequency = "weekly";

    // Programme tier -> session duration
    let duration = "1hr";
    if (cfg.programmeTier === "intermediate") duration = "2hrs";
    if (cfg.programmeTier === "advanced") duration = "4hrs";

    // Delivery -> mode
    let mode = "inperson";
    if (cfg.delivery === "online") mode = "virtual";
    if (cfg.delivery === "blended") mode = "hybrid";

    // Accessibility/distance: assume local by default for these programmes
    const distance = "local";

    return { serviceType, frequency, duration, mode, distance };
  }

  /* ===========================
     DCE utility and endorsement
     =========================== */

  function computeAttributeUtility(dce) {
    let u = 0;

    if (dce.serviceType === "comm") {
      u += mainCoefficients.type_comm;
    } else if (dce.serviceType === "psych") {
      u += mainCoefficients.type_psych;
    } else if (dce.serviceType === "vr") {
      u += mainCoefficients.type_vr;
    }

    if (dce.mode === "virtual") {
      u += mainCoefficients.mode_virtual;
    } else if (dce.mode === "hybrid") {
      u += mainCoefficients.mode_hybrid;
    }

    if (dce.frequency === "weekly") {
      u += mainCoefficients.freq_weekly;
    } else if (dce.frequency === "monthly") {
      u += mainCoefficients.freq_monthly;
    }

    if (dce.duration === "2hrs") {
      u += mainCoefficients.dur_2hrs;
    } else if (dce.duration === "4hrs") {
      u += mainCoefficients.dur_4hrs;
    }

    if (dce.distance === "local") {
      u += mainCoefficients.dist_local;
    } else if (dce.distance === "wider") {
      u += mainCoefficients.dist_signif;
    }

    return u;
  }

  function computeEndorsement(cfg, dce) {
    const baseUtility = computeAttributeUtility(dce);

    const ascProg = mainCoefficients.ASC_mean || 0;
    const ascOpt = mainCoefficients.ASC_optout || 0;
    const costBeta = mainCoefficients.cost_cont || 0;

    const costTerm = costBeta * cfg.costPerParticipantPerMonth;

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
      costTerm
    };
  }

  /* ===========================
     Scenario-level WTP
     =========================== */

  function computeWtpPerParticipantPerMonth(dce) {
    let wtp = 0;

    if (dce.serviceType === "comm") {
      wtp += wtpFor("Community engagement");
    } else if (dce.serviceType === "psych") {
      wtp += wtpFor("Psychological counselling");
    } else if (dce.serviceType === "vr") {
      wtp += wtpFor("Virtual reality");
    }

    if (dce.mode === "virtual") {
      wtp += wtpFor("Virtual (method)");
    } else if (dce.mode === "hybrid") {
      wtp += wtpFor("Hybrid (method)");
    }

    if (dce.frequency === "weekly") {
      wtp += wtpFor("Weekly (freq)");
    } else if (dce.frequency === "monthly") {
      wtp += wtpFor("Monthly (freq)");
    }

    if (dce.duration === "2hrs") {
      wtp += wtpFor("2-hour interaction");
    } else if (dce.duration === "4hrs") {
      wtp += wtpFor("4-hour interaction");
    }

    if (dce.distance === "local") {
      wtp += wtpFor("Local area accessibility");
    } else if (dce.distance === "wider") {
      wtp += wtpFor("Wider community accessibility");
    }

    return wtp;
  }

  /* ===========================
     Cost and benefit calculations
     =========================== */

  function getOppCostRate() {
    return state.includeOppCost ? 0.2 : 0.0;
  }

  function getTierParams(programmeTier) {
    return state.advanced.tiers[programmeTier] || state.advanced.tiers.frontline;
  }

  function computeCostsAndBenefits(cfg) {
    const dce = mapToDceAttributes(cfg);
    const util = computeEndorsement(cfg, dce);

    const durationMonths = cfg.programmeMonths || 12;
    const participantsPerGroup = cfg.participantsPerGroup;
    const groups = cfg.numberOfGroups;

    const directCostPerGroup =
      cfg.costPerParticipantPerMonth * participantsPerGroup * durationMonths;

    const oppRate = getOppCostRate();
    const oppCostPerGroup = directCostPerGroup * oppRate;

    const totalEconomicCostPerGroup = directCostPerGroup + oppCostPerGroup;
    const totalCostAllGroups = totalEconomicCostPerGroup * groups;

    const wtpPerParticipantPerMonth = computeWtpPerParticipantPerMonth(dce);
    let wtpPerGroup = null;
    let totalWtpAllGroups = null;

    if (typeof wtpPerParticipantPerMonth === "number") {
      wtpPerGroup =
        wtpPerParticipantPerMonth *
        participantsPerGroup *
        durationMonths;
      totalWtpAllGroups = wtpPerGroup * groups;
    }

    const netBenefitAllGroups =
      totalWtpAllGroups !== null
        ? totalWtpAllGroups - totalCostAllGroups
        : null;

    const bcr =
      totalWtpAllGroups !== null && totalCostAllGroups > 0
        ? totalWtpAllGroups / totalCostAllGroups
        : null;

    const effectiveBenefit =
      totalWtpAllGroups !== null
        ? totalWtpAllGroups * util.endorseProb
        : null;

    // Outcome-based social benefit
    const tierParams = getTierParams(cfg.programmeTier);
    const totalParticipants = participantsPerGroup * groups;
    const endorsedParticipants = totalParticipants * util.endorseProb;
    const completionsAllGroups =
      endorsedParticipants * (tierParams.completionRate || 0);
    const connectionsPerGroup = tierParams.connectionsPerGroup || 0;
    const connectionsAllGroups = connectionsPerGroup * groups;

    const socialBenefitPerGroup =
      (participantsPerGroup *
        util.endorseProb *
        (tierParams.completionRate || 0) *
        (tierParams.valuePerCompleter || 0)) +
      (connectionsPerGroup * (tierParams.valuePerConnection || 0));

    const socialBenefitAllGroups = socialBenefitPerGroup * groups;

    const totalBenefitAllGroups =
      (totalWtpAllGroups || 0) + socialBenefitAllGroups;

    const bcrSocial =
      socialBenefitAllGroups > 0 && totalCostAllGroups > 0
        ? socialBenefitAllGroups / totalCostAllGroups
        : null;

    const bcrTotal =
      totalBenefitAllGroups > 0 && totalCostAllGroups > 0
        ? totalBenefitAllGroups / totalCostAllGroups
        : null;

    const netBenefitSocial =
      socialBenefitAllGroups - totalCostAllGroups;

    const netBenefitTotal =
      totalBenefitAllGroups - totalCostAllGroups;

    return {
      cfg,
      dce,
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
      effectiveBenefit,
      // Outcome-based
      completionsAllGroups,
      connectionsAllGroups,
      socialBenefitPerGroup,
      socialBenefitAllGroups,
      totalBenefitAllGroups,
      bcrSocial,
      bcrTotal,
      netBenefitSocial,
      netBenefitTotal,
      totalParticipants,
      endorsedParticipants
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
      ["Programme type / intensity", prettyProgrammeTier(cfg.programmeTier)],
      ["Social connection format", prettyConnectionFormat(cfg.connectionFormat)],
      ["Contact frequency", prettyFrequencyFromMentorship(cfg.mentorship)],
      ["Delivery mode", prettyModeFromDelivery(cfg.delivery)],
      ["Expected improvement in loneliness", prettyExpectedImprovement(cfg.responseLevel)],
      ["Programme horizon", `${formatNumber(cfg.programmeMonths, 0)} months`],
      ["Participants per group", formatNumber(cfg.participantsPerGroup)],
      ["Number of groups", formatNumber(cfg.numberOfGroups)],
      [
        "Base cost per participant per month",
        formatCurrency(cfg.baseCostPerParticipantPerMonth)
      ],
      [
        "Cost-of-living adjustment",
        cfg.applyCostOfLiving && cfg.stateCode
          ? `${cfg.stateCode} multiplier applied`
          : "No adjustment"
      ],
      [
        "Cost per participant per month (adjusted)",
        formatCurrency(cfg.costPerParticipantPerMonth)
      ],
      [
        "Model",
        state.modelLabel
      ]
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

    if (results.bcrTotal !== null) {
      if (results.bcrTotal >= 1.5) {
        statusTag.className = "status-pill status-good";
        statusTag.textContent = "Strong value for money";
      } else if (results.bcrTotal >= 1.0) {
        statusTag.className = "status-pill status-warning";
        statusTag.textContent = "Borderline value for money";
      } else {
        statusTag.className = "status-pill status-poor";
        statusTag.textContent = "Costs likely exceed benefits";
      }
    }

    const bcrText =
      results.bcrTotal !== null ? results.bcrTotal.toFixed(2) : "-";

    headline.textContent =
      results.bcrTotal === null
        ? "Configure the intervention and cost assumptions to see whether the benefits of reducing loneliness are likely to justify the costs."
        : `With an estimated endorsement of ${formatPercent(
            results.util.endorseProb,
            1
          )}, a total benefit–cost ratio of ${bcrText} and total economic costs of ${formatCurrency(
            results.totalCostAllGroups
          )}, this configuration offers a ${
            results.bcrTotal && results.bcrTotal >= 1 ? "promising" : "weaker"
          } balance between value and cost.`;

    briefing.textContent =
      `In this scenario, a ${prettyProgrammeTier(
        cfg.programmeTier
      ).toLowerCase()} is delivered as ${prettyModeFromDelivery(
        cfg.delivery
      ).toLowerCase()} with ${prettyFrequencyFromMentorship(
        cfg.mentorship
      ).toLowerCase()} for about ${prettyDurationFromTier(
        cfg.programmeTier
      ).toLowerCase()}. It uses a ${prettyConnectionFormat(
        cfg.connectionFormat
      ).toLowerCase()} format and is expected to deliver ${prettyExpectedImprovement(
        cfg.responseLevel
      ).toLowerCase()}. ` +
      `The model implies that around ${formatPercent(
        results.util.endorseProb,
        1
      )} of older adults would take up this offer at a cost of ${formatCurrency(
        cfg.costPerParticipantPerMonth
      )} per person per month${
        cfg.applyCostOfLiving && cfg.stateCode
          ? ` after adjusting for cost-of-living in ${cfg.stateCode}. `
          : ". "
      }` +
      `Total economic costs are approximately ${formatCurrency(
        results.totalCostAllGroups
      )}, while preference-based benefits are around ${formatCurrency(
        results.totalWtpAllGroups || 0
      )} and outcome-based social benefits are about ${formatCurrency(
        results.socialBenefitAllGroups
      )}. This yields a total benefit–cost ratio of ${bcrText} under the current assumptions.`;
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
      results.wtpPerParticipantPerMonth === null
        ? "-"
        : formatCurrency(results.wtpPerParticipantPerMonth, 1)
    );
    setText(
      "wtp-total-cohort",
      results.wtpPerGroup === null
        ? "-"
        : formatCurrency(results.wtpPerGroup)
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
      results.netBenefitAllGroups === null
        ? "-"
        : formatCurrency(results.netBenefitAllGroups)
    );
    setText(
      "bcr",
      results.bcr === null ? "-" : results.bcr.toFixed(2)
    );

    setText(
      "epi-graduates",
      formatNumber(results.completionsAllGroups, 0)
    );
    setText(
      "epi-outbreaks",
      formatNumber(results.connectionsAllGroups, 0)
    );
    setText(
      "epi-benefit",
      formatCurrency(results.socialBenefitPerGroup)
    );

    updateCharts(results);
  }

  /* ===========================
     Charts
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
          labels: ["Endorse programme", "Prefer status quo"],
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
          labels: ["Total economic cost", "Preference-based benefit (WTP)", "Outcome-based social benefit"],
          datasets: [
            {
              data: [
                results.totalCostAllGroups || 0,
                results.totalWtpAllGroups || 0,
                results.socialBenefitAllGroups || 0
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
                  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "m";
                  if (value >= 1_000) return (value / 1_000).toFixed(1) + "k";
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
      state.charts.epi = new ChartLib(epiCtx, {
        type: "bar",
        data: {
          labels: ["Participants completing", "Meaningful connections (all groups)"],
          datasets: [
            {
              data: [
                results.completionsAllGroups || 0,
                results.connectionsAllGroups || 0
              ]
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false }
          }
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
          <td class="numeric-cell">${formatCurrency(perParticipantPerMonth)}</td>
          <td>Illustrative share of direct programme cost (can be refined for specific implementations).</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  /* ===========================
     National simulation tab
     =========================== */

  function updateNationalSimulation(results) {
    const totalCost = results.totalCostAllGroups;
    const totalBenefit = results.socialBenefitAllGroups || 0;
    const net = results.netBenefitSocial || (totalBenefit - totalCost);
    const bcrNat =
      totalCost > 0 ? totalBenefit / totalCost : results.bcrSocial;

    const endorsedParticipants = results.completionsAllGroups || 0;
    const totalParticipants = results.totalParticipants || 0;

    setText("nat-total-cost", formatCurrency(totalCost));
    setText("nat-total-benefit", formatCurrency(totalBenefit));
    setText("nat-net-benefit", formatCurrency(net));
    setText(
      "nat-bcr",
      bcrNat === null ? "-" : bcrNat.toFixed(2)
    );
    setText(
      "nat-total-wtp",
      formatCurrency(results.totalWtpAllGroups || 0)
    );
    setText("nat-graduates", formatNumber(endorsedParticipants, 0));
    setText("nat-outbreaks", formatNumber(totalParticipants, 0));

    const summary = document.getElementById("natsim-summary-text");
    if (summary) {
      summary.textContent =
        `At this scale the programme would reach around ${formatNumber(
          totalParticipants,
          0
        )} older adults, with approximately ${formatNumber(
          endorsedParticipants,
          0
        )} completing the programme given current preferences and completion assumptions. ` +
        `Total economic costs are about ${formatCurrency(
          totalCost
        )}, with outcome-based social benefits of ${formatCurrency(
          totalBenefit
        )} and a social benefit–cost ratio of ${
          bcrNat ? bcrNat.toFixed(2) : "-"
        }. Preference-based WTP benefits of ${formatCurrency(
          results.totalWtpAllGroups || 0
        )} can be considered alongside these outcome-based estimates.`;
    }

    const ChartLib = window.Chart;
    if (!ChartLib) return;

    const natCostCtx = document.getElementById("chart-nat-cost-benefit");
    if (natCostCtx) {
      if (state.charts.natCostBenefit) state.charts.natCostBenefit.destroy();
      state.charts.natCostBenefit = new ChartLib(natCostCtx, {
        type: "bar",
        data: {
          labels: ["Total economic cost", "Total social benefit"],
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
          labels: ["Total participants", "Participants completing programme"],
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
        const totalWtp = r.totalWtpAllGroups || 0;
        const social = r.socialBenefitAllGroups || 0;
        const totalBenefit = (r.totalWtpAllGroups || 0) + social;
        const endorsement = r.util.endorseProb;
        const effective =
          totalWtp !== null ? totalWtp * endorsement : null;
        const npvWtp =
          totalWtp !== null ? totalWtp - cost : null;
        const npvTotal =
          totalBenefit !== null ? totalBenefit - cost : null;
        const bcrWtp =
          totalWtp !== null && cost > 0 ? totalWtp / cost : null;
        const bcrTotal =
          totalBenefit !== null && cost > 0 ? totalBenefit / cost : null;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${sc.label}</td>
          <td class="numeric-col">${formatCurrency(cost)}</td>
          <td class="numeric-col">${formatCurrency(totalWtp)}</td>
          <td class="numeric-col">${formatCurrency(social)}</td>
          <td class="numeric-col">${formatCurrency(totalBenefit)}</td>
          <td class="numeric-col">${formatPercent(endorsement, 1)}</td>
          <td class="numeric-col">${effective === null ? "-" : formatCurrency(effective)}</td>
          <td class="numeric-col">${bcrWtp === null ? "-" : bcrWtp.toFixed(2)}</td>
          <td class="numeric-col">${bcrTotal === null ? "-" : bcrTotal.toFixed(2)}</td>
          <td class="numeric-col">${npvWtp === null ? "-" : formatCurrency(npvWtp)}</td>
          <td class="numeric-col">${npvTotal === null ? "-" : formatCurrency(npvTotal)}</td>
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
        const totalWtp = r.totalWtpAllGroups || 0;
        const social = r.socialBenefitAllGroups || 0;
        const totalBenefit = (r.totalWtpAllGroups || 0) + social;
        const npvWtp =
          totalWtp !== null ? totalWtp - r.totalCostAllGroups : null;
        const npvTotal =
          totalBenefit !== null ? totalBenefit - r.totalCostAllGroups : null;
        const bcrWtp =
          totalWtp !== null && r.totalCostAllGroups > 0
            ? totalWtp / r.totalCostAllGroups
            : null;
        const bcrTotal =
          totalBenefit !== null && r.totalCostAllGroups > 0
            ? totalBenefit / r.totalCostAllGroups
            : null;
        const effective =
          totalWtp !== null ? totalWtp * endRate : null;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${sc.label}</td>
          <td>${state.modelLabel}</td>
          <td class="numeric-col">${formatPercent(endRate, 1)}</td>
          <td class="numeric-col">${formatCurrency(costPerGroup)}</td>
          <td class="numeric-col">${formatCurrency(totalWtp)}</td>
          <td class="numeric-col">${formatCurrency(social)}</td>
          <td class="numeric-col">${bcrWtp === null ? "-" : bcrWtp.toFixed(2)}</td>
          <td class="numeric-col">${bcrTotal === null ? "-" : bcrTotal.toFixed(2)}</td>
          <td class="numeric-col">${npvWtp === null ? "-" : formatCurrency(npvWtp)}</td>
          <td class="numeric-col">${npvTotal === null ? "-" : formatCurrency(npvTotal)}</td>
          <td class="numeric-col">${effective === null ? "-" : formatCurrency(effective)}</td>
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
          <span class="chip chip-tier">${prettyProgrammeTier(cfg.programmeTier)}</span>
          <span class="chip chip-mentorship">${prettyFrequencyFromMentorship(cfg.mentorship)}</span>
        </td>
        <td>${prettyProgrammeTier(cfg.programmeTier)}</td>
        <td>${prettyModeFromDelivery(cfg.delivery)}</td>
        <td>${prettyFrequencyFromMentorship(cfg.mentorship)}</td>
        <td>${prettyExpectedImprovement(cfg.responseLevel)}</td>
        <td class="numeric-cell">${formatNumber(cfg.participantsPerGroup, 0)}</td>
        <td class="numeric-cell">${formatNumber(cfg.numberOfGroups, 0)}</td>
        <td class="numeric-cell">${formatCurrency(cfg.costPerParticipantPerMonth)}</td>
        <td>${state.modelLabel}</td>
        <td class="numeric-cell">${formatPercent(r.util.endorseProb, 1)}</td>
        <td class="numeric-cell">${
          r.wtpPerParticipantPerMonth === null
            ? "-"
            : formatCurrency(r.wtpPerParticipantPerMonth, 1)
        }</td>
        <td class="numeric-cell">${
          r.totalWtpAllGroups === null
            ? "-"
            : formatCurrency(r.totalWtpAllGroups)
        }</td>
        <td class="numeric-cell">${
          r.bcr === null ? "-" : r.bcr.toFixed(2)
        }</td>
        <td class="numeric-cell">${formatCurrency(r.totalCostAllGroups)}</td>
        <td class="numeric-cell">${
          r.netBenefitAllGroups === null
            ? "-"
            : formatCurrency(r.netBenefitAllGroups)
        }</td>
        <td class="numeric-cell">${
          cfg.numberOfGroups * cfg.participantsPerGroup
        }</td>
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
      callback: function (pdf) {
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
     Simple tooltips (if using .info-icon)
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
      bubble.style.left = `${rect.left + window.scrollX}px`;
      bubble.style.top = `${rect.bottom + 8 + window.scrollY}px`;
    });

    document.addEventListener("mouseout", () => {
      hideBubble();
    });

    document.addEventListener("scroll", hideBubble);
  }

  /* ===========================
     Slider display and cost-of-living
     =========================== */

  function setupSliderDisplay() {
    const slider = document.getElementById("cost-slider");
    const display = document.getElementById("cost-display");
    const stateSelect = document.getElementById("state_select");
    const adjustEl = document.getElementById("adjustCosts");
    if (!slider || !display) return;

    const update = () => {
      const val = parseFloat(slider.value) || 0;
      const stateCode = stateSelect ? stateSelect.value || "" : "";
      const adjust = adjustEl ? adjustEl.value || "no" : "no";
      const applyCol =
        adjust === "yes" && stateCode && costOfLivingMultipliers[stateCode];
      const multiplier = applyCol ? costOfLivingMultipliers[stateCode] : 1.0;
      const adjusted = val * multiplier;

      if (applyCol) {
        display.textContent =
          `${formatCurrency(val)} (base) – ${formatCurrency(adjusted)} after ${stateCode} adjustment`;
      } else {
        display.textContent = `${formatCurrency(val)} per participant per month (no cost-of-living adjustment)`;
      }
    };

    slider.addEventListener("input", update);
    if (stateSelect) stateSelect.addEventListener("change", update);
    if (adjustEl) adjustEl.addEventListener("change", update);
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
          refreshAll(state.lastResults, { skipToast: true });
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
      if (labelSpan) {
        if (btn.classList.contains("on")) {
          labelSpan.textContent = "Opportunity cost included";
          state.includeOppCost = true;
        } else {
          labelSpan.textContent = "Opportunity cost excluded";
          state.includeOppCost = false;
        }
      }
      if (state.lastResults) {
        const cfg = state.lastResults.cfg;
        const newResults = computeCostsAndBenefits(cfg);
        state.lastResults = newResults;
        refreshAll(newResults, { skipToast: true });
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
          The selected configuration offers a ${prettyProgrammeTier(
            cfg.programmeTier
          ).toLowerCase()}, delivered as ${prettyModeFromDelivery(
        cfg.delivery
      ).toLowerCase()} with ${prettyFrequencyFromMentorship(
        cfg.mentorship
      ).toLowerCase()} over ${formatNumber(
        cfg.programmeMonths,
        0
      )} months. It uses a ${prettyConnectionFormat(
        cfg.connectionFormat
      ).toLowerCase()} format and is expected to deliver ${prettyExpectedImprovement(
        cfg.responseLevel
      ).toLowerCase()}.
        </p>
        <p>
          The mixed logit model suggests that around ${formatPercent(
        r.util.endorseProb,
        1
      )} of older adults would endorse and take up this offer at ${formatCurrency(
        cfg.costPerParticipantPerMonth
      )} per person per month${
        cfg.applyCostOfLiving && cfg.stateCode
          ? ` in ${cfg.stateCode}`
          : ""
      }. Total economic costs are approximately ${formatCurrency(
        r.totalCostAllGroups
      )}, compared with preference-based benefits of ${formatCurrency(
        r.totalWtpAllGroups || 0
      )} and outcome-based social benefits of ${formatCurrency(
        r.socialBenefitAllGroups
      )}. This implies a total benefit–cost ratio of ${
        r.bcrTotal ? r.bcrTotal.toFixed(2) : "-"
      } and net social benefits of ${
        r.netBenefitTotal === null
          ? "-"
          : formatCurrency(r.netBenefitTotal)
      } under the current assumptions.
        </p>
        <h3>Key indicators</h3>
        <ul>
          <li>Endorsement: ${formatPercent(r.util.endorseProb, 1)}</li>
          <li>Cost per participant per month (adjusted): ${formatCurrency(
            cfg.costPerParticipantPerMonth
          )}</li>
          <li>Total economic cost (all groups): ${formatCurrency(
            r.totalCostAllGroups
          )}</li>
          <li>Total WTP benefit (all groups): ${formatCurrency(
            r.totalWtpAllGroups || 0
          )}</li>
          <li>Outcome-based social benefit (all groups): ${formatCurrency(
            r.socialBenefitAllGroups
          )}</li>
          <li>Total benefit–cost ratio: ${
            r.bcrTotal ? r.bcrTotal.toFixed(2) : "-"
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
     Guided tour (lightweight)
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

    const steps = [
      {
        title: "Configure a programme",
        content:
          "Start in the configuration tab. Choose a programme type, connection format, contact frequency, delivery mode and costs. Then click “Apply configuration”.",
      },
      {
        title: "Review results and value for money",
        content:
          "The Results tab shows endorsement, willingness to pay and benefit–cost ratios. Use it for quick policy briefings.",
      },
      {
        title: "Explore costs and population impact",
        content:
          "Use the Cost breakdown and Population picture tabs to see how costs and benefits scale as you change group sizes and numbers.",
      },
      {
        title: "Compare scenarios and adjust assumptions",
        content:
          "Save multiple scenarios, compare them side by side in the Sensitivity tab, and refine key assumptions in Advanced settings.",
      }
    ];

    let idx = 0;

    function showStep(i) {
      if (!steps.length) return;
      if (i < 0) i = 0;
      if (i >= steps.length) i = steps.length - 1;
      idx = i;

      overlay.classList.remove("hidden");
      pop.classList.remove("hidden");

      const step = steps[idx];
      titleEl.textContent = step.title;
      contentEl.textContent = step.content;
      indicator.textContent = `Step ${idx + 1} of ${steps.length}`;
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
     Advanced settings
     =========================== */

  function populateAdvancedInputsFromState() {
    const t = state.advanced.tiers;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal("adv-frontline-grads", t.frontline.completionRate);
    setVal("adv-frontline-outbreaks", t.frontline.connectionsPerGroup);
    setVal("adv-frontline-vgrad", t.frontline.valuePerCompleter);
    setVal("adv-frontline-voutbreak", t.frontline.valuePerConnection);

    setVal("adv-intermediate-grads", t.intermediate.completionRate);
    setVal("adv-intermediate-outbreaks", t.intermediate.connectionsPerGroup);
    setVal("adv-intermediate-vgrad", t.intermediate.valuePerCompleter);
    setVal("adv-intermediate-voutbreak", t.intermediate.valuePerConnection);

    setVal("adv-advanced-grads", t.advanced.completionRate);
    setVal("adv-advanced-outbreaks", t.advanced.connectionsPerGroup);
    setVal("adv-advanced-vgrad", t.advanced.valuePerCompleter);
    setVal("adv-advanced-voutbreak", t.advanced.valuePerConnection);

    const exRateInput = document.getElementById("adv-inr-per-usd");
    if (exRateInput) {
      exRateInput.value = state.advanced.exchangeRateAudPerUsd;
    }
  }

  function setupAdvancedSettings() {
    const applyBtn = document.getElementById("advanced-apply");
    const resetBtn = document.getElementById("advanced-reset");

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        const t = state.advanced.tiers;

        function readNum(id, fallback) {
          const el = document.getElementById(id);
          if (!el) return fallback;
          const v = parseFloat(el.value);
          return isNaN(v) ? fallback : v;
        }

        t.frontline.completionRate = readNum("adv-frontline-grads", t.frontline.completionRate);
        t.frontline.connectionsPerGroup = readNum("adv-frontline-outbreaks", t.frontline.connectionsPerGroup);
        t.frontline.valuePerCompleter = readNum("adv-frontline-vgrad", t.frontline.valuePerCompleter);
        t.frontline.valuePerConnection = readNum("adv-frontline-voutbreak", t.frontline.valuePerConnection);

        t.intermediate.completionRate = readNum("adv-intermediate-grads", t.intermediate.completionRate);
        t.intermediate.connectionsPerGroup = readNum("adv-intermediate-outbreaks", t.intermediate.connectionsPerGroup);
        t.intermediate.valuePerCompleter = readNum("adv-intermediate-vgrad", t.intermediate.valuePerCompleter);
        t.intermediate.valuePerConnection = readNum("adv-intermediate-voutbreak", t.intermediate.valuePerConnection);

        t.advanced.completionRate = readNum("adv-advanced-grads", t.advanced.completionRate);
        t.advanced.connectionsPerGroup = readNum("adv-advanced-outbreaks", t.advanced.connectionsPerGroup);
        t.advanced.valuePerCompleter = readNum("adv-advanced-vgrad", t.advanced.valuePerCompleter);
        t.advanced.valuePerConnection = readNum("adv-advanced-voutbreak", t.advanced.valuePerConnection);

        const exRateInput = document.getElementById("adv-inr-per-usd");
        if (exRateInput) {
          const v = parseFloat(exRateInput.value);
          if (!isNaN(v) && v > 0) {
            state.advanced.exchangeRateAudPerUsd = v;
          }
        }

        if (state.lastResults) {
          const cfg = state.lastResults.cfg;
          const newResults = computeCostsAndBenefits(cfg);
          state.lastResults = newResults;
          refreshAll(newResults, { skipToast: true });
        }

        showToast("Advanced settings applied.", "success");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        state.advanced = {
          exchangeRateAudPerUsd: 1.5,
          tiers: {
            frontline: {
              completionRate: 0.70,
              connectionsPerGroup: 40,
              valuePerCompleter: 400,
              valuePerConnection: 250
            },
            intermediate: {
              completionRate: 0.80,
              connectionsPerGroup: 60,
              valuePerCompleter: 600,
              valuePerConnection: 300
            },
            advanced: {
              completionRate: 0.85,
              connectionsPerGroup: 80,
              valuePerCompleter: 800,
              valuePerConnection: 350
            }
          }
        };
        populateAdvancedInputsFromState();
        if (state.lastResults) {
          const cfg = state.lastResults.cfg;
          const newResults = computeCostsAndBenefits(cfg);
          state.lastResults = newResults;
          refreshAll(newResults, { skipToast: true });
        }
        showToast("Advanced settings reset to default.", "success");
      });
    }
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
    updateScenarioTable();
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
    setupAdvancedSettings();
    setupButtons();
    populateAdvancedInputsFromState();

    const cfg = readConfigurationFromInputs();
    const results = computeCostsAndBenefits(cfg);
    refreshAll(results, { skipToast: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
