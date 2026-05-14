import { hasSupabaseConfig } from "./config.js";
import { getSupabase, usernameToEmail } from "./supabaseClient.js";
import { toNumber } from "./utils.js";

const emptyBuildData = {
  parts: [],
  timelineEvents: [],
  maintenanceItems: [],
  maintenanceHistory: []
};

export class ApexStore {
  constructor() {
    this.listeners = new Set();
    this.channels = [];
    this.supabase = null;
    this.state = {
      configured: hasSupabaseConfig(),
      booting: true,
      loading: false,
      session: null,
      profile: null,
      builds: [],
      templates: [],
      currentBuildId: null,
      error: "",
      ...emptyBuildData
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
    this.supabase = await getSupabase();

    if (!this.supabase) {
      this.setState({ booting: false, configured: false });
      return;
    }

    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      this.setState({ booting: false, error: error.message });
      return;
    }

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.handleSession(session);
    });

    await this.handleSession(data.session);
  }

  async handleSession(session) {
    this.stopRealtime();

    if (!session) {
      this.setState({
        booting: false,
        loading: false,
        session: null,
        profile: null,
        builds: [],
        templates: [],
        currentBuildId: null,
        error: "",
        ...emptyBuildData
      });
      return;
    }

    this.setState({ booting: false, loading: true, session, error: "" });
    await this.loadWorkspace();
  }

  async login(username, password) {
    if (!this.supabase) {
      throw new Error("Supabase is not configured.");
    }

    const email = usernameToEmail(username);
    if (!email || !password) {
      throw new Error("Enter your username and password.");
    }

    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }

  async logout() {
    if (!this.supabase) {
      return;
    }

    this.stopRealtime();
    await this.supabase.auth.signOut();
  }

  async loadWorkspace() {
    const session = this.state.session;
    if (!session) {
      return;
    }

    const userId = session.user.id;
    const [{ data: profile, error: profileError }, { data: builds, error: buildsError }, templatesResult] = await Promise.all([
      this.supabase.from("users").select("id, username, password_reference, created_at").eq("id", userId).maybeSingle(),
      this.supabase.from("builds").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      this.loadTemplates()
    ]);

    if (profileError) {
      this.setState({ loading: false, error: profileError.message });
      return;
    }

    if (buildsError) {
      this.setState({ loading: false, error: buildsError.message });
      return;
    }

    if (!profile) {
      this.setState({
        loading: false,
        profile: null,
        builds: [],
        currentBuildId: null,
        error: "This authenticated account does not have an Apex Pathway user row.",
        ...emptyBuildData
      });
      return;
    }

    const safeBuilds = builds || [];
    const currentBuildId = this.state.currentBuildId && safeBuilds.some((build) => build.id === this.state.currentBuildId)
      ? this.state.currentBuildId
      : safeBuilds[0]?.id || null;

    this.setState({
      profile,
      builds: safeBuilds,
      templates: templatesResult.templates,
      currentBuildId,
      loading: false,
      error: templatesResult.error || ""
    });

    await this.loadBuildData(currentBuildId);
    this.startRealtime();
  }

  async refreshBuilds() {
    const userId = this.state.profile?.id;
    if (!userId) {
      return;
    }

    const { data, error } = await this.supabase
      .from("builds")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      this.setState({ error: error.message });
      return;
    }

    const builds = data || [];
    const currentBuildId = this.state.currentBuildId && builds.some((build) => build.id === this.state.currentBuildId)
      ? this.state.currentBuildId
      : builds[0]?.id || null;

    this.setState({ builds, currentBuildId });
    await this.loadBuildData(currentBuildId);
    this.startRealtime();
  }

  async loadTemplates() {
    const { data, error } = await this.supabase
      .from("build_templates")
      .select("*, template_parts(*)")
      .eq("is_active", true)
      .order("package_name", { ascending: true });

    if (error) {
      return {
        templates: [],
        error: "Run supabase-planner-migration.sql to enable proposal templates."
      };
    }

    const templates = (data || []).map((template) => ({
      ...template,
      template_parts: [...(template.template_parts || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }));

    return { templates, error: "" };
  }

  async setCurrentBuild(buildId) {
    if (buildId === this.state.currentBuildId) {
      return;
    }

    this.setState({ currentBuildId: buildId, loading: true });
    await this.loadBuildData(buildId);
    this.startRealtime();
  }

  async loadBuildData(buildId = this.state.currentBuildId) {
    if (!buildId) {
      this.setState({ loading: false, ...emptyBuildData });
      return;
    }

    const [partsResult, timelineResult, maintenanceResult, historyResult] = await Promise.all([
      this.supabase.from("parts").select("*").eq("build_id", buildId).order("created_at", { ascending: true }),
      this.supabase.from("timeline_events").select("*").eq("build_id", buildId).order("created_at", { ascending: false }),
      this.supabase.from("maintenance_items").select("*").eq("build_id", buildId).order("next_due_date", { ascending: true, nullsFirst: false }),
      this.supabase.from("maintenance_history").select("*").eq("build_id", buildId).order("done_date", { ascending: false })
    ]);

    const error = partsResult.error || timelineResult.error || maintenanceResult.error || historyResult.error;
    if (error) {
      this.setState({ loading: false, error: error.message });
      return;
    }

    this.setState({
      loading: false,
      error: "",
      parts: partsResult.data || [],
      timelineEvents: timelineResult.data || [],
      maintenanceItems: maintenanceResult.data || [],
      maintenanceHistory: historyResult.data || []
    });
  }

  startRealtime() {
    if (!this.supabase || !this.state.profile) {
      return;
    }

    this.stopRealtime();

    const userId = this.state.profile.id;
    const buildId = this.state.currentBuildId;
    const userChannel = this.supabase
      .channel(`apex-user-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "builds", filter: `user_id=eq.${userId}` }, () => {
        this.refreshBuilds();
      })
      .subscribe();

    this.channels.push(userChannel);

    if (!buildId) {
      return;
    }

    const buildChannel = this.supabase
      .channel(`apex-build-${buildId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "parts", filter: `build_id=eq.${buildId}` }, () => {
        this.loadBuildData(buildId);
        this.refreshBuilds();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "timeline_events", filter: `build_id=eq.${buildId}` }, () => {
        this.loadBuildData(buildId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_items", filter: `build_id=eq.${buildId}` }, () => {
        this.loadBuildData(buildId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_history", filter: `build_id=eq.${buildId}` }, () => {
        this.loadBuildData(buildId);
      })
      .subscribe();

    this.channels.push(buildChannel);
  }

  stopRealtime() {
    for (const channel of this.channels) {
      this.supabase?.removeChannel(channel);
    }
    this.channels = [];
  }

  async createBuild(fields) {
    const userId = this.state.profile?.id;
    if (!userId) {
      throw new Error("No Apex Pathway user is loaded.");
    }

    const payload = {
      user_id: userId,
      name: fields.name?.trim(),
      car_model: fields.car_model?.trim(),
      status: fields.status || "planning"
    };

    if (!payload.name || !payload.car_model) {
      throw new Error("Build name and car model are required.");
    }

    const { data, error } = await this.supabase.from("builds").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    await this.refreshBuilds();
    await this.setCurrentBuild(data.id);
  }

  async createPlanFromBrief(fields) {
    const userId = this.state.profile?.id;
    if (!userId) {
      throw new Error("No Apex Pathway user is loaded.");
    }

    if (!this.state.templates.length) {
      throw new Error("No proposal templates are available. Run supabase-planner-migration.sql first.");
    }

    const brief = fields.customer_brief?.trim();
    if (!brief) {
      throw new Error("Enter the customer's brief first.");
    }

    const template = this.findTemplateForBrief(brief, fields.template_id);
    if (!template) {
      throw new Error("No matching build template found.");
    }

    const { data: build, error: buildError } = await this.supabase
      .from("builds")
      .insert({
        user_id: userId,
        name: fields.build_name?.trim() || `${template.car_model} Customer Build`,
        car_model: template.car_model,
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
        plan_milestones: template.milestones || []
      })
      .select("*")
      .single();

    if (buildError) {
      throw buildError;
    }

    const parts = (template.template_parts || []).map((part) => ({
      build_id: build.id,
      name: part.name,
      price: toNumber(part.price),
      category: part.category || "General",
      status: "planned"
    }));

    if (parts.length) {
      const { error: partsError } = await this.supabase.from("parts").insert(parts);
      if (partsError) {
        throw partsError;
      }
    }

    await this.refreshBuilds();
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

    const payload = {
      name: fields.name?.trim(),
      car_model: fields.car_model?.trim(),
      status: fields.status || "planning"
    };

    const { error } = await this.supabase.from("builds").update(payload).eq("id", buildId);
    if (error) {
      throw error;
    }

    await this.refreshBuilds();
  }

  async addPart(fields) {
    const buildId = this.state.currentBuildId;
    if (!buildId) {
      throw new Error("Create a build before adding parts.");
    }

    const payload = {
      build_id: buildId,
      name: fields.name?.trim(),
      price: toNumber(fields.price),
      category: fields.category?.trim() || "General",
      status: fields.status || "planned"
    };

    if (!payload.name) {
      throw new Error("Part name is required.");
    }

    const { error } = await this.supabase.from("parts").insert(payload);
    if (error) {
      throw error;
    }

    await this.loadBuildData(buildId);
    await this.refreshBuilds();
  }

  async updatePart(partId, fields) {
    const payload = { ...fields };
    if (Object.prototype.hasOwnProperty.call(payload, "price")) {
      payload.price = toNumber(payload.price);
    }

    const { error } = await this.supabase.from("parts").update(payload).eq("id", partId);
    if (error) {
      throw error;
    }

    await this.loadBuildData();
    await this.refreshBuilds();
  }

  async deletePart(partId) {
    const { error } = await this.supabase.from("parts").delete().eq("id", partId);
    if (error) {
      throw error;
    }

    await this.loadBuildData();
    await this.refreshBuilds();
  }

  async addMaintenanceItem(fields) {
    const buildId = this.state.currentBuildId;
    if (!buildId) {
      throw new Error("Create a build before adding maintenance.");
    }

    const payload = {
      build_id: buildId,
      item: fields.item?.trim(),
      cost: toNumber(fields.cost),
      interval_km: fields.interval_km ? Math.max(Math.round(toNumber(fields.interval_km)), 0) : null,
      interval_months: fields.interval_months ? Math.max(Math.round(toNumber(fields.interval_months)), 0) : null,
      last_done_date: fields.last_done_date || null,
      next_due_date: fields.next_due_date || null
    };

    if (!payload.item) {
      throw new Error("Maintenance item is required.");
    }

    const { error } = await this.supabase.from("maintenance_items").insert(payload);
    if (error) {
      throw error;
    }

    await this.loadBuildData(buildId);
  }

  async completeMaintenanceItem(itemId) {
    const { error } = await this.supabase.rpc("complete_maintenance_item", { p_item_id: itemId });
    if (error) {
      throw error;
    }

    await this.loadBuildData();
  }

  async deleteMaintenanceItem(itemId) {
    const { error } = await this.supabase.from("maintenance_items").delete().eq("id", itemId);
    if (error) {
      throw error;
    }

    await this.loadBuildData();
  }
}
