// script.js – LonelyLessAustralia Decision Aid Tool
// ECL-derived utility, predicted uptake, QALY and WTP calculations
// Uses Chart.js, jsPDF and SheetJS (xlsx)

(function () {
  "use strict";

  // ---- Core preference parameters from the ECL model ----
  // Coefficients are interpreted on effects-coded / dummy-coded attributes
  // Baselines: Peer support, In-person, Daily, 30 min, At home, zero cost
  const COEFS = {
    asc_mean: -0.112,   // programme alternative ASC (mean)
    asc_optout: 0.131,  // opt-out ASC
    beta: {
      type: {
        community: 0.527,
        counselling: 0.156,
        vr: -0.349
      },
      method: {
        virtual: -0.426,
        hybrid: -0.289
      },
      frequency: {
        weekly: 0.617,
        monthly: 0.336
      },
      duration: {
        "120": 0.185, // 2 hours
        "240": 0.213  // 4 hours
      },
      access: {
        local: 0.059,
        wider: -0.509
      },
      cost: -0.036 // per AUD per session
    }
  };

  // ---- Chart instances ----
  let endorsementChart = null;
  let wtpChart = null;
  let netBenefitChart = null;

  // ---- Helpers: DOM ----
  function $(id) {
    return document.getElementById(id);
  }

  function num(id, fallback) {
    const el = $(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function text(id, fallback) {
    const el = $(id);
    if (!el) return fallback;
    const v = String(el.value || "").trim();
    return v || fallback;
  }

  // ---- Scenario extraction ----
  function getScenario(label) {
    // label is "A", "B", "C"
    const prefix = "scenario" + label;

    const supportType = text(prefix + "-support", "peer"); // peer, community, counselling, vr
    const method = text(prefix + "-method", "inperson");   // inperson, virtual, hybrid
    const frequency = text(prefix + "-frequency", "daily"); // daily, weekly, monthly
    const duration = text(prefix + "-duration", "30");     // 30, 120, 240 (minutes)
    const access = text(prefix + "-access", "home");       // home, local, wider
    const cost = num(prefix + "-cost", 0);                 // AUD per session

    return {
      label,
      name: "Scenario " + label,
      supportType,
      method,
      frequency,
      duration,
      access,
      cost
    };
  }

  // ---- Utility and WTP calculations ----
  function computeScenarioUtility(scenario) {
    let vAttr = 0;

    // Type of support
    if (scenario.supportType === "community") {
      vAttr += COEFS.beta.type.community;
    } else if (scenario.supportType === "counselling") {
      vAttr += COEFS.beta.type.counselling;
    } else if (scenario.supportType === "vr") {
      vAttr += COEFS.beta.type.vr;
    }
    // peer support is the reference = 0

    // Method of interaction
    if (scenario.method === "virtual") {
      vAttr += COEFS.beta.method.virtual;
    } else if (scenario.method === "hybrid") {
      vAttr += COEFS.beta.method.hybrid;
    }
    // in-person is the reference = 0

    // Frequency
    if (scenario.frequency === "weekly") {
      vAttr += COEFS.beta.frequency.weekly;
    } else if (scenario.frequency === "monthly") {
      vAttr += COEFS.beta.frequency.monthly;
    }
    // daily is the reference = 0

    // Duration
    if (scenario.duration === "120") {
      vAttr += COEFS.beta.duration["120"];
    } else if (scenario.duration === "240") {
      vAttr += COEFS.beta.duration["240"];
    }
    // 30 minutes is the reference = 0

    // Accessibility
    if (scenario.access === "local") {
      vAttr += COEFS.beta.access.local;
    } else if (scenario.access === "wider") {
      vAttr += COEFS.beta.access.wider;
    }
    // at home is the reference = 0

    const betaCost = COEFS.beta.cost;
    const cost = Number.isFinite(scenario.cost) ? scenario.cost : 0;
    const vCost = betaCost * cost;

    // Programme vs opt-out utilities (binary choice)
    const uProgramme = COEFS.asc_mean + vAttr + vCost;
    const uOptOut = COEFS.asc_optout;

    const expProg = Math.exp(uProgramme);
    const expOpt = Math.exp(uOptOut);
    const pEndorse = expProg / (expProg + expOpt); // P(choosing this programme vs no programme)

    // WTP per session for non-cost attributes
    // Standard logit WTP: β_attribute / −β_cost, summed across all non-cost attributes
    const wtpSessionNonCost = vAttr / (-betaCost); // AUD per session

    return {
      vAttr,
      cost,
      uProgramme,
      uOptOut,
      pEndorse,
      wtpSessionNonCost
    };
  }

  // ---- Time and discounting ----
  function makeAnnuityFactor(years, discountRatePct) {
    const T = Math.max(1, Math.round(years));
    const r = Math.max(0, discountRatePct) / 100;

    if (r === 0) return T;
    let factor = 0;
    for (let t = 1; t <= T; t++) {
      factor += 1 / Math.pow(1 + r, t);
    }
    return factor;
  }

  // ---- Main analysis ----
  function runBaseAnalysis() {
    const cohortSize = num("cohort-size", 1000); // eligible older adults
    const baselineEndorse = Math.min(100, Math.max(0, num("baseline-endorsement", 20))); // %
    const sessionsPerYear = Math.max(1, Math.round(num("sessions-per-year", 12)));
    const years = Math.max(1, Math.round(num("time-horizon", 5)));
    const discountRate = Math.max(0, num("discount-rate", 5));
    const qalyPerEngagedPerYear = Math.max(0, num("qaly-per-engaged", 0.03));
    const wtpScale = Math.max(0, num("wtp-scale", 1));

    const annuityFactor = makeAnnuityFactor(years, discountRate);

    const scenarios = ["A", "B", "C"].map((label) => {
      const raw = getScenario(label);
      const util = computeScenarioUtility(raw);

      // Endorsement modelling:
      // Additional endorsement from the new programme among those not already engaged.
      const additionalEndorsePct =
        util.pEndorse * (100 - baselineEndorse); // percentage points
      const finalEndorsePct = baselineEndorse + additionalEndorsePct;

      const engaged = (cohortSize * finalEndorsePct) / 100;

      // Annual flows
      const totalSessionsPerYear = engaged * sessionsPerYear;
      const annualProgrammeCost = totalSessionsPerYear * util.cost; // AUD/year

      const annualQalyGain = engaged * qalyPerEngagedPerYear; // QALYs/year
      const annualWtpBenefit =
        totalSessionsPerYear * util.wtpSessionNonCost * wtpScale; // AUD/year

      // Present value
      const pvCost = annualProgrammeCost * annuityFactor;
      const pvQaly = annualQalyGain * annuityFactor;
      const pvWtp = annualWtpBenefit * annuityFactor;

      const costPerQaly = pvQaly > 0 ? pvCost / pvQaly : null;
      const netWtpBenefit = pvWtp - pvCost;

      return {
        label,
        name: raw.name,
        supportType: raw.supportType,
        method: raw.method,
        frequency: raw.frequency,
        duration: raw.duration,
        access: raw.access,
        costPerSession: util.cost,
        vAttr: util.vAttr,
        pEndorse: util.pEndorse,
        additionalEndorsePct,
        finalEndorsePct,
        engaged,
        totalSessionsPerYear,
        annualProgrammeCost,
        annualQalyGain,
        annualWtpBenefit,
        pvCost,
        pvQaly,
        pvWtp,
        costPerQaly,
        netWtpBenefit,
        wtpSessionNonCost: util.wtpSessionNonCost
      };
    });

    renderTablesBase(scenarios, {
      cohortSize,
      baselineEndorse,
      sessionsPerYear,
      years,
      discountRate,
      qalyPerEngagedPerYear,
      wtpScale,
      annuityFactor
    });
    renderChartsBase(scenarios);

    const status = $(
      "status-message"
    );
    if (status) {
      status.textContent =
        "Base-case results updated using the ECL preference estimates, current cohort, QALY and WTP settings.";
    }
  }

  // ---- Sensitivity analysis ----
  function runSensitivityAnalysis() {
    const cohortSize = num("cohort-size", 1000);
    const baselineEndorse = Math.min(100, Math.max(0, num("baseline-endorsement", 20)));
    const sessionsPerYear = Math.max(1, Math.round(num("sessions-per-year", 12)));
    const years = Math.max(1, Math.round(num("time-horizon", 5)));

    const baseQalyPerEngagedPerYear = Math.max(
      0,
      num("qaly-per-engaged", 0.03)
    );
    const baseWtpScale = Math.max(0, num("wtp-scale", 1));

    const sensDiscount = Math.max(0, num("sens-discount-rate", 3));
    const sensQalyFactor = Math.max(0, num("sens-qaly-factor", 0.5));
    const sensWtpFactor = Math.max(0, num("sens-wtp-factor", 0.8));

    const qalyPerEngagedPerYear = baseQalyPerEngagedPerYear * sensQalyFactor;
    const wtpScale = baseWtpScale * sensWtpFactor;

    const annuityFactor = makeAnnuityFactor(years, sensDiscount);

    const scenarios = ["A", "B", "C"].map((label) => {
      const raw = getScenario(label);
      const util = computeScenarioUtility(raw);

      const additionalEndorsePct =
        util.pEndorse * (100 - baselineEndorse);
      const finalEndorsePct = baselineEndorse + additionalEndorsePct;
      const engaged = (cohortSize * finalEndorsePct) / 100;

      const totalSessionsPerYear = engaged * sessionsPerYear;
      const annualProgrammeCost = totalSessionsPerYear * util.cost;

      const annualQalyGain = engaged * qalyPerEngagedPerYear;
      const annualWtpBenefit =
        totalSessionsPerYear * util.wtpSessionNonCost * wtpScale;

      const pvCost = annualProgrammeCost * annuityFactor;
      const pvQaly = annualQalyGain * annuityFactor;
      const pvWtp = annualWtpBenefit * annuityFactor;
      const netWtpBenefit = pvWtp - pvCost;

      return {
        label,
        name: raw.name,
        pvCost,
        pvQaly,
        pvWtp,
        netWtpBenefit
      };
    });

    renderSensitivityTable(scenarios, {
      sensDiscount,
      sensQalyFactor,
      sensWtpFactor,
      years
    });
    renderNetBenefitChart(scenarios);

    const status = $(
      "status-message"
    );
    if (status) {
      status.textContent =
        "Sensitivity analysis updated using alternative discount, QALY scaling and WTP scaling assumptions.";
    }
  }

  // ---- Rendering: core tables ----
  function formatNumber(x, decimals) {
    if (!Number.isFinite(x)) return "–";
    return x.toLocaleString("en-AU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function renderTablesBase(scenarios, params) {
    const summaryBody = $("summary-table-body");
    const uptakeBody = $("uptake-table-body");
    const cbaBody = $("cba-table-body");

    if (!summaryBody || !uptakeBody || !cbaBody) return;

    summaryBody.innerHTML = "";
    uptakeBody.innerHTML = "";
    cbaBody.innerHTML = "";

    scenarios.forEach((s) => {
      // Summary row
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${s.name}</td>
        <td>${prettyType(s.supportType)}</td>
        <td>${prettyMethod(s.method)}</td>
        <td>${prettyFrequency(s.frequency)}</td>
        <td>${prettyDuration(s.duration)}</td>
        <td>${prettyAccess(s.access)}</td>
        <td class="numeric">${formatNumber(s.costPerSession, 2)}</td>
      `;
      summaryBody.appendChild(row);

      // Uptake row
      const uptakeRow = document.createElement("tr");
      uptakeRow.innerHTML = `
        <td>${s.name}</td>
        <td class="numeric">${formatNumber(s.pEndorse * 100, 1)}</td>
        <td class="numeric">${formatNumber(s.additionalEndorsePct, 1)}</td>
        <td class="numeric">${formatNumber(s.finalEndorsePct, 1)}</td>
        <td class="numeric">${formatNumber(s.engaged, 0)}</td>
        <td class="numeric">${formatNumber(s.totalSessionsPerYear, 0)}</td>
      `;
      uptakeBody.appendChild(uptakeRow);

      // CBA row
      const cbaRow = document.createElement("tr");
      cbaRow.innerHTML = `
        <td>${s.name}</td>
        <td class="numeric">${formatNumber(s.pvCost / 1_000, 1)}</td>
        <td class="numeric">${formatNumber(s.pvQaly, 3)}</td>
        <td class="numeric">${formatNumber(s.pvWtp / 1_000, 1)}</td>
        <td class="numeric">${formatNumber(s.netWtpBenefit / 1_000, 1)}</td>
        <td class="numeric">${s.costPerQaly ? formatNumber(s.costPerQaly, 0) : "–"}</td>
      `;
      cbaBody.appendChild(cbaRow);
    });
  }

  function prettyType(v) {
    if (v === "community") return "Community engagement";
    if (v === "counselling") return "Psychological counselling";
    if (v === "vr") return "Virtual reality";
    return "Peer support";
  }

  function prettyMethod(v) {
    if (v === "virtual") return "Virtual";
    if (v === "hybrid") return "Hybrid";
    return "In-person";
  }

  function prettyFrequency(v) {
    if (v === "weekly") return "Weekly";
    if (v === "monthly") return "Monthly";
    return "Daily";
  }

  function prettyDuration(v) {
    if (v === "120") return "2 hours";
    if (v === "240") return "4 hours";
    return "30 minutes";
  }

  function prettyAccess(v) {
    if (v === "local") return "Local area (up to 12 km)";
    if (v === "wider") return "Wider community (50+ km)";
    return "At home";
  }

  // ---- Rendering: sensitivity table ----
  function renderSensitivityTable(scenarios, params) {
    const body = $("sensitivity-table-body");
    if (!body) return;
    body.innerHTML = "";

    scenarios.forEach((s) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${s.name}</td>
        <td class="numeric">${formatNumber(s.pvCost / 1_000, 1)}</td>
        <td class="numeric">${formatNumber(s.pvQaly, 3)}</td>
        <td class="numeric">${formatNumber(s.pvWtp / 1_000, 1)}</td>
        <td class="numeric">${formatNumber(s.netWtpBenefit / 1_000, 1)}</td>
      `;
      body.appendChild(row);
    });
  }

  // ---- Charts ----
  function renderChartsBase(scenarios) {
    const labels = scenarios.map((s) => s.name);

    const endorsementCtx = $("endorsementChart")?.getContext("2d");
    const wtpCtx = $("wtpChart")?.getContext("2d");

    if (endorsementCtx) {
      const data = scenarios.map((s) => s.finalEndorsePct);
      if (endorsementChart) endorsementChart.destroy();
      endorsementChart = new Chart(endorsementCtx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Predicted endorsement (%)",
              data
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  formatNumber(ctx.parsed.y, 1) + "% predicted endorsement"
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => value + "%"
              }
            }
          }
        }
      });
    }

    if (wtpCtx) {
      const sessionsPerYear = Math.max(1, Math.round(num("sessions-per-year", 12)));
      const wtpScale = Math.max(0, num("wtp-scale", 1));
      const data = scenarios.map(
        (s) => s.wtpSessionNonCost * sessionsPerYear * wtpScale
      );

      if (wtpChart) wtpChart.destroy();
      wtpChart = new Chart(wtpCtx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Average WTP benefit per engaged participant per year (AUD)",
              data
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  "$" + formatNumber(ctx.parsed.y, 0) + " per engaged participant per year"
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => "$" + value
              }
            }
          }
        }
      });
    }
  }

  function renderNetBenefitChart(scenarios) {
    const ctx = $("netBenefitChart")?.getContext("2d");
    if (!ctx) return;

    const labels = scenarios.map((s) => s.name);
    const data = scenarios.map((s) => s.netWtpBenefit / 1_000); // AUD thousands

    if (netBenefitChart) netBenefitChart.destroy();
    netBenefitChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Net WTP benefit (PV, AUD thousands)",
            data
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                "Net WTP benefit: $" + formatNumber(ctx.parsed.y * 1_000, 0)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => "$" + value + "k"
            }
          }
        }
      }
    });
  }

  // ---- Export: PDF ----
  function exportPDF() {
    if (typeof window.jspdf === "undefined" && typeof window.jspdf === "undefined") {
      alert("jsPDF is not available.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text("LonelyLessAustralia Decision Aid – Summary", 10, 12);

    doc.setFontSize(10);
    doc.text("Base-case results (predicted uptake, QALYs and WTP benefits).", 10, 18);

    const summaryBody = $("summary-table-body");
    const uptakeBody = $("uptake-table-body");
    const cbaBody = $("cba-table-body");

    let y = 26;

    function addTableFromBody(title, headers, bodyEl) {
      if (!bodyEl) return;
      doc.setFontSize(11);
      doc.text(title, 10, y);
      y += 4;
      doc.setFontSize(8);

      const colWidth = 260 / headers.length;
      headers.forEach((h, idx) => {
        doc.text(h, 10 + colWidth * idx, y);
      });
      y += 4;

      Array.from(bodyEl.querySelectorAll("tr")).forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
          (td.textContent || "").trim()
        );
        cells.forEach((c, idx) => {
          doc.text(String(c), 10 + colWidth * idx, y);
        });
        y += 4;
        if (y > 190) {
          doc.addPage();
          y = 14;
        }
      });

      y += 6;
    }

    addTableFromBody(
      "Scenario definitions and costs",
      ["Scenario", "Type", "Method", "Frequency", "Duration", "Access", "Cost/session"],
      summaryBody
    );

    addTableFromBody(
      "Predicted uptake and engagement",
      [
        "Scenario",
        "P(endorse)",
        "Δ endorsement",
        "Final endorsement",
        "Engaged",
        "Sessions/year"
      ],
      uptakeBody
    );

    addTableFromBody(
      "Costs, QALYs and WTP (present value, AUD)",
      [
        "Scenario",
        "PV cost (k)",
        "PV QALYs",
        "PV WTP (k)",
        "Net WTP (k)",
        "Cost/QALY"
      ],
      cbaBody
    );

    doc.save("LonelyLessAustralia_summary.pdf");
  }

  // ---- Export: Excel ----
  function exportExcel() {
    if (typeof XLSX === "undefined") {
      alert("SheetJS (XLSX) is not available.");
      return;
    }

    const wb = XLSX.utils.book_new();

    function sheetFromTableBody(name, headers, bodyId) {
      const bodyEl = $(bodyId);
      if (!bodyEl) return;
      const rows = [];
      rows.push(headers);
      Array.from(bodyEl.querySelectorAll("tr")).forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
          (td.textContent || "").trim()
        );
        rows.push(cells);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    sheetFromTableBody("Summary", [
      "Scenario",
      "Type",
      "Method",
      "Frequency",
      "Duration",
      "Access",
      "Cost per session (AUD)"
    ], "summary-table-body");

    sheetFromTableBody("Uptake", [
      "Scenario",
      "P(endorsement) (%)",
      "Change in endorsement (percentage points)",
      "Final endorsement (%)",
      "Engaged participants",
      "Sessions per year"
    ], "uptake-table-body");

    sheetFromTableBody("CBA_PV", [
      "Scenario",
      "PV cost (AUD thousands)",
      "PV QALYs",
      "PV WTP benefit (AUD thousands)",
      "Net WTP benefit (AUD thousands)",
      "Cost per QALY (AUD)"
    ], "cba-table-body");

    XLSX.writeFile(wb, "LonelyLessAustralia_results.xlsx");
  }

  // ---- Technical appendix content ----
  function populateTechnicalAppendix() {
    const el = $("technical-appendix-body");
    if (!el) return;

    // Embedded HTML text: brief methods description and key assumptions with references
    el.innerHTML = `
      <p>
        This technical appendix summarises how the LonelyLessAustralia Decision Aid translates
        discrete choice experiment (DCE) estimates into predicted programme uptake, quality-adjusted
        life year (QALY) gains and willingness-to-pay (WTP) based monetary benefits.
      </p>

      <h3>1. Preference estimates and choice model</h3>
      <p>
        Preferences were obtained from an ensemble choice model (ECL) estimated on a DCE in which
        older adults evaluated hypothetical support programmes designed to reduce loneliness.
        Attributes were: type of support (peer support, community engagement, psychological
        counselling, virtual reality), method of engagement (in-person, virtual, hybrid),
        frequency (daily, weekly, monthly), duration (30 minutes, 2 hours, 4 hours),
        accessibility (at home, local area, wider community travel) and out-of-pocket cost per
        session. Programmes were chosen relative to a “no programme” opt-out.
      </p>
      <p>
        The tool uses the mean ECL coefficients (β) as a standard multinomial logit model with
        one programme alternative and one opt-out. For a given scenario <em>j</em>, the latent
        utility of the programme is:
      </p>
      <p>
        <code>
          U<sub>j</sub> = ASC<sub>prog</sub> + Σ<sub>k</sub> β<sub>k</sub> x<sub>jk</sub> + β<sub>cost</sub> · Cost<sub>j</sub>
        </code>
      </p>
      <p>
        where <code>x<sub>jk</sub></code> are dummy-coded attributes and
        <code>β<sub>cost</sub> &lt; 0</code>. The opt-out utility is
        <code>U<sub>0</sub> = ASC<sub>opt</sub></code>. The probability that a respondent
        endorses the programme rather than the opt-out is:
      </p>
      <p>
        <code>
          P<sub>endorse,j</sub> = exp(U<sub>j</sub>) / [exp(U<sub>j</sub>) + exp(U<sub>0</sub>)].
        </code>
      </p>

      <h3>2. From endorsement probabilities to engaged participants</h3>
      <p>
        Let the eligible cohort size be <em>N</em> and the baseline proportion already
        participating in some support be <em>b</em> (in percent). The model assumes that the new
        programme only affects the remaining share <code>(100 − b)</code>, and that
        <code>P<sub>endorse,j</sub></code> is the probability that a person in this group
        would take up the programme if offered.
      </p>
      <p>
        The incremental increase in endorsement attributable to scenario <em>j</em> is:
      </p>
      <p>
        <code>
          ΔEndorse<sub>j</sub> = P<sub>endorse,j</sub> · (100 − b).
        </code>
      </p>
      <p>
        The resulting overall endorsement rate and the number of engaged participants are:
      </p>
      <p>
        <code>
          Endorse<sub>final,j</sub> = b + ΔEndorse<sub>j</sub>,<br/>
          Engaged<sub>j</sub> = N · Endorse<sub>final,j</sub> / 100.
        </code>
      </p>
      <p>
        This structure ensures that when baseline endorsement is high, the absolute room for
        improvement is limited, even if the programme is highly attractive. It also aligns with
        the wider empirical literature that sees loneliness as a prevalent but not universal
        condition in later life, and recognises ceiling effects in participation rates.
      </p>

      <h3>3. QALY-based outcome modelling</h3>
      <p>
        Loneliness and social isolation are consistently associated with lower health-related
        quality of life (HRQoL) and higher mortality risk among older adults. Meta-analytic
        evidence suggests that loneliness is associated with an elevated mortality risk on the
        order of 25%, comparable to the impact of many established cardiovascular risk factors
        (Holt-Lunstad et al., 2015). At the same time, loneliness is correlated with poorer
        HRQoL scores on generic instruments such as EQ-5D and SF-12 (for example, higher
        loneliness is associated with lower physical and mental component scores and reduced
        utility values). In economic evaluations of broader health promotion programmes for
        community-dwelling older people, small but meaningful QALY gains in the range of a few
        hundredths of a QALY per person over several years have been reported (Zingmark et al., 2019).
      </p>
      <p>
        Direct QALY estimates for loneliness-specific interventions are still scarce. The tool
        therefore treats the average QALY gain per engaged participant per year,
        <code>ΔQALY<sub>per_engaged</sub></code>, as a user-specified parameter with a default
        of 0.03. This is intended to represent a modest but policy-relevant improvement in
        overall HRQoL among older adults who take up and remain in a programme that successfully
        reduces loneliness and improves social connectedness. Users can adjust this parameter
        up or down in sensitivity analysis if they consider the default assumption too
        optimistic or conservative for a given intervention.
      </p>
      <p>
        Given the number of engaged participants and the assumed QALY gain, annual QALYs
        generated by scenario <em>j</em> are:
      </p>
      <p>
        <code>
          QALY<sub>year,j</sub> = Engaged<sub>j</sub> · ΔQALY<sub>per_engaged</sub>.
        </code>
      </p>
      <p>
        A constant annual QALY stream over the time horizon <em>T</em> years is then discounted
        at rate <em>r</em> to obtain a present value:
      </p>
      <p>
        <code>
          PV(QALY)<sub>j</sub> = QALY<sub>year,j</sub> · Σ<sub>t=1</sub><sup>T</sup> 1 / (1 + r)<sup>t</sup>.
        </code>
      </p>
      <p>
        In the Australian context, national guidance for pharmaceutical and medical services
        submissions has historically recommended a 5% annual discount rate for both costs and
        health outcomes (see, for example, analyses that cite the Pharmaceutical Benefits
        Advisory Committee and Medical Services Advisory Committee guidelines, such as
        Bijkerk et al., 2015). Internationally, 3% is widely used in cost-effectiveness
        modelling and is endorsed in many global health guidance documents. The tool therefore
        uses 5% as a natural starting point but allows users to vary the discount rate, including
        sensitivity analyses at 3% and other values.
      </p>

      <h3>4. Programme costs</h3>
      <p>
        The costing module focuses on variable programme costs that scale with the number of
        sessions delivered. For a given scenario <em>j</em>, let
        <code>CostSession<sub>j</sub></code> be the out-of-pocket cost per session faced by
        participants, and let <code>S</code> be the average number of sessions per participant
        per year. Annual programme expenditure borne by participants (or equivalently the
        notional financial volume of the programme if costs are subsidised) is:
      </p>
      <p>
        <code>
          Cost<sub>year,j</sub> = Engaged<sub>j</sub> · S · CostSession<sub>j</sub>.
        </code>
      </p>
      <p>
        Present value costs are obtained by discounting the constant annual cost stream over the
        time horizon:
      </p>
      <p>
        <code>
          PV(Cost)<sub>j</sub> = Cost<sub>year,j</sub> · Σ<sub>t=1</sub><sup>T</sup> 1 / (1 + r)<sup>t</sup>.
        </code>
      </p>
      <p>
        The current implementation does not include fixed start-up or infrastructure costs
        (for example, training, IT systems, or venue refurbishment). These can be incorporated
        by adding fixed amounts per scenario in parallel to the variable cost stream, or by
        spreading one-off investments as equivalent annual costs.
      </p>

      <h3>5. WTP-based benefit valuation</h3>
      <p>
        Because the DCE included a cost attribute, the estimated preference parameters can be
        used to derive the marginal WTP for non-monetary attributes of each programme. For a
        vector of non-cost attribute coefficients <code>β<sub>attr</sub></code> and the cost
        coefficient <code>β<sub>cost</sub> &lt; 0</code>, the WTP measure for a given attribute
        combination is calculated as:
      </p>
      <p>
        <code>
          WTP<sub>session,j</sub> = Σ<sub>k∈attr</sub> β<sub>k</sub> x<sub>jk</sub> / (−β<sub>cost</sub>),
        </code>
      </p>
      <p>
        where <code>WTP<sub>session,j</sub></code> is interpreted as the implied monetary value
        per session that respondents attach to the non-cost features of scenario <em>j</em>. This
        value does not include the programme’s out-of-pocket price; it reflects the underlying
        benefit of receiving more suitable or attractive support. The model then computes an
        annual WTP flow:
      </p>
      <p>
        <code>
          WTP<sub>year,j</sub> = Engaged<sub>j</sub> · S · WTP<sub>session,j</sub> · Scale<sub>WTP</sub>,
        </code>
      </p>
      <p>
        where <code>Scale<sub>WTP</sub></code> is a scaling factor that users can use in
        sensitivity analysis to account for potential differences between stated WTP in the DCE
        and real-world payment behaviour (for example, to down-weight stated WTP if there is
        concern about hypothetical bias). The present value of WTP-based benefits is:
      </p>
      <p>
        <code>
          PV(WTP)<sub>j</sub> = WTP<sub>year,j</sub> · Σ<sub>t=1</sub><sup>T</sup> 1 / (1 + r)<sup>t</sup>.
        </code>
      </p>
      <p>
        Net monetary benefit based on WTP is computed as <code>PV(WTP)<sub>j</sub> − PV(Cost)<sub>j</sub></code>.
        This can be interpreted as a measure of consumer surplus generated by scenario <em>j</em>,
        under the assumption that the DCE captures preferences of the relevant population.
      </p>

      <h3>6. Interpretation and limitations</h3>
      <p>
        The tool is deliberately conservative in how it translates preferences into economic
        outcomes. In particular:
      </p>
      <ul>
        <li>
          QALY gains are modelled at the level of overall HRQoL rather than direct mortality,
          even though loneliness is associated with increased mortality risk and morbidity.
        </li>
        <li>
          Only direct programme participation costs are included; impacts on health and social
          care utilisation (for example, reduced GP visits or hospital admissions) are excluded
          by default, although evaluators can layer these on top where data are available.
        </li>
        <li>
          WTP measures are derived from stated preferences in a survey, which may overstate
          or understate real-world WTP. The scaling parameter and scenario-based sensitivity
          analysis are intended to help explore plausible ranges.
        </li>
      </ul>
      <p>
        Nonetheless, combining a preference-based WTP measure with QALY gains and cost streams
        provides a structured way to explore the value case for different programme designs
        that aim to reduce loneliness among older adults. This aligns with economic arguments
        for investing in loneliness interventions, including evidence that effective programmes
        such as telephone befriending, group activities and tailored social support can improve
        wellbeing and may yield favourable returns when downstream health and care costs are
        considered (for example, evaluations of telephone befriending services for older people
        in Victoria, Australia, and broader economic case studies of loneliness interventions).
      </p>

      <h3>7. Key empirical sources</h3>
      <p>
        The default assumptions and structure draw on the following strands of evidence:
      </p>
      <ul>
        <li>
          Associations between loneliness, social isolation and mortality risk, as synthesised
          in a large meta-analysis of longitudinal studies (Holt-Lunstad et al., 2015).
        </li>
        <li>
          Evidence that geriatric health promotion and social support programmes can generate
          small but meaningful QALY gains for community-dwelling older adults over multi-year
          horizons (Zingmark et al., 2019).
        </li>
        <li>
          Policy reports making the economic case for investing in loneliness interventions,
          which summarise emerging cost–utility data and modelled benefits (for example,
          McDaid et al., 2017).
        </li>
        <li>
          Practical evaluations of telephone befriending services for older people in Australia,
          highlighting improvements in wellbeing and reduced loneliness from regular social
          contact by phone (Victorian age sector evaluations of befriending programmes).
        </li>
        <li>
          Australian health technology assessment practice regarding discount rates, as
          reflected in economic evaluations that cite the Pharmaceutical Benefits Advisory
          Committee and Medical Services Advisory Committee guidance recommending 5% annual
          discounting for costs and outcomes in base-case models (for example, Bijkerk et al., 2015).
        </li>
      </ul>
      <p>
        As new empirical estimates of QALY gains and cost-effectiveness for loneliness
        interventions become available, the default parameters in the tool can be updated
        to align more closely with specific programme types and local data.
      </p>
    `;
  }

  // ---- Technical appendix modal controls ----
  function openTechnicalAppendix() {
    const backdrop = $("technical-appendix-modal");
    if (!backdrop) return;
    backdrop.classList.add("is-open");
  }

  function closeTechnicalAppendix() {
    const backdrop = $("technical-appendix-modal");
    if (!backdrop) return;
    backdrop.classList.remove("is-open");
  }

  // ---- Reset inputs ----
  function resetInputs() {
    // Keeps it simple: reload page (preserves HTML defaults)
    window.location.reload();
  }

  // ---- Event wiring ----
  document.addEventListener("DOMContentLoaded", function () {
    const btnRun = $("run-analysis");
    const btnSens = $("run-sensitivity");
    const btnPdf = $("export-pdf");
    const btnExcel = $("export-excel");
    const btnReset = $("reset-inputs");
    const btnOpenTA = $("open-technical-appendix");
    const btnCloseTA = $("close-technical-appendix");
    const modalBackdrop = $("technical-appendix-modal");

    if (btnRun) btnRun.addEventListener("click", runBaseAnalysis);
    if (btnSens) btnSens.addEventListener("click", runSensitivityAnalysis);
    if (btnPdf) btnPdf.addEventListener("click", exportPDF);
    if (btnExcel) btnExcel.addEventListener("click", exportExcel);
    if (btnReset) btnReset.addEventListener("click", resetInputs);
    if (btnOpenTA) btnOpenTA.addEventListener("click", openTechnicalAppendix);
    if (btnCloseTA) btnCloseTA.addEventListener("click", closeTechnicalAppendix);

    if (modalBackdrop) {
      modalBackdrop.addEventListener("click", function (e) {
        if (e.target === modalBackdrop) {
          closeTechnicalAppendix();
        }
      });
    }

    populateTechnicalAppendix();
    runBaseAnalysis();
  });
})();

/* Key external sources supporting assumptions and structure:
   Holt-Lunstad et al. on loneliness and mortality; Zingmark et al. on QALY gains in older
   people health promotion; economic case work on loneliness interventions by McDaid et al.;
   Victorian telephone befriending evaluations; and Australian practice on discounting as
   reflected in studies citing PBAC/MSAC guidance. :contentReference[oaicite:0]{index=0} */
