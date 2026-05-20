const APP_LOCALE = "en-US";
const APP_CURRENCY = "USD";

export const PART_STATUS = {
  planned: "Planned",
  ordered: "Ordered",
  installed: "Installed",
  completed: "Completed"
};

export const BUILD_STATUS = {
  planning: "Planning",
  active: "Active",
  paused: "Paused",
  completed: "Completed"
};

export const MAINTENANCE_STATUS = {
  up_to_date: "Up to date",
  due: "Due",
  overdue: "Overdue"
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: APP_CURRENCY,
    maximumFractionDigits: 0
  }).format(toNumber(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat(APP_LOCALE, {
    maximumFractionDigits: 0
  }).format(toNumber(value));
}

export function formatDate(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(APP_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function calculateBudget(parts) {
  const safeParts = Array.isArray(parts) ? parts : [];
  const total = safeParts.reduce((sum, part) => sum + toNumber(part.price), 0);
  const spent = safeParts
    .filter((part) => part.status !== "planned")
    .reduce((sum, part) => sum + toNumber(part.price), 0);
  const remaining = Math.max(total - spent, 0);
  const percent = total > 0 ? Math.min(Math.round((spent / total) * 100), 100) : 0;

  return { total, spent, remaining, percent };
}

export function groupBy(items, key) {
  return (Array.isArray(items) ? items : []).reduce((groups, item) => {
    const group = item[key] || "Uncategorized";
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

export function getPartStatusCounts(parts) {
  return Object.keys(PART_STATUS).map((status) => ({
    status,
    label: PART_STATUS[status],
    count: (parts || []).filter((part) => part.status === status).length
  }));
}

export function getPhaseSummary(parts) {
  const counts = getPartStatusCounts(parts);
  const total = Math.max((parts || []).length, 1);

  return counts.map((item) => ({
    ...item,
    percent: Math.round((item.count / total) * 100)
  }));
}

export function getMaintenanceStatus(item) {
  if (item.status) {
    return item.status;
  }

  if (!item.next_due_date) {
    return "up_to_date";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${item.next_due_date}T00:00:00`);
  const diff = due.getTime() - today.getTime();
  const days = Math.ceil(diff / 86400000);

  if (days < 0) {
    return "overdue";
  }

  return days <= 14 ? "due" : "up_to_date";
}

export function estimatePerformance(input) {
  const stockHp = Math.max(toNumber(input.stockHp), 0);
  const boostPsi = Math.max(toNumber(input.boostPsi), 0);
  const rawEfficiency = toNumber(input.efficiency);
  const efficiency = Math.min(Math.max(rawEfficiency, 0.55), 0.98);
  const engineType = input.engineType === "supercharged" ? "supercharged" : "turbo";
  const pressureRatioGain = boostPsi / 14.7;
  const driveLossFactor = engineType === "supercharged" ? 0.86 : 0.94;
  const centerGain = stockHp * pressureRatioGain * efficiency * driveLossFactor;
  const lowHp = Math.round(stockHp + centerGain * 0.88);
  const highHp = Math.round(stockHp + centerGain * 1.08);
  const lowGain = Math.max(lowHp - stockHp, 0);
  const highGain = Math.max(highHp - stockHp, 0);
  const warnings = [];

  if (boostPsi >= 10) {
    warnings.push("Boost above 10 PSI usually needs stronger fuel, cooling, and tuning margins.");
  }

  if (boostPsi >= 14) {
    warnings.push("This pressure range can put stock internals, head gaskets, and driveline parts at high risk.");
  }

  if (efficiency > 0.9) {
    warnings.push("High efficiency assumptions require excellent charge cooling and a conservative tune.");
  }

  if (engineType === "supercharged") {
    warnings.push("Supercharger estimates include parasitic loss, belt slip risk, and extra charge heat.");
  }

  if (stockHp <= 0 || boostPsi <= 0) {
    warnings.push("Enter stock horsepower and boost pressure to produce a useful range.");
  }

  return {
    lowHp,
    highHp,
    lowGain,
    highGain,
    warnings
  };
}
