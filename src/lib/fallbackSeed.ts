import type {
  BuildRow,
  BuildTemplateRow,
  MaintenanceHistoryRow,
  MaintenanceItemRow,
  PartRow,
  TemplatePartRow,
  TimelineRow
} from "./types";

const FB_BUILD_ID = "00000000-0000-4000-8000-00000000e461";

const planMilestones = [
  {
    label: "Milestone 1",
    title: "Vehicle received",
    detail: "Vehicle received and logged into the shop queue."
  },
  {
    label: "Milestone 2",
    title: "Inspection completed",
    detail: "Health check, baseline logs, and build scope confirmed."
  },
  {
    label: "Milestone 3",
    title: "Suspension installed",
    detail: "Coilovers installed and corner-balanced."
  },
  {
    label: "Milestone 4",
    title: "Turbo parts ordered",
    detail: "Turbo hardware and supporting components ordered."
  }
];

function staticPart(
  id: string,
  name: string,
  category: string,
  price: number,
  status: string
): PartRow {
  return {
    id,
    build_id: FB_BUILD_ID,
    name,
    category,
    price,
    status,
    created_at: new Date().toISOString()
  };
}

function staticTimeline(id: string, event_type: string, message: string, offsetMin: number): TimelineRow {
  const t = new Date();
  t.setUTCMinutes(t.getUTCMinutes() + offsetMin);
  return {
    id,
    build_id: FB_BUILD_ID,
    event_type,
    message,
    created_at: t.toISOString()
  };
}

/** Client-only demo workspace when Supabase returns zero builds for a valid profile. */
export function getFallbackWorkspace(realUserId: string): {
  builds: BuildRow[];
  parts: PartRow[];
  timelineEvents: TimelineRow[];
  maintenanceItems: MaintenanceItemRow[];
  maintenanceHistory: MaintenanceHistoryRow[];
} {
  const build: BuildRow = {
    id: FB_BUILD_ID,
    user_id: realUserId,
    name: "E46 Street/Track Turbo",
    car_model: "BMW E46 330i",
    status: "active",
    budget_total: 6000,
    customer_brief: "Customer wants a reliable daily-drivable turbo setup with aggressive performance.",
    package_name: "Street / Track",
    stock_hp: 228,
    estimated_hp_low: 418,
    estimated_hp_high: 422,
    estimated_gain_low: 190,
    estimated_gain_high: 194,
    estimated_time_weeks: "6-8 weeks",
    plan_notes:
      "Target ~420 hp with a reliable, daily-drivable turbo path: fueling, cooling, tuning, and validation time included.",
    plan_milestones: planMilestones
  };

  const parts: PartRow[] = [
    staticPart("00000000-0000-4000-8000-00000000a001", "Cold air intake", "Intake", 675, "installed"),
    staticPart("00000000-0000-4000-8000-00000000a002", "Long tube headers", "Exhaust", 675, "installed"),
    staticPart("00000000-0000-4000-8000-00000000a003", "Coilovers", "Suspension", 675, "installed"),
    staticPart("00000000-0000-4000-8000-00000000a004", "Stage 2 clutch", "Drivetrain", 675, "installed"),
    staticPart("00000000-0000-4000-8000-00000000a005", "Turbo installation", "Forced induction", 1100, "planned"),
    staticPart("00000000-0000-4000-8000-00000000a006", "Dyno tuning", "Tuning", 1100, "planned"),
    staticPart("00000000-0000-4000-8000-00000000a007", "Fuel system upgrade", "Fuel system", 1100, "planned")
  ];

  const timelineEvents: TimelineRow[] = [
    staticTimeline("00000000-0000-4000-8000-00000000b001", "Shop milestone", "Vehicle received.", 10),
    staticTimeline("00000000-0000-4000-8000-00000000b002", "Shop milestone", "Inspection completed.", 11),
    staticTimeline("00000000-0000-4000-8000-00000000b003", "Shop milestone", "Suspension installed.", 12),
    staticTimeline("00000000-0000-4000-8000-00000000b004", "Shop milestone", "Turbo parts ordered.", 13)
  ];

  return {
    builds: [build],
    parts,
    timelineEvents,
    maintenanceItems: [],
    maintenanceHistory: []
  };
}

const fallbackTemplateParts: TemplatePartRow[] = [
  {
    id: "00000000-0000-4000-8000-00000000c001",
    template_id: "11111111-1111-4111-8111-111111111111",
    name: "Pre-build inspection and diagnostic scan",
    category: "Inspection",
    price: 180,
    sort_order: 10,
    notes: null
  },
  {
    id: "00000000-0000-4000-8000-00000000c002",
    template_id: "11111111-1111-4111-8111-111111111111",
    name: "Stage 2 ECU calibration",
    category: "Tuning",
    price: 850,
    sort_order: 30,
    notes: null
  }
];

/** When planner tables are empty or migration not applied — keeps Planner page usable offline. */
export function getFallbackTemplates(): BuildTemplateRow[] {
  const milestones = [
    {
      label: "Week 1",
      title: "Inspection and baseline",
      detail: "Compression/health scan, stock logs, fuel quality check, and parts confirmation."
    },
    {
      label: "Week 2",
      title: "Hardware and calibration",
      detail: "Supporting hardware, tune, and validation pulls."
    }
  ];

  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "bmw-m340i-b58-stage-2",
      package_name: "BMW M340i B58 Stage 2 Power Package",
      car_model: "BMW M340i / G20 B58",
      customer_summary:
        "For a customer who wants an M340i to make stronger turbo power with a Stage 2 tune, supporting hardware, cooling, and reliability checks.",
      stock_hp: 382,
      estimated_hp_low: 470,
      estimated_hp_high: 520,
      estimated_gain_low: 88,
      estimated_gain_high: 138,
      estimated_time_weeks: "3-5 weeks",
      plan_notes:
        "This plan assumes a healthy B58, quality fuel, conservative calibration, datalog review, and no drivetrain faults.",
      match_keywords: ["bmw", "m340i", "b58", "stage 2", "turbo", "tune"],
      milestones,
      is_active: true,
      template_parts: fallbackTemplateParts
    }
  ];
}

export const FALLBACK_BUILD_ID = FB_BUILD_ID;
