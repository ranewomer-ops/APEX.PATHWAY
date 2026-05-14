import type { RealtimeChannel } from "@supabase/supabase-js";
import { create } from "zustand";
import { FALLBACK_BUILD_ID, getFallbackTemplates, getFallbackWorkspace } from "@/lib/fallbackSeed";
import { hasSupabaseConfig } from "@/lib/env";
import { getSupabase, usernameToEmail } from "@/lib/supabaseBrowser";
import type {
  BuildRow,
  BuildTemplateRow,
  MaintenanceHistoryRow,
  MaintenanceItemRow,
  PartRow,
  Session,
  TimelineRow,
  UserRow
} from "@/lib/types";
import { toNumber } from "@/lib/utils";

const emptyBuild = {
  parts: [] as PartRow[],
  timelineEvents: [] as TimelineRow[],
  maintenanceItems: [] as MaintenanceItemRow[],
  maintenanceHistory: [] as MaintenanceHistoryRow[]
};

let realtimeChannels: RealtimeChannel[] = [];

function stopRealtime(supabase: ReturnType<typeof getSupabase>) {
  for (const ch of realtimeChannels) {
    void supabase?.removeChannel(ch);
  }
  realtimeChannels = [];
}

export type ApexStore = {
  configured: boolean;
  booting: boolean;
  loading: boolean;
  session: Session | null;
  profile: UserRow | null;
  builds: BuildRow[];
  templates: BuildTemplateRow[];
  currentBuildId: string | null;
  error: string;
  notice: string;
  useFallbackWorkspace: boolean;
  templatesTouchedFallback: boolean;
  parts: PartRow[];
  timelineEvents: TimelineRow[];
  maintenanceItems: MaintenanceItemRow[];
  maintenanceHistory: MaintenanceHistoryRow[];
  init: () => Promise<void>;
  handleSession: (session: Session | null) => Promise<void>;
  setNotice: (message: string) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentBuild: (buildId: string) => Promise<void>;
  loadWorkspace: () => Promise<void>;
  refreshBuilds: () => Promise<void>;
  loadTemplates: () => Promise<{
    templates: BuildTemplateRow[];
    error: string;
    fromFallback: boolean;
  }>;
  loadBuildData: (buildId?: string | null) => Promise<void>;
  startRealtime: () => void;
  createBuild: (fields: Record<string, string>) => Promise<void>;
  updateCurrentBuild: (fields: Record<string, string>) => Promise<void>;
  createPlanFromBrief: (fields: Record<string, string>) => Promise<void>;
  addPart: (fields: Record<string, string>) => Promise<void>;
  updatePart: (partId: string, fields: Record<string, unknown>) => Promise<void>;
  deletePart: (partId: string) => Promise<void>;
  addMaintenanceItem: (fields: Record<string, string>) => Promise<void>;
  completeMaintenanceItem: (itemId: string) => Promise<void>;
  deleteMaintenanceItem: (itemId: string) => Promise<void>;
  findTemplateForBrief: (brief: string, templateId?: string) => BuildTemplateRow | null;
};

function assertWritable(get: () => ApexStore) {
  if (get().useFallbackWorkspace) {
    throw new Error("Demo preview data: create a real build in Supabase to enable saving.");
  }
}

export const useApexStore = create<ApexStore>((set, get) => ({
  configured: hasSupabaseConfig(),
  booting: true,
  loading: false,
  session: null,
  profile: null,
  builds: [],
  templates: [],
  currentBuildId: null,
  error: "",
  notice: "",
  useFallbackWorkspace: false,
  templatesTouchedFallback: false,
  parts: [],
  timelineEvents: [],
  maintenanceItems: [],
  maintenanceHistory: [],

  setNotice: (message) => set({ notice: message || "" }),

  init: async () => {
    const supabase = getSupabase();
    if (!supabase) {
      set({
        booting: false,
        configured: false,
        session: null,
        profile: null,
        builds: [],
        templates: [],
        currentBuildId: null,
        ...emptyBuild
      });
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      set({ booting: false, error: error.message });
      return;
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      void get().handleSession(session);
    });

    await get().handleSession(data.session);
  },

  handleSession: async (session) => {
    const supabase = getSupabase();
    stopRealtime(supabase);

    if (!session) {
      set({
        booting: false,
        loading: false,
        session: null,
        profile: null,
        builds: [],
        templates: [],
        currentBuildId: null,
        error: "",
        useFallbackWorkspace: false,
        templatesTouchedFallback: false,
        ...emptyBuild
      });
      return;
    }

    set({ booting: false, loading: true, session, error: "" });
    await get().loadWorkspace();
  },

  login: async (username, password) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const email = usernameToEmail(username);
    if (!email || !password) {
      throw new Error("Enter your username and password.");
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  },

  logout: async () => {
    const supabase = getSupabase();
    stopRealtime(supabase);
    await supabase?.auth.signOut();
  },

  loadTemplates: async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return { templates: [] as BuildTemplateRow[], error: "", fromFallback: false };
    }
    const { data, error } = await supabase
      .from("build_templates")
      .select("*, template_parts(*)")
      .eq("is_active", true)
      .order("package_name", { ascending: true });

    if (error) {
      return {
        templates: getFallbackTemplates(),
        error: "Planner migration missing in database — showing embedded demo template.",
        fromFallback: true
      };
    }

    const templates = ((data || []) as BuildTemplateRow[]).map((template) => ({
      ...template,
      template_parts: [...(template.template_parts || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }));

    if (templates.length === 0) {
      return { templates: getFallbackTemplates(), error: "", fromFallback: true };
    }

    return { templates, error: "", fromFallback: false };
  },

  loadWorkspace: async () => {
    const supabase = getSupabase();
    const session = get().session;
    if (!supabase || !session) {
      return;
    }

    const userId = session.user.id;
    const [{ data: profile, error: profileError }, { data: builds, error: buildsError }, templatesResult] =
      await Promise.all([
        supabase.from("users").select("id, username, password_reference, created_at").eq("id", userId).maybeSingle(),
        supabase.from("builds").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        get().loadTemplates()
      ]);

    if (profileError) {
      set({ loading: false, error: profileError.message });
      return;
    }

    if (buildsError) {
      set({ loading: false, error: buildsError.message });
      return;
    }

    if (!profile) {
      set({
        loading: false,
        profile: null,
        builds: [],
        currentBuildId: null,
        error: "This authenticated account does not have an Apex Pathway user row.",
        useFallbackWorkspace: false,
        ...emptyBuild
      });
      return;
    }

    let safeBuilds = (builds || []) as BuildRow[];
    let useFallbackWorkspace = false;
    let fbParts = emptyBuild.parts;
    let fbTimeline = emptyBuild.timelineEvents;
    let fbMaint = emptyBuild.maintenanceItems;
    let fbHist = emptyBuild.maintenanceHistory;

    if (safeBuilds.length === 0) {
      const fb = getFallbackWorkspace(userId);
      safeBuilds = fb.builds;
      fbParts = fb.parts;
      fbTimeline = fb.timelineEvents;
      fbMaint = fb.maintenanceItems;
      fbHist = fb.maintenanceHistory;
      useFallbackWorkspace = true;
    }

    const currentBuildId =
      get().currentBuildId && safeBuilds.some((b) => b.id === get().currentBuildId)
        ? get().currentBuildId
        : safeBuilds[0]?.id || null;

    set({
      profile: profile as UserRow,
      builds: safeBuilds,
      templates: templatesResult.templates,
      currentBuildId,
      loading: false,
      error: templatesResult.error || "",
      useFallbackWorkspace,
      templatesTouchedFallback: templatesResult.fromFallback,
      parts: useFallbackWorkspace ? fbParts : emptyBuild.parts,
      timelineEvents: useFallbackWorkspace ? fbTimeline : emptyBuild.timelineEvents,
      maintenanceItems: useFallbackWorkspace ? fbMaint : emptyBuild.maintenanceItems,
      maintenanceHistory: useFallbackWorkspace ? fbHist : emptyBuild.maintenanceHistory
    });

    if (useFallbackWorkspace) {
      return;
    }

    await get().loadBuildData(currentBuildId);
    get().startRealtime();
  },

  startRealtime: () => {
    const supabase = getSupabase();
    const profile = get().profile;
    const buildId = get().currentBuildId;
    if (!supabase || !profile || get().useFallbackWorkspace) {
      return;
    }

    stopRealtime(supabase);
    const userId = profile.id;

    const userChannel = supabase
      .channel(`apex-user-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "builds", filter: `user_id=eq.${userId}` }, () => {
        void get().refreshBuilds();
      })
      .subscribe();
    realtimeChannels.push(userChannel);

    if (!buildId) {
      return;
    }

    const buildChannel = supabase
      .channel(`apex-build-${buildId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "parts", filter: `build_id=eq.${buildId}` }, () => {
        void get().loadBuildData(buildId);
        void get().refreshBuilds();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timeline_events", filter: `build_id=eq.${buildId}` },
        () => {
          void get().loadBuildData(buildId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maintenance_items", filter: `build_id=eq.${buildId}` },
        () => {
          void get().loadBuildData(buildId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maintenance_history", filter: `build_id=eq.${buildId}` },
        () => {
          void get().loadBuildData(buildId);
        }
      )
      .subscribe();
    realtimeChannels.push(buildChannel);
  },

  refreshBuilds: async () => {
    const supabase = getSupabase();
    const userId = get().profile?.id;
    if (!supabase || !userId || get().useFallbackWorkspace) {
      return;
    }

    const { data, error } = await supabase
      .from("builds")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      set({ error: error.message });
      return;
    }

    const nextBuilds = (data || []) as BuildRow[];
    const currentBuildId =
      get().currentBuildId && nextBuilds.some((b) => b.id === get().currentBuildId)
        ? get().currentBuildId
        : nextBuilds[0]?.id || null;

    set({ builds: nextBuilds, currentBuildId });
    await get().loadBuildData(currentBuildId);
    get().startRealtime();
  },

  setCurrentBuild: async (buildId) => {
    if (buildId === get().currentBuildId) {
      return;
    }
    set({ currentBuildId: buildId, loading: true });
    await get().loadBuildData(buildId);
    get().startRealtime();
  },

  loadBuildData: async (buildId = get().currentBuildId) => {
    if (get().useFallbackWorkspace && buildId === FALLBACK_BUILD_ID) {
      set({ loading: false });
      return;
    }

    const supabase = getSupabase();
    if (!buildId || !supabase) {
      set({ loading: false, ...emptyBuild });
      return;
    }

    const [partsResult, timelineResult, maintenanceResult, historyResult] = await Promise.all([
      supabase.from("parts").select("*").eq("build_id", buildId).order("created_at", { ascending: true }),
      supabase.from("timeline_events").select("*").eq("build_id", buildId).order("created_at", { ascending: false }),
      supabase.from("maintenance_items").select("*").eq("build_id", buildId).order("next_due_date", { ascending: true, nullsFirst: false }),
      supabase.from("maintenance_history").select("*").eq("build_id", buildId).order("done_date", { ascending: false })
    ]);

    const err = partsResult.error || timelineResult.error || maintenanceResult.error || historyResult.error;
    if (err) {
      set({ loading: false, error: err.message });
      return;
    }

    set({
      loading: false,
      error: "",
      parts: (partsResult.data || []) as PartRow[],
      timelineEvents: (timelineResult.data || []) as TimelineRow[],
      maintenanceItems: (maintenanceResult.data || []) as MaintenanceItemRow[],
      maintenanceHistory: (historyResult.data || []) as MaintenanceHistoryRow[]
    });
  },

  findTemplateForBrief: (brief, templateId) => {
    const templates = get().templates;
    if (templateId) {
      return templates.find((t) => t.id === templateId) || null;
    }
    const text = brief.toLowerCase();
    return [...templates]
      .map((template) => {
        const keywords = template.match_keywords || [];
        const score = keywords.reduce(
          (sum, keyword) => (text.includes(String(keyword).toLowerCase()) ? sum + 1 : sum),
          0
        );
        return { template, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.template || templates[0] || null;
  },

  createBuild: async (fields) => {
    assertWritable(get);
    const supabase = getSupabase();
    const userId = get().profile?.id;
    if (!supabase || !userId) {
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
    const { data, error } = await supabase.from("builds").insert(payload).select("*").single();
    if (error) {
      throw error;
    }
    set({ useFallbackWorkspace: false });
    await get().refreshBuilds();
    await get().setCurrentBuild((data as BuildRow).id);
  },

  createPlanFromBrief: async (fields) => {
    assertWritable(get);
    const supabase = getSupabase();
    const userId = get().profile?.id;
    if (!supabase || !userId) {
      throw new Error("No Apex Pathway user is loaded.");
    }
    if (!get().templates.length) {
      throw new Error("No proposal templates are available.");
    }
    const brief = fields.customer_brief?.trim();
    if (!brief) {
      throw new Error("Enter the customer's brief first.");
    }
    const template = get().findTemplateForBrief(brief, fields.template_id);
    if (!template) {
      throw new Error("No matching build template found.");
    }

    const { data: build, error: buildError } = await supabase
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

    const b = build as BuildRow;
    const parts = (template.template_parts || []).map((part) => ({
      build_id: b.id,
      name: part.name,
      price: toNumber(part.price),
      category: part.category || "General",
      status: "planned"
    }));

    if (parts.length) {
      const { error: partsError } = await supabase.from("parts").insert(parts);
      if (partsError) {
        throw partsError;
      }
    }

    set({ useFallbackWorkspace: false });
    await get().refreshBuilds();
    await get().setCurrentBuild(b.id);
  },

  updateCurrentBuild: async (fields) => {
    assertWritable(get);
    const supabase = getSupabase();
    const buildId = get().currentBuildId;
    if (!supabase || !buildId) {
      throw new Error("Select a build first.");
    }
    const payload = {
      name: fields.name?.trim(),
      car_model: fields.car_model?.trim(),
      status: fields.status || "planning"
    };
    const { error } = await supabase.from("builds").update(payload).eq("id", buildId);
    if (error) {
      throw error;
    }
    await get().refreshBuilds();
  },

  addPart: async (fields) => {
    assertWritable(get);
    const supabase = getSupabase();
    const buildId = get().currentBuildId;
    if (!supabase || !buildId) {
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
    const { error } = await supabase.from("parts").insert(payload);
    if (error) {
      throw error;
    }
    await get().loadBuildData(buildId);
    await get().refreshBuilds();
  },

  updatePart: async (partId, fields) => {
    assertWritable(get);
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    const payload: Record<string, unknown> = { ...fields };
    if (Object.prototype.hasOwnProperty.call(payload, "price")) {
      payload.price = toNumber(payload.price);
    }
    const { error } = await supabase.from("parts").update(payload).eq("id", partId);
    if (error) {
      throw error;
    }
    await get().loadBuildData();
    await get().refreshBuilds();
  },

  deletePart: async (partId) => {
    assertWritable(get);
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    const { error } = await supabase.from("parts").delete().eq("id", partId);
    if (error) {
      throw error;
    }
    await get().loadBuildData();
    await get().refreshBuilds();
  },

  addMaintenanceItem: async (fields) => {
    assertWritable(get);
    const supabase = getSupabase();
    const buildId = get().currentBuildId;
    if (!supabase || !buildId) {
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
    const { error } = await supabase.from("maintenance_items").insert(payload);
    if (error) {
      throw error;
    }
    await get().loadBuildData(buildId);
  },

  completeMaintenanceItem: async (itemId) => {
    assertWritable(get);
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    const { error } = await supabase.rpc("complete_maintenance_item", { p_item_id: itemId });
    if (error) {
      throw error;
    }
    await get().loadBuildData();
  },

  deleteMaintenanceItem: async (itemId) => {
    assertWritable(get);
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    const { error } = await supabase.from("maintenance_items").delete().eq("id", itemId);
    if (error) {
      throw error;
    }
    await get().loadBuildData();
  }
}));
