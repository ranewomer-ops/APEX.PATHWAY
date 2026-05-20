const KNOWLEDGE_BASE = [
  {
    keys: ["b58", "g20", "supra", "a90"],
    carModel: "BMW B58 Turbo Platform",
    stockHp: 382,
    engine: "turbo inline-six",
    platformNotes: "B58 responds very well to calibration, downpipe, cooling, spark plug, and transmission tuning support."
  },
  {
    keys: ["335i", "n54", "n55", "340i"],
    carModel: "BMW 3 Series Turbo Inline-Six",
    stockHp: 300,
    engine: "turbo inline-six",
    platformNotes: "BMW turbo six platforms need careful charge-air, fuel, ignition, and cooling support before aggressive boost targets."
  },
  {
    keys: ["gti", "golf r", "ea888", "audi s3", "audi a3"],
    carModel: "VW/Audi EA888 Turbo Platform",
    stockHp: 241,
    engine: "turbo four-cylinder",
    platformNotes: "EA888 builds benefit from staged tuning, intercooling, plugs, DSG/TCU calibration, and traction support."
  },
  {
    keys: ["civic type r", "fk8", "fl5", "k20c1"],
    carModel: "Honda Civic Type R / K20C1",
    stockHp: 315,
    engine: "turbo four-cylinder",
    platformNotes: "K20C1 builds need heat management, fuel quality, clutch/traction planning, and careful knock control."
  },
  {
    keys: ["mustang gt", "coyote", "5.0"],
    carModel: "Ford Mustang GT / Coyote 5.0",
    stockHp: 480,
    engine: "naturally aspirated V8",
    platformNotes: "Coyote builds can go bolt-on NA, but meaningful power jumps usually come from supercharger or turbo kits."
  }
];

export function generateBuildPlan(brief) {
  const text = String(brief || "").toLowerCase();
  const vehicle = detectVehicle(text);
  const scope = detectScope(text, vehicle);
  const parts = buildParts(scope, vehicle, text);
  const estimates = estimatePower(vehicle.stockHp, scope, text);
  const time = estimateTime(scope, parts.length);
  const useCase = detectUseCase(text);

  return {
    package_name: `${vehicle.carModel} ${scope.label} Plan`,
    car_model: vehicle.carModel,
    stock_hp: vehicle.stockHp,
    estimated_hp_low: estimates.low,
    estimated_hp_high: estimates.high,
    estimated_gain_low: estimates.low - vehicle.stockHp,
    estimated_gain_high: estimates.high - vehicle.stockHp,
    estimated_time_weeks: time,
    plan_notes: [
      vehicle.platformNotes,
      `The agent detected a ${scope.label.toLowerCase()} goal for a ${useCase} build.`,
      "Final prices, legal compliance, fuel quality, and exact power numbers must be confirmed after inspection and datalogging."
    ].join(" "),
    milestones: buildMilestones(scope, time),
    template_parts: parts
  };
}

function detectVehicle(text) {
  const match = KNOWLEDGE_BASE.find((item) => item.keys.some((key) => text.includes(key)));
  if (match) {
    return match;
  }

  const readable = text.match(/(?:i have|car is|for my|my)\s+(?:a|an)?\s*([a-z0-9\s-]{3,34})/i)?.[1]?.trim();
  return {
    carModel: readable ? titleCase(readable) : "Customer Performance Vehicle",
    stockHp: text.includes("v8") ? 430 : 300,
    engine: text.includes("turbo") ? "turbocharged engine" : "performance engine",
    platformNotes: "Unknown platforms should start with inspection, baseline dyno/logging, maintenance, and conservative staged upgrades."
  };
}

function detectScope(text, vehicle) {
  if (text.includes("big turbo") || text.includes("hybrid turbo") || text.includes("stage 3")) {
    return { id: "big-turbo", label: "Big Turbo / Stage 3", intensity: 3 };
  }

  if (text.includes("stage 2") || text.includes("stage2") || (text.includes("more power") && text.includes("turbo"))) {
    return { id: "stage-2", label: "Stage 2", intensity: 2 };
  }

  if (text.includes("supercharger") || (vehicle.engine.includes("naturally") && text.includes("boost"))) {
    return { id: "supercharged", label: "Supercharged", intensity: 3 };
  }

  if (text.includes("track") || text.includes("handling") || text.includes("brake")) {
    return { id: "track-support", label: "Track Support", intensity: 2 };
  }

  return { id: "stage-1", label: "Stage 1", intensity: 1 };
}

function detectUseCase(text) {
  if (text.includes("track")) return "track-focused";
  if (text.includes("daily")) return "daily-driven";
  if (text.includes("drag")) return "straight-line";
  return "street performance";
}

function buildParts(scope, vehicle, text) {
  const forcedInduction = vehicle.engine.includes("turbo") || text.includes("turbo");
  const parts = [
    part("Pre-build inspection and diagnostic scan", "Inspection", 180, "Health scan, baseline logs, leak/smoke test, and maintenance review before spending on upgrades."),
    part("Baseline dyno or road datalog session", "Validation", 350, "Creates a real starting point for boost, timing, knock, fuel trims, and charge temps.")
  ];

  if (scope.id === "stage-1") {
    parts.push(
      part("Stage 1 ECU calibration", "Tuning", 650, "Conservative calibration for stock hardware and available fuel."),
      part("High-flow intake or performance filter", "Intake", 350, "Improves serviceability and supports airflow without changing core hardware."),
      part("Spark plugs inspection / replacement", "Ignition", 160, "Refresh if worn or if logs show ignition instability.")
    );
  }

  if (scope.id === "stage-2") {
    parts.push(
      part("High-flow downpipe or exhaust restriction upgrade", "Exhaust", 950, "Core Stage 2 airflow upgrade. Confirm local emissions rules before ordering."),
      part("Stage 2 ECU calibration", "Tuning", 850, "Matched to fuel, downpipe, boost target, and datalog revisions."),
      part("Transmission tune or shift strategy calibration", "Drivetrain", 450, "Improves torque handling and shift behavior."),
      part("Upgraded charge pipe / boost plumbing", "Intake", 320, "Reduces failure risk under higher boost pressure."),
      part("High-flow intake or panel filter", "Intake", 420, "Supports airflow and makes service checks easier."),
      part("Heat exchanger / intercooler cooling support", "Cooling", 900, "Important for repeat pulls and hot climate reliability."),
      part("One-step-colder spark plugs", "Ignition", 180, "Gap to tuner recommendation before calibration."),
      part("Dyno validation and final datalog review", "Validation", 500, "Confirms boost, AFR, knock behavior, timing, and real output.")
    );
  }

  if (scope.id === "big-turbo") {
    parts.push(
      part("Hybrid or big turbo assembly", "Turbo Upgrade", 3200, "Main airflow upgrade for power levels beyond normal Stage 2."),
      part("Turbo inlet, charge piping, and boost control support", "Turbo Upgrade", 850, "Keeps the turbo system stable under higher airflow."),
      part("Fuel pump and injector/fueling upgrade allowance", "Fuel System", 1450, "Required once airflow exceeds stock fueling headroom."),
      part("Custom ECU calibration", "Tuning", 1200, "Custom tune with staged revisions and conservative safety limits."),
      part("Transmission/drivetrain torque management tune", "Drivetrain", 650, "Protects shifts and manages increased torque."),
      part("Large heat exchanger / intercooler upgrade", "Cooling", 1200, "Controls charge temperature under sustained boost."),
      part("Dyno tuning and road validation package", "Validation", 850, "Power verification, safety checks, and customer handoff report.")
    );
  }

  if (scope.id === "supercharged") {
    parts.push(
      part("Complete supercharger kit", "Forced Induction", 6500, "Main power adder with brackets, belt drive, manifold hardware, and intake path."),
      part("Fuel system upgrade", "Fuel System", 1200, "Supports higher airflow and safer injector duty cycle."),
      part("ECU calibration for boost", "Tuning", 1100, "Custom calibration with timing, fuel, and torque management."),
      part("Cooling and heat exchanger package", "Cooling", 1200, "Controls inlet temperatures and reliability risk."),
      part("Spark plugs and ignition service", "Ignition", 260, "Fresh ignition components reduce misfire risk under boost."),
      part("Dyno validation and reliability inspection", "Validation", 750, "Confirms power, belt behavior, AFR, knock, and temperature control.")
    );
  }

  if (scope.id === "track-support" || text.includes("more upgrades") || text.includes("brakes") || text.includes("handling")) {
    parts.push(
      part("Performance brake pads and fluid", "Brakes", 420, "Improves stopping consistency and pedal feel."),
      part("Performance tires", "Chassis", 950, "Power is only useful if the car can put it down."),
      part("Alignment and suspension inspection", "Chassis", 260, "Sets the car up safely after power changes.")
    );
  }

  if (forcedInduction && !parts.some((item) => item.category === "Cooling")) {
    parts.push(part("Charge-air temperature review", "Cooling", 250, "Checks whether intercooler or heat exchanger support is needed."));
  }

  return parts;
}

function estimatePower(stockHp, scope, text) {
  const ranges = {
    "stage-1": [45, 85],
    "stage-2": [85, 145],
    "big-turbo": [160, 300],
    supercharged: [130, 240],
    "track-support": [10, 30]
  };
  const [lowGain, highGain] = ranges[scope.id] || ranges["stage-1"];
  const fuelBonus = text.includes("e85") || text.includes("ethanol") ? 25 : 0;
  return {
    low: Math.round(stockHp + lowGain + fuelBonus * 0.5),
    high: Math.round(stockHp + highGain + fuelBonus)
  };
}

function estimateTime(scope, partsCount) {
  if (scope.id === "big-turbo" || scope.id === "supercharged") return "6-10 weeks";
  if (scope.id === "stage-2" || partsCount > 8) return "3-5 weeks";
  return "1-3 weeks";
}

function buildMilestones(scope, time) {
  const installLabel = scope.intensity >= 3 ? "Week 2-6" : "Week 1-2";
  const tuningLabel = scope.intensity >= 3 ? "Week 5-8" : "Week 2-3";
  const handoffLabel = scope.intensity >= 3 ? "Week 8-10" : "Week 3-5";

  return [
    { label: "Week 1", title: "Agent inspection plan", detail: "Confirm vehicle health, scan faults, inspect maintenance state, and capture baseline logs." },
    { label: installLabel, title: "Parts and hardware install", detail: "Install the selected airflow, cooling, ignition, braking, and driveline support parts." },
    { label: tuningLabel, title: "Calibration and validation", detail: "Tune conservatively, log the car, watch boost/AFR/timing/knock/temperatures, and revise as needed." },
    { label: handoffLabel, title: "Road test and customer handoff", detail: `Complete final checks, explain reliability limits, and hand over the ${time} build plan.` }
  ];
}

function part(name, category, price, notes) {
  return { name, category, price, notes };
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
