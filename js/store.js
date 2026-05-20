import { calculateBudget, getMaintenanceStatus, toNumber } from "./utils.js";

const STORAGE_KEY = "apex-pathway-local-v2";

const M340I_TEMPLATE = {
  id: "bmw-m340i-b58-stage-2",
  slug: "bmw-m340i-b58-stage-2",
  package_name: "BMW M340i B58 Stage 2 Power Package",
  car_model: "BMW M340i / G20 B58",
  customer_summary: "For a customer who wants an M340i to make stronger turbo power with a Stage 2 tune, supporting hardware, cooling, and reliability checks.",
  stock_hp: 382,
  estimated_hp_low: 470,
  estimated_hp_high: 520,
  estimated_gain_low: 88,
  estimated_gain_high: 138,
  estimated_time_weeks: "3-5 weeks",
  plan_notes: "This plan assumes a healthy B58, quality fuel, conservative calibration, datalog review, and no drivetrain faults. Hybrid turbo work is listed as optional because it usually moves the car beyond normal Stage 2 scope.",
  match_keywords: ["bmw", "m340i", "b58", "stage 2", "stage2", "turbo", "tune", "downpipe", "more power", "upgrade"],
  milestones: [
    { label: "Week 1", title: "Inspection and baseline", detail: "Compression/health scan, stock logs, fuel quality check, and parts confirmation." },
    { label: "Week 1-2", title: "Hardware install", detail: "Downpipe, charge pipe, intake, plugs, and cooling support." },
    { label: "Week 2-3", title: "Calibration", detail: "Stage 2 ECU tune, transmission tune, dyno or road datalogging." },
    { label: "Week 3-5", title: "Validation", detail: "Heat soak checks, boost leak check, customer handoff, and optional hybrid turbo decision." }
  ],
  template_parts: [
    { name: "Pre-build inspection and diagnostic scan", category: "Inspection", price: 180, notes: "Health scan, smoke test, baseline logs, and fault review before modifications." },
    { name: "High-flow catted downpipe", category: "Exhaust", price: 950, notes: "Stage 2 power requires reduced exhaust restriction. Confirm emissions rules locally." },
    { name: "Stage 2 ECU calibration", category: "Tuning", price: 850, notes: "Calibrated for the selected fuel and hardware. Includes datalog revisions." },
    { name: "xHP transmission tune", category: "Drivetrain", price: 450, notes: "Improves shift strategy and torque handling for the ZF8." },
    { name: "Upgraded charge pipe", category: "Intake", price: 320, notes: "Reduces failure risk under higher boost." },
    { name: "High-flow intake or panel filter", category: "Intake", price: 420, notes: "Supports airflow and improves serviceability." },
    { name: "Upgraded heat exchanger / cooling support", category: "Cooling", price: 900, notes: "Recommended for repeated pulls and hot climate reliability." },
    { name: "One-step-colder spark plugs", category: "Ignition", price: 180, notes: "Gap plugs to tuner recommendation before calibration." },
    { name: "Ignition coils inspection / replacement allowance", category: "Ignition", price: 280, notes: "Replace only if age, misfires, or logs justify it." },
    { name: "Dyno session and datalog validation", category: "Validation", price: 500, notes: "Power verification, AFR/knock/boost review, and final customer report." },
    { name: "Optional upgraded HPFP for ethanol blend", category: "Fuel System", price: 950, notes: "Only needed for ethanol blends or Stage 2+ targets." },
    { name: "Optional hybrid turbo upgrade path", category: "Turbo Upgrade", price: 3200, notes: "Moves beyond normal Stage 2. Requires deeper fueling, cooling, and tuning review." }
  ]
};

const DEFAULT_TEMPLATES = [M340I_TEMPLATE];

const emptyBuildData = () => ({
  parts: [],
  timelineEvents: [],
  maintenanceItems: [],
  maintenanceHistory: []
});

export class ApexStore {
  constructor() {
    this.listeners = new Set();
    this.buildData = {};
    this.state = {
      booting: true,
      loading: false,
      session: { mode: "local" },
      profile: { id: "local", username: "Local workspace" },
      builds: [],
      templates: DEFAULT_TEMPLATES,
      currentBuildId: null,
      error: "",
      ...emptyBuildData()
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  async init() {
    this.loadLocalData();
    this.setState({ booting: false, loading: false });
  }

  loadLocalData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const builds = Array.isArray(saved.builds) ? saved.builds : [];
      this.buildData = saved.buildData && typeof saved.buildData === "object" ? saved.buildData : {};
      const currentBuildId = saved.currentBuildId && builds.some((build) => build.id === saved.currentBuildId)
        ? saved.currentBuildId
        : builds[0]?.id || null;

      this.state = {
        ...this.state,
        builds,
        currentBuildId,
        ...this.getBuildData(currentBuildId)
      };
    } catch {
      this.buildData = {};
    }
  }

  saveLocalData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      builds: this.state.builds,
      currentBuildId: this.state.currentBuildId,
      buildData: this.buildData
    }));
  }

  commitForBuild(buildId, dataPatch = {}) {
    const data = { ...this.getBuildData(buildId), ...dataPatch };
    this.buildData[buildId] = data;
    this.syncBuildBudget(buildId, data.parts);
    this.saveLocalData();
    this.setState({
      builds: this.state.builds,
      currentBuildId: buildId,
      ...this.getBuildData(buildId),
      error: ""
    });
  }

  getBuildData(buildId = this.state.currentBuildId) {
    if (!buildId) {
      return emptyBuildData();
    }

    if (!this.buildData[buildId]) {
      this.buildData[buildId] = emptyBuildData();
    }

    return this.buildData[buildId];
  }

  syncBuildBudget(buildId, parts = this.getBuildData(buildId).parts) {
    const budget = calculateBudget(parts);
    this.state.builds = this.state.builds.map((build) => build.id === buildId
      ? { ...build, budget_total: budget.total, updated_at: new Date().toISOString() }
      : build);
  }

  async setCurrentBuild(buildId) {
    if (buildId === this.state.currentBuildId) {
      return;
    }

    this.saveLocalData();
    this.setState({
      currentBuildId: buildId,
      ...this.getBuildData(buildId),
      error: ""
    });
  }

  async createBuild(fields) {
    const build = {
      id: makeId("build"),
      name: fields.name?.trim(),
      car_model: fields.car_model?.trim(),
      budget_total: 0,
      status: fields.status || "planning",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!build.name || !build.car_model) {
      throw new Error("Build name and car model are required.");
    }

    this.state.builds = [...this.state.builds, build];
    this.buildData[build.id] = emptyBuildData();
    this.saveLocalData();
    await this.setCurrentBuild(build.id);
  }

  async createPlanFromBrief(fields) {
    const brief = fields.customer_brief?.trim();
    if (!brief) {
      throw new Error("Enter the customer's brief first.");
    }

    const template = this.findTemplateForBrief(brief, fields.template_id);
    if (!template) {
      throw new Error("No matching build template found.");
    }

    const build = {
      id: makeId("build"),
      name: fields.build_name?.trim() || `${template.car_model} Customer Build`,
      car_model: template.car_model,
      budget_total: 0,
      status: "planning",
      customer_brief: brief,
      package_name: template.package_name,
      stock_hp: template.stock_hp,
      estimated_hp_low: template.estimated_hp_low,
      estimated_hp_high: template.estimated_hp_high,
      estimated_gain_low: template.estimated_gain_low,
      estimated_gain_high: template.estimated_gain_high,
      estimated_time_weeks: template.estimated_time_weeks,
      plan_notes: template.plan_notes,
      plan_milestones: template.milestones || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const parts = (template.template_parts || []).map((part) => ({
      id: makeId("part"),
      build_id: build.id,
      name: part.name,
      price: toNumber(part.price),
      category: part.category || "General",
      status: "planned",
      notes: part.notes || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    build.budget_total = calculateBudget(parts).total;
    this.state.builds = [...this.state.builds, build];
    this.buildData[build.id] = {
      ...emptyBuildData(),
      parts,
      timelineEvents: [{
        id: makeId("event"),
        build_id: build.id,
        event_type: "Planning phase",
        message: `${template.package_name} generated from customer brief.`,
        created_at: new Date().toISOString()
      }]
    };
    this.saveLocalData();
    await this.setCurrentBuild(build.id);
  }

  findTemplateForBrief(brief, templateId) {
    if (templateId) {
      return this.state.templates.find((template) => template.id === templateId) || null;
    }

    const text = brief.toLowerCase();
    return [...this.state.templates]
      .map((template) => {
        const keywords = template.match_keywords || [];
        const score = keywords.reduce((sum, keyword) => text.includes(String(keyword).toLowerCase()) ? sum + 1 : sum, 0);
        return { template, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.template || this.state.templates[0] || null;
  }

  async updateCurrentBuild(fields) {
    const buildId = this.state.currentBuildId;
    if (!buildId) {
      throw new Error("Select a build first.");
    }

    this.state.builds = this.state.builds.map((build) => build.id === buildId
      ? {
          ...build,
          name: fields.name?.trim(),
          car_model: fields.car_model?.trim(),
          status: fields.status || "planning",
          updated_at: new Date().toISOString()
        }
      : build);
    this.saveLocalData();
    this.setState({ builds: this.state.builds, error: "" });
  }

  async addPart(fields) {
    const buildId = this.state.currentBuildId;
    if (!buildId) {
      throw new Error("Create a build before adding parts.");
    }

    const part = {
      id: makeId("part"),
      build_id: buildId,
      name: fields.name?.trim(),
      price: toNumber(fields.price),
      category: fields.category?.trim() || "General",
      status: fields.status || "planned",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!part.name) {
      throw new Error("Part name is required.");
    }

    const data = this.getBuildData(buildId);
    const parts = [...data.parts, part];
    const timelineEvents = [...data.timelineEvents, makePartEvent(part)];
    this.commitForBuild(buildId, { parts, timelineEvents });
  }

  async updatePart(partId, fields) {
    const buildId = this.state.currentBuildId;
    const data = this.getBuildData(buildId);
    let statusChangedPart = null;
    const parts = data.parts.map((part) => {
      if (part.id !== partId) {
        return part;
      }

      const next = {
        ...part,
        ...fields,
        updated_at: new Date().toISOString()
      };

      if (Object.prototype.hasOwnProperty.call(fields, "price")) {
        next.price = toNumber(fields.price);
      }

      if (fields.status && fields.status !== part.status) {
        statusChangedPart = next;
      }

      return next;
    });

    const timelineEvents = statusChangedPart
      ? [...data.timelineEvents, makePartEvent(statusChangedPart)]
      : data.timelineEvents;
    this.commitForBuild(buildId, { parts, timelineEvents });
  }

  async deletePart(partId) {
    const buildId = this.state.currentBuildId;
    const data = this.getBuildData(buildId);
    this.commitForBuild(buildId, {
      parts: data.parts.filter((part) => part.id !== partId)
    });
  }

  async addMaintenanceItem(fields) {
    const buildId = this.state.currentBuildId;
    if (!buildId) {
      throw new Error("Create a build before adding maintenance.");
    }

    const item = {
      id: makeId("maintenance"),
      build_id: buildId,
      item: fields.item?.trim(),
      cost: toNumber(fields.cost),
      interval_km: fields.interval_km ? Math.max(Math.round(toNumber(fields.interval_km)), 0) : null,
      interval_months: fields.interval_months ? Math.max(Math.round(toNumber(fields.interval_months)), 0) : null,
      last_done_date: fields.last_done_date || null,
      next_due_date: fields.next_due_date || null,
      status: "up_to_date",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!item.item) {
      throw new Error("Maintenance item is required.");
    }

    item.status = getMaintenanceStatus(item);
    const data = this.getBuildData(buildId);
    this.commitForBuild(buildId, {
      maintenanceItems: [...data.maintenanceItems, item]
    });
  }

  async completeMaintenanceItem(itemId) {
    const buildId = this.state.currentBuildId;
    const data = this.getBuildData(buildId);
    const today = new Date();
    const todayText = today.toISOString().slice(0, 10);
    let historyEntry = null;

    const maintenanceItems = data.maintenanceItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      const nextDueDate = item.interval_months
        ? addMonths(today, Number(item.interval_months)).toISOString().slice(0, 10)
        : item.next_due_date;

      historyEntry = {
        id: makeId("history"),
        build_id: buildId,
        maintenance_item_id: item.id,
        item: item.item,
        cost: item.cost,
        done_date: todayText,
        created_at: new Date().toISOString()
      };

      const updated = {
        ...item,
        last_done_date: todayText,
        next_due_date: nextDueDate,
        updated_at: new Date().toISOString()
      };
      updated.status = getMaintenanceStatus(updated);
      return updated;
    });

    this.commitForBuild(buildId, {
      maintenanceItems,
      maintenanceHistory: historyEntry ? [historyEntry, ...data.maintenanceHistory] : data.maintenanceHistory
    });
  }

  async deleteMaintenanceItem(itemId) {
    const buildId = this.state.currentBuildId;
    const data = this.getBuildData(buildId);
    this.commitForBuild(buildId, {
      maintenanceItems: data.maintenanceItems.filter((item) => item.id !== itemId)
    });
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePartEvent(part) {
  const phase = {
    planned: "Planning phase",
    ordered: "Parts Ordered phase",
    installed: "Installation phase",
    completed: "Build Completed"
  }[part.status] || "Build update";

  return {
    id: makeId("event"),
    build_id: part.build_id,
    event_type: phase,
    message: `${part.name} moved to ${phase}.`,
    created_at: new Date().toISOString()
  };
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
