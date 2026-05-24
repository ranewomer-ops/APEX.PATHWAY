import {
  BUILD_STATUS,
  MAINTENANCE_STATUS,
  PART_STATUS,
  calculateBudget,
  escapeHtml,
  estimatePerformance,
  formatCurrency,
  formatDate,
  formatNumber,
  getMaintenanceStatus,
  getPhaseSummary,
  groupBy
} from "./utils.js";

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "planner", label: "Planner", icon: "sparkles" },
  { id: "build", label: "Build Details", icon: "car" },
  { id: "parts", label: "Parts", icon: "wrench" },
  { id: "budget", label: "Budget", icon: "wallet-cards" },
  { id: "timeline", label: "Timeline", icon: "git-branch" },
  { id: "maintenance", label: "Maintenance", icon: "clipboard-check" },
  { id: "performance", label: "Performance", icon: "gauge" }
];

const PAGE_COPY = {
  dashboard: ["Dashboard", "Live build status, budget posture, and next operational actions."],
  planner: ["Apex AI Build Agent", "Describe the customer's car and goal. The agent creates an editable build plan."],
  build: ["Build Details", "Vehicle identity, build status, and user-owned project setup."],
  parts: ["Parts Management", "Editable part records with status-driven progress."],
  budget: ["Budget", "Automatic totals calculated from the current build parts."],
  timeline: ["Timeline", "Read-only project history generated from part status changes."],
  maintenance: ["Maintenance", "Independent service tracking for the selected build."],
  performance: ["Performance Estimator", "Boosted power range modeling with reliability warnings."]
};

export function renderApp(state, route, estimator, notice) {
  if (state.booting) {
    return renderBoot();
  }

  return renderShell(state, route, estimator, notice);
}

export function renderEstimatorResult(estimator) {
  const result = estimatePerformance(estimator);
  const warnings = result.warnings
    .map((warning) => `
      <div class="warning-item">
        <i data-lucide="triangle-alert" class="mini-icon"></i>
        <span>${escapeHtml(warning)}</span>
      </div>
    `)
    .join("");

  return `
    <div class="range-value">
      <span>Estimated output range</span>
      <strong>${formatNumber(result.lowHp)} - ${formatNumber(result.highHp)} hp</strong>
    </div>
    <div class="grid-2">
      <div class="metric">
        <span>Estimated gain</span>
        <strong>${formatNumber(result.lowGain)} - ${formatNumber(result.highGain)} hp</strong>
        <small>Calculated as a range to avoid false precision.</small>
      </div>
      <div class="metric">
        <span>Efficiency factor</span>
        <strong>${Math.round(Number(estimator.efficiency) * 100)}%</strong>
        <small>Lower values are safer for heat, fuel, and driveline losses.</small>
      </div>
    </div>
    <div class="warning-list">${warnings}</div>
  `;
}

function renderBoot() {
  return `
    <div class="boot-screen">
      <img src="./assets/apex-logo.png" alt="Apex Pathway">
      <p>Loading Apex Pathway</p>
    </div>
  `;
}

function renderShell(state, route, estimator, notice) {
  const page = NAV_ITEMS.some((item) => item.id === route) ? route : "dashboard";
  const [title, subtitle] = PAGE_COPY[page];
  const build = getCurrentBuild(state);

  return `
    <div class="app-shell">
      <div class="mobile-bar">
        <button class="btn icon-only ghost" type="button" data-action="toggle-nav" aria-label="Open navigation">
          <i data-lucide="menu"></i>
        </button>
        <img src="./assets/apex-logo.png" alt="Apex Pathway">
      </div>
      ${renderSidebar(state, page)}
      <main class="workspace">
        <header class="topbar">
          <div class="page-title">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="topbar-actions">
            ${renderBuildSelector(state)}
          </div>
        </header>
        ${renderNotice(notice || state.error)}
        ${state.loading ? `<div class="skeleton"></div>` : renderPage(page, state, build, estimator)}
      </main>
    </div>
  `;
}

function renderSidebar(state, page) {
  const nav = NAV_ITEMS.map((item) => `
    <a class="nav-link${item.id === page ? " active" : ""}" href="#/${item.id}" data-nav-link>
      <i data-lucide="${item.icon}"></i>
      ${escapeHtml(item.label)}
    </a>
  `).join("");

  return `
    <aside class="sidebar" aria-label="Apex Pathway navigation">
      <div class="brand">
        <img src="./assets/apex-logo.png" alt="Apex Pathway">
        <div class="brand-title">
          <strong>Apex Pathway</strong>
        </div>
      </div>
      <nav class="side-nav">${nav}</nav>
    </aside>
  `;
}

function renderBuildSelector(state) {
  const options = state.builds.map((build) => `
    <option value="${escapeHtml(build.id)}"${build.id === state.currentBuildId ? " selected" : ""}>
      ${escapeHtml(build.name)}
    </option>
  `).join("");

  return `
    <div class="field build-select">
      <span>Current build</span>
      <select data-action="select-build" ${state.builds.length ? "" : "disabled"}>
        ${state.builds.length ? options : `<option>No builds yet</option>`}
      </select>
    </div>
  `;
}

function renderPage(page, state, build, estimator) {
  if (!["build", "planner"].includes(page) && !build) {
    return renderNoBuild();
  }

  switch (page) {
    case "planner":
      return renderPlannerPage();
    case "build":
      return renderBuildPage(state, build);
    case "parts":
      return renderPartsPage(state.parts);
    case "budget":
      return renderBudgetPage(state.parts);
    case "timeline":
      return renderTimelinePage(state.parts, state.timelineEvents);
    case "maintenance":
      return renderMaintenancePage(state.maintenanceItems, state.maintenanceHistory);
    case "performance":
      return renderPerformancePage(estimator);
    case "dashboard":
    default:
      return renderDashboard(state, build);
  }
}

function renderNoBuild() {
  return `
    <section class="empty-state">
      <h2>No build selected</h2>
      <p>Create your first Apex Pathway build to unlock the dashboard.</p>
      <a class="btn primary" href="#/build">
        <i data-lucide="plus"></i>
        Create build
      </a>
    </section>
  `;
}

function renderDashboard(state, build) {
  if (!build) {
    return renderNoBuild();
  }

  const budget = calculateBudget(state.parts);
  const completed = state.parts.filter((part) => part.status === "completed").length;
  const nextService = getNextService(state.maintenanceItems);
  const recentTimeline = state.timelineEvents.slice(0, 4);

  return `
    <div class="content-grid">
      <section class="hero-panel">
        <h2>${escapeHtml(build.name)}</h2>
        <p>${escapeHtml(build.car_model)} is currently marked as ${escapeHtml(BUILD_STATUS[build.status] || build.status)}.</p>
      </section>

      <section class="grid-4">
        ${renderMetric("Total budget", formatCurrency(budget.total), "Sum of all part prices")}
        ${renderMetric("Spent", formatCurrency(budget.spent), "Parts ordered, installed, or completed")}
        ${renderMetric("Remaining", formatCurrency(budget.remaining), "Planned part cost still open")}
        ${renderMetric("Completed parts", `${completed}/${state.parts.length}`, "Status marked completed")}
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <h2>Budget posture</h2>
              <p>Calculated from the current build's editable part records.</p>
            </div>
            <span class="badge installed">${budget.percent}% spent</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${budget.percent}%"></div>
          </div>
          ${renderBudgetRows(state.parts)}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h2>Part phases</h2>
              <p>Status distribution for the selected build.</p>
            </div>
          </div>
          ${renderPhaseRows(state.parts)}
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <h2>Recent timeline</h2>
              <p>Generated automatically when part statuses change.</p>
            </div>
          </div>
          ${recentTimeline.length ? renderTimelineList(recentTimeline) : renderInlineEmpty("No generated timeline events yet.")}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h2>Next maintenance</h2>
              <p>Independent service tracking for this build.</p>
            </div>
            ${nextService ? renderMaintenanceBadge(nextService) : ""}
          </div>
          ${nextService ? `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(nextService.item)}</strong>
                <div class="muted-copy">Next due ${formatDate(nextService.next_due_date)}</div>
              </div>
              <a class="btn secondary" href="#/maintenance">Open</a>
            </div>
          ` : renderInlineEmpty("No maintenance items created.")}
        </div>
      </section>
    </div>
  `;
}

function renderBuildPage(state, build) {
  return `
    <div class="content-grid">
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Create build</h2>
            <p>Builds are saved locally in this browser.</p>
          </div>
        </div>
        <form class="form-stack" data-form="create-build">
          <div class="form-grid three">
            <div class="field">
              <label for="new-build-name">Build name</label>
              <input id="new-build-name" name="name" placeholder="E39 M112 Track Build" required>
            </div>
            <div class="field">
              <label for="new-car-model">Car model</label>
              <input id="new-car-model" name="car_model" placeholder="Customer vehicle" required>
            </div>
            <div class="field">
              <label for="new-build-status">Status</label>
              <select id="new-build-status" name="status">${renderOptions(BUILD_STATUS, "planning")}</select>
            </div>
          </div>
          <button class="btn primary" type="submit">
            <i data-lucide="plus"></i>
            Add build
          </button>
        </form>
      </section>

      ${build ? `
        <section class="card">
          <div class="card-header">
            <div>
              <h2>Selected build</h2>
              <p>Budget is not manually editable. It is synced from part prices.</p>
            </div>
            <span class="badge installed">${formatCurrency(build.budget_total || 0)}</span>
          </div>
          <form class="form-stack" data-form="update-build">
            <div class="form-grid three">
              <div class="field">
                <label for="build-name">Build name</label>
                <input id="build-name" name="name" value="${escapeHtml(build.name)}" required>
              </div>
              <div class="field">
                <label for="car-model">Car model</label>
                <input id="car-model" name="car_model" value="${escapeHtml(build.car_model)}" required>
              </div>
              <div class="field">
                <label for="build-status">Status</label>
                <select id="build-status" name="status">${renderOptions(BUILD_STATUS, build.status)}</select>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn secondary" type="submit">
                <i data-lucide="save"></i>
                Save build
              </button>
              <button class="btn danger" type="button" data-action="delete-build" data-id="${escapeHtml(build.id)}">
                <i data-lucide="trash-2"></i>
                Delete build
              </button>
            </div>
          </form>
        </section>
        ${renderBuildPlanSummary(build)}
      ` : ""}
    </div>
  `;
}

function renderPlannerPage() {
  return `
    <div class="content-grid">
      <section class="agent-hero">
        <div>
          <p class="eyebrow">Apex AI Build Agent</p>
          <h2>Turn a rough customer idea into a structured build.</h2>
          <p>It reads the brief, detects the vehicle and power goal, estimates parts, budget, horsepower range, project time, and a milestone timeline.</p>
        </div>
        <div class="agent-orbit" aria-hidden="true">
          <i data-lucide="brain-circuit"></i>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2>Ask the agent</h2>
            <p>Use plain language. Include car, current mods, power goal, budget, fuel, daily/track use, and any reliability concerns.</p>
          </div>
        </div>
        <form class="form-stack" data-form="create-plan">
          <div class="field">
            <label for="customer-brief">Customer brief</label>
            <textarea id="customer-brief" name="customer_brief" required placeholder="Customer has a turbo car, wants more power, a safe tune, cooling, exhaust, better brakes, and a clear budget/timeline."></textarea>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="build-name">Build name</label>
              <input id="build-name" name="build_name" placeholder="Customer performance build">
            </div>
          </div>
          <button class="btn primary" type="submit">
            <i data-lucide="sparkles"></i>
            Generate editable build plan
          </button>
        </form>
      </section>

      <section class="grid-3">
        ${renderAgentCapability("Detects the platform", "Looks for engine family, forced induction type, use case, and upgrade stage from the customer's wording.", "scan-search")}
        ${renderAgentCapability("Creates a build sheet", "Generates editable parts, costs, categories, HP range, and timeline milestones.", "list-checks")}
        ${renderAgentCapability("Keeps it realistic", "Adds inspection, tuning, cooling, validation, and reliability notes before chasing headline numbers.", "shield-check")}
      </section>
    </div>
  `;
}

function renderAgentCapability(title, copy, icon) {
  return `
    <article class="agent-card">
      <div class="agent-card-icon">
        <i data-lucide="${icon}"></i>
      </div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(copy)}</p>
    </article>
  `;
}

function renderBuildPlanSummary(build) {
  if (!build.package_name && !build.customer_brief) {
    return "";
  }

  const milestones = safeArray(build.plan_milestones);

  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2>Customer plan summary</h2>
          <p>${escapeHtml(build.customer_brief || "No customer brief saved.")}</p>
        </div>
        ${build.package_name ? `<span class="badge installed">${escapeHtml(build.package_name)}</span>` : ""}
      </div>
      <div class="grid-4">
        ${renderMetric("Stock HP", build.stock_hp ? `${build.stock_hp} hp` : "Not set", "Baseline estimate")}
        ${renderMetric("Estimated HP", build.estimated_hp_low ? `${build.estimated_hp_low}-${build.estimated_hp_high} hp` : "Not set", "After planned upgrades")}
        ${renderMetric("Gain", build.estimated_gain_low ? `+${build.estimated_gain_low}-${build.estimated_gain_high} hp` : "Not set", "Expected range")}
        ${renderMetric("Time", build.estimated_time_weeks || "Not set", "Estimated completion")}
      </div>
      ${build.plan_notes ? `<div class="quote-block">${escapeHtml(build.plan_notes)}</div>` : ""}
      ${milestones.length ? `
        <div class="template-list">
          <h3>Estimated timeline</h3>
          ${milestones.map((milestone) => `
            <div class="timeline-event">
              <div class="timeline-pin"></div>
              <div class="timeline-body">
                <strong>${escapeHtml(milestone.label)} - ${escapeHtml(milestone.title)}</strong>
                <span>${escapeHtml(milestone.detail)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderPartsPage(parts) {
  return `
    <div class="content-grid">
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Add part</h2>
            <p>Status changes generate timeline events automatically.</p>
          </div>
        </div>
        <form class="form-stack" data-form="create-part">
          <div class="form-grid">
            <div class="field">
              <label for="part-name">Part name</label>
              <input id="part-name" name="name" placeholder="Turbo kit, brake pads, ECU tune" required>
            </div>
            <div class="field">
              <label for="part-category">Category</label>
              <input id="part-category" name="category" placeholder="Forced induction">
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="part-price">Price</label>
              <input id="part-price" name="price" type="number" min="0" step="0.01" placeholder="0">
            </div>
            <div class="field">
              <label for="part-status">Status</label>
              <select id="part-status" name="status">${renderOptions(PART_STATUS, "planned")}</select>
            </div>
          </div>
          <button class="btn primary" type="submit">
            <i data-lucide="plus"></i>
            Add part
          </button>
        </form>
      </section>

      <section class="table-shell desktop-table">
        <table class="data-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${parts.length ? parts.map(renderPartRow).join("") : `<tr><td colspan="5">${renderInlineEmpty("No parts added.")}</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="mobile-cards">
        ${parts.length ? parts.map(renderPartMobile).join("") : renderInlineEmpty("No parts added.")}
      </section>
    </div>
  `;
}

function renderPartRow(part) {
  return `
    <tr>
      <td>
        <input class="input" data-action="part-name" data-id="${escapeHtml(part.id)}" value="${escapeHtml(part.name)}">
      </td>
      <td>
        <input class="input" data-action="part-category" data-id="${escapeHtml(part.id)}" value="${escapeHtml(part.category || "")}">
      </td>
      <td>
        <input class="input" data-action="part-price" data-id="${escapeHtml(part.id)}" type="number" min="0" step="0.01" value="${escapeHtml(part.price ?? 0)}">
      </td>
      <td>
        <select class="compact-select" data-action="part-status" data-id="${escapeHtml(part.id)}">
          ${renderOptions(PART_STATUS, part.status)}
        </select>
      </td>
      <td>
        <div class="row-actions">
          <button class="btn danger icon-only" type="button" data-action="delete-part" data-id="${escapeHtml(part.id)}" aria-label="Delete part">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderPartMobile(part) {
  return `
    <article class="mobile-item">
      <div class="mobile-item-head">
        <div>
          <strong>${escapeHtml(part.name)}</strong>
          <div class="muted-copy">${escapeHtml(part.category || "General")}</div>
        </div>
        <span class="badge ${escapeHtml(part.status)}">${escapeHtml(PART_STATUS[part.status] || part.status)}</span>
      </div>
      <div class="form-stack">
        <div class="form-grid">
          <div class="field">
            <span>Price</span>
            <input data-action="part-price" data-id="${escapeHtml(part.id)}" type="number" min="0" step="0.01" value="${escapeHtml(part.price ?? 0)}">
          </div>
          <div class="field">
            <span>Status</span>
            <select data-action="part-status" data-id="${escapeHtml(part.id)}">${renderOptions(PART_STATUS, part.status)}</select>
          </div>
        </div>
        <button class="btn danger" type="button" data-action="delete-part" data-id="${escapeHtml(part.id)}">
          <i data-lucide="trash-2"></i>
          Delete
        </button>
      </div>
    </article>
  `;
}

function renderBudgetPage(parts) {
  const budget = calculateBudget(parts);
  const byCategory = Object.entries(groupBy(parts, "category"));
  const byStatus = Object.keys(PART_STATUS).map((status) => ({
    status,
    label: PART_STATUS[status],
    total: parts.filter((part) => part.status === status).reduce((sum, part) => sum + Number(part.price || 0), 0)
  }));

  return `
    <div class="content-grid">
      <section class="grid-3">
        ${renderMetric("Total budget", formatCurrency(budget.total), "Sum of all parts")}
        ${renderMetric("Spent budget", formatCurrency(budget.spent), "Status is not planned")}
        ${renderMetric("Remaining", formatCurrency(budget.remaining), "Planned part cost")}
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2>Budget progress</h2>
            <p>One calculation path prevents duplicate totals and NaN states.</p>
          </div>
          <span class="badge installed">${budget.percent}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${budget.percent}%"></div>
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-header"><h2>By category</h2></div>
          ${byCategory.length ? byCategory.map(([category, items]) => {
            const total = items.reduce((sum, part) => sum + Number(part.price || 0), 0);
            return `
              <div class="budget-row">
                <span>${escapeHtml(category)}</span>
                <strong>${formatCurrency(total)}</strong>
              </div>
            `;
          }).join("") : renderInlineEmpty("No budget data yet.")}
        </div>
        <div class="card">
          <div class="card-header"><h2>By status</h2></div>
          ${byStatus.map((item) => `
            <div class="budget-row">
              <span class="status-label"><span class="dot ${item.status}"></span>${escapeHtml(item.label)}</span>
              <strong>${formatCurrency(item.total)}</strong>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderTimelinePage(parts, events) {
  return `
    <div class="content-grid">
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Generated phases</h2>
            <p>Phase state is derived from part statuses only.</p>
          </div>
        </div>
        <div class="phase-grid">
          ${getPhaseSummary(parts).map((phase) => `
            <article class="phase-card">
              <span class="badge ${phase.status}">${escapeHtml(phase.label)}</span>
              <strong>${phase.count} parts</strong>
              <div class="progress-track">
                <div class="progress-fill" style="width:${phase.percent}%"></div>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h2>Timeline events</h2>
            <p>Read-only events are generated when part statuses change.</p>
          </div>
        </div>
        ${events.length ? renderTimelineList(events) : renderInlineEmpty("No timeline events yet. Update a part status to generate one.")}
      </section>
    </div>
  `;
}

function renderMaintenancePage(items, history) {
  return `
    <div class="content-grid">
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Add maintenance</h2>
            <p>Maintenance is independent from parts, budget, and timeline.</p>
          </div>
        </div>
        <form class="form-stack" data-form="create-maintenance">
          <div class="form-grid">
            <div class="field">
              <label for="maint-item">Item</label>
              <input id="maint-item" name="item" placeholder="Oil change, brakes, alignment" required>
            </div>
            <div class="field">
              <label for="maint-cost">Cost</label>
              <input id="maint-cost" name="cost" type="number" min="0" step="0.01" placeholder="0">
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="interval-km">Interval km</label>
              <input id="interval-km" name="interval_km" type="number" min="0" step="1">
            </div>
            <div class="field">
              <label for="interval-months">Interval months</label>
              <input id="interval-months" name="interval_months" type="number" min="0" step="1">
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="last-done">Last done date</label>
              <input id="last-done" name="last_done_date" type="date">
            </div>
            <div class="field">
              <label for="next-due">Next due date</label>
              <input id="next-due" name="next_due_date" type="date">
            </div>
          </div>
          <button class="btn primary" type="submit">
            <i data-lucide="plus"></i>
            Add maintenance
          </button>
        </form>
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Checklist</h2></div>
          ${items.length ? items.map(renderMaintenanceItem).join("") : renderInlineEmpty("No maintenance items yet.")}
        </div>
        <div class="card">
          <div class="card-header"><h2>History</h2></div>
          ${history.length ? history.map((entry) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(entry.item)}</strong>
                <div class="muted-copy">${formatDate(entry.done_date)} - ${formatCurrency(entry.cost || 0)}</div>
              </div>
            </div>
          `).join("") : renderInlineEmpty("No completed maintenance history yet.")}
        </div>
      </section>
    </div>
  `;
}

function renderMaintenanceItem(item) {
  const status = getMaintenanceStatus(item);
  return `
    <article class="maintenance-item">
      <div>
        <div class="status-label">
          <span class="dot ${status}"></span>
          <strong>${escapeHtml(item.item)}</strong>
          ${renderMaintenanceBadge({ ...item, status })}
        </div>
        <div class="maintenance-meta">
          <span class="badge">${formatCurrency(item.cost || 0)}</span>
          <span class="badge">${item.interval_km ? `${formatNumber(item.interval_km)} km` : "No km interval"}</span>
          <span class="badge">${item.interval_months ? `${formatNumber(item.interval_months)} months` : "No month interval"}</span>
          <span class="badge">Last ${formatDate(item.last_done_date)}</span>
          <span class="badge">Next ${formatDate(item.next_due_date)}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn secondary" type="button" data-action="complete-maintenance" data-id="${escapeHtml(item.id)}">
          <i data-lucide="check"></i>
          Done
        </button>
        <button class="btn danger icon-only" type="button" data-action="delete-maintenance" data-id="${escapeHtml(item.id)}" aria-label="Delete maintenance">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </article>
  `;
}

function renderPerformancePage(estimator) {
  return `
    <section class="estimator">
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Boost model</h2>
            <p>Use conservative inputs for a realistic planning range.</p>
          </div>
        </div>
        <form class="form-stack" data-form="performance">
          <div class="field">
            <label for="stock-hp">Stock horsepower</label>
            <input id="stock-hp" name="stockHp" data-estimator="stockHp" type="number" min="0" step="1" value="${escapeHtml(estimator.stockHp)}">
          </div>
          <div class="field">
            <label for="boost-psi">Boost pressure PSI</label>
            <input id="boost-psi" name="boostPsi" data-estimator="boostPsi" type="number" min="0" step="0.5" value="${escapeHtml(estimator.boostPsi)}">
          </div>
          <div class="field">
            <label for="engine-type">Engine type</label>
            <select id="engine-type" name="engineType" data-estimator="engineType">
              <option value="turbo"${estimator.engineType === "turbo" ? " selected" : ""}>Turbo</option>
              <option value="supercharged"${estimator.engineType === "supercharged" ? " selected" : ""}>Supercharged</option>
            </select>
          </div>
          <div class="field">
            <label for="efficiency">Efficiency factor <span id="efficiency-label">${Math.round(Number(estimator.efficiency) * 100)}%</span></label>
            <input id="efficiency" name="efficiency" data-estimator="efficiency" type="range" min="0.55" max="0.98" step="0.01" value="${escapeHtml(estimator.efficiency)}">
          </div>
        </form>
      </div>
      <div class="estimator-output" data-estimator-output>
        ${renderEstimatorResult(estimator)}
      </div>
    </section>
  `;
}

function renderTimelineList(events) {
  return `
    <div class="timeline">
      ${events.map((event) => `
        <article class="timeline-event">
          <div class="timeline-pin"></div>
          <div class="timeline-body">
            <strong>${escapeHtml(event.event_type || "Timeline")}</strong>
            <span>${escapeHtml(event.message)}</span>
            <span>${new Date(event.created_at).toLocaleString()}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPhaseRows(parts) {
  return getPhaseSummary(parts).map((phase) => `
    <div class="status-row">
      <span class="status-label"><span class="dot ${phase.status}"></span>${escapeHtml(phase.label)}</span>
      <strong>${phase.count}</strong>
    </div>
  `).join("");
}

function renderBudgetRows(parts) {
  const groups = Object.entries(groupBy(parts, "category"));
  if (!groups.length) {
    return renderInlineEmpty("No parts added.");
  }

  return groups.map(([category, items]) => `
    <div class="budget-row">
      <span>${escapeHtml(category)}</span>
      <strong>${formatCurrency(items.reduce((sum, part) => sum + Number(part.price || 0), 0))}</strong>
    </div>
  `).join("");
}

function renderMetric(label, value, subtext) {
  return `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(subtext)}</small>
    </article>
  `;
}

function renderOptions(map, selected) {
  return Object.entries(map).map(([value, label]) => `
    <option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function renderInlineEmpty(message) {
  return `<p class="muted-copy">${escapeHtml(message)}</p>`;
}

function renderNotice(message) {
  if (!message) {
    return `<div class="notice" aria-live="polite"></div>`;
  }

  const isError = /error|failed|invalid|required|not|missing/i.test(message);
  return `<div class="notice${isError ? " error" : ""}" aria-live="polite">${escapeHtml(message)}</div>`;
}

function renderMaintenanceBadge(item) {
  const status = getMaintenanceStatus(item);
  return `<span class="badge ${status}">${escapeHtml(MAINTENANCE_STATUS[status] || status)}</span>`;
}

function getCurrentBuild(state) {
  return state.builds.find((build) => build.id === state.currentBuildId) || null;
}

function getNextService(items) {
  if (!items.length) {
    return null;
  }

  return [...items].sort((a, b) => {
    const aRank = statusRank(getMaintenanceStatus(a));
    const bRank = statusRank(getMaintenanceStatus(b));
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return String(a.next_due_date || "9999-12-31").localeCompare(String(b.next_due_date || "9999-12-31"));
  })[0];
}

function statusRank(status) {
  return { overdue: 0, due: 1, up_to_date: 2 }[status] ?? 3;
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}
