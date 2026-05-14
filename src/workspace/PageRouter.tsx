import { Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { BuildRow, BuildTemplateRow, MaintenanceItemRow, PartRow } from "@/lib/types";
import {
  BUILD_STATUS,
  MAINTENANCE_STATUS,
  PART_STATUS,
  calculateBudget,
  estimatePerformance,
  formatCurrency,
  formatDate,
  formatNumber,
  getMaintenanceStatus,
  getPhaseSummary,
  groupBy,
  safeArray
} from "@/lib/utils";
import { useApexStore } from "@/state/apexStore";
import { runForm } from "@/workspace/Workspace";

type Milestone = { label: string; title: string; detail: string };

function getNextService(items: MaintenanceItemRow[]) {
  if (!items.length) {
    return null;
  }
  const rank = (s: string) => ({ overdue: 0, due: 1, up_to_date: 2 }[s] ?? 3);
  return [...items].sort((a, b) => {
    const ar = rank(getMaintenanceStatus(a));
    const br = rank(getMaintenanceStatus(b));
    if (ar !== br) {
      return ar - br;
    }
    return String(a.next_due_date || "9999-12-31").localeCompare(String(b.next_due_date || "9999-12-31"));
  })[0];
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function NoBuild() {
  return (
    <section className="empty-state">
      <h2>No build selected</h2>
      <p>Create your first Apex Pathway build to unlock the dashboard.</p>
      <a className="btn primary" href="#/build">
        <Plus size={18} />
        Create build
      </a>
    </section>
  );
}

function GoalPower(build: BuildRow) {
  const low = Number(build.estimated_hp_low);
  const high = Number(build.estimated_hp_high);
  if (Number.isFinite(low) && Number.isFinite(high) && high >= low) {
    const mid = Math.round((low + high) / 2);
    return { value: `${formatNumber(mid)} hp`, sub: `Planning range ${formatNumber(low)}–${formatNumber(high)} hp` };
  }
  return { value: "Not set", sub: "Add estimates on Build Details" };
}

function DashboardPage({ build }: { build: BuildRow | null }) {
  const parts = useApexStore((s) => s.parts);
  const timeline = useApexStore((s) => s.timelineEvents);
  const maintenance = useApexStore((s) => s.maintenanceItems);

  if (!build) {
    return <NoBuild />;
  }

  const budget = calculateBudget(parts);
  const goal = GoalPower(build);
  const upcoming = parts.filter((p) => p.status === "planned").length;
  const completed = parts.filter((p) => p.status === "completed").length;
  const nextService = getNextService(maintenance);
  const recent = timeline.slice(0, 4);

  const notes = build.customer_brief ? (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Project notes</h2>
          <p>Customer context for this build.</p>
        </div>
      </div>
      <p className="muted-copy">{String(build.customer_brief)}</p>
    </section>
  ) : null;

  return (
    <div className="content-grid">
      <section className="hero-panel">
        <h2>{build.name}</h2>
        <p>
          {build.car_model} is currently marked as {BUILD_STATUS[build.status] || build.status}.
        </p>
      </section>

      <section className="grid-4">
        <Metric label="Build type" value={build.package_name || "—"} sub="Street, track, or package focus" />
        <Metric label="Goal power" value={goal.value} sub={goal.sub} />
        <Metric
          label="Completion"
          value={`${budget.percent}%`}
          sub="Share of planned part budget in motion (ordered, installed, or completed)"
        />
        <Metric
          label="Upcoming work"
          value={`${upcoming} item${upcoming === 1 ? "" : "s"}`}
          sub="Parts still in the planned phase"
        />
      </section>

      {notes}

      <section className="grid-4">
        <Metric label="Total budget" value={formatCurrency(budget.total)} sub="Sum of all part prices" />
        <Metric label="Spent" value={formatCurrency(budget.spent)} sub="Parts ordered, installed, or completed" />
        <Metric label="Remaining" value={formatCurrency(budget.remaining)} sub="Planned part cost still open" />
        <Metric label="Completed parts" value={`${completed}/${parts.length}`} sub="Status marked completed" />
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Budget posture</h2>
              <p>Calculated from live Supabase part records.</p>
            </div>
            <span className="badge installed">{budget.percent}% spent</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${budget.percent}%` }} />
          </div>
          <BudgetRows parts={parts} />
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Part phases</h2>
              <p>Status distribution for the selected build.</p>
            </div>
          </div>
          <PhaseRows parts={parts} />
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Recent timeline</h2>
              <p>Generated automatically when part statuses change.</p>
            </div>
          </div>
          {recent.length ? <TimelineList events={recent} /> : <p className="muted-copy">No generated timeline events yet.</p>}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Next maintenance</h2>
              <p>Independent service tracking for this build.</p>
            </div>
          </div>
          {nextService ? (
            <div className="list-row">
              <div>
                <strong>{nextService.item}</strong>
                <div className="muted-copy">Next due {formatDate(nextService.next_due_date)}</div>
              </div>
              <a className="btn secondary" href="#/maintenance">
                Open
              </a>
            </div>
          ) : (
            <p className="muted-copy">No maintenance items created.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function BudgetRows({ parts }: { parts: PartRow[] }) {
  const groups = Object.entries(groupBy(parts, "category"));
  if (!groups.length) {
    return <p className="muted-copy">No parts added.</p>;
  }
  return (
    <>
      {groups.map(([category, items]) => (
        <div key={category} className="budget-row">
          <span>{category}</span>
          <strong>{formatCurrency(items.reduce((s, p) => s + Number(p.price || 0), 0))}</strong>
        </div>
      ))}
    </>
  );
}

function PhaseRows({ parts }: { parts: PartRow[] }) {
  return (
    <>
      {getPhaseSummary(parts).map((phase) => (
        <div key={phase.status} className="status-row">
          <span className="status-label">
            <span className={`dot ${phase.status}`} />
            {phase.label}
          </span>
          <strong>{phase.count}</strong>
        </div>
      ))}
    </>
  );
}

function TimelineList({ events }: { events: { event_type?: string; message: string; created_at: string }[] }) {
  return (
    <div className="timeline">
      {events.map((event) => (
        <article key={event.created_at + event.message} className="timeline-event">
          <div className="timeline-pin" />
          <div className="timeline-body">
            <strong>{event.event_type || "Timeline"}</strong>
            <span>{event.message}</span>
            <span>{new Date(event.created_at).toLocaleString()}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function BuildPlanSummary({ build }: { build: BuildRow }) {
  if (!build.package_name && !build.customer_brief) {
    return null;
  }
  const milestones = safeArray<Milestone>(build.plan_milestones);
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Customer plan summary</h2>
          <p>{build.customer_brief || "No customer brief saved."}</p>
        </div>
        {build.package_name ? <span className="badge installed">{build.package_name}</span> : null}
      </div>
      <div className="grid-4">
        <Metric label="Stock HP" value={build.stock_hp ? `${build.stock_hp} hp` : "Not set"} sub="Baseline estimate" />
        <Metric
          label="Estimated HP"
          value={build.estimated_hp_low ? `${build.estimated_hp_low}-${build.estimated_hp_high} hp` : "Not set"}
          sub="After planned upgrades"
        />
        <Metric
          label="Gain"
          value={build.estimated_gain_low ? `+${build.estimated_gain_low}-${build.estimated_gain_high} hp` : "Not set"}
          sub="Expected range"
        />
        <Metric label="Time" value={build.estimated_time_weeks || "Not set"} sub="Estimated completion" />
      </div>
      {build.plan_notes ? <div className="quote-block">{String(build.plan_notes)}</div> : null}
      {milestones.length ? (
        <div className="template-list">
          <h3>Estimated timeline</h3>
          {milestones.map((m) => (
            <div key={m.label + m.title} className="timeline-event">
              <div className="timeline-pin" />
              <div className="timeline-body">
                <strong>
                  {m.label} - {m.title}
                </strong>
                <span>{m.detail}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BuildPage({ build }: { build: BuildRow | null }) {
  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Create build</h2>
            <p>Builds are linked to the signed-in Supabase user.</p>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={(e) =>
            runForm(e, async () => {
              const fd = new FormData(e.currentTarget);
              await useApexStore.getState().createBuild(Object.fromEntries(fd.entries()) as Record<string, string>);
              e.currentTarget.reset();
            }, "Build created")
          }
        >
          <div className="form-grid three">
            <div className="field">
              <label htmlFor="new-build-name">Build name</label>
              <input id="new-build-name" name="name" placeholder="E39 M112 Track Build" required />
            </div>
            <div className="field">
              <label htmlFor="new-car-model">Car model</label>
              <input id="new-car-model" name="car_model" placeholder="BMW E39 540i" required />
            </div>
            <div className="field">
              <label htmlFor="new-build-status">Status</label>
              <select id="new-build-status" name="status" defaultValue="planning">
                {Object.entries(BUILD_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn primary" type="submit">
            <Plus size={18} />
            Add build
          </button>
        </form>
      </section>

      {build ? (
        <>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Selected build</h2>
                <p>Budget is not manually editable. It is synced from part prices.</p>
              </div>
              <span className="badge installed">{formatCurrency(build.budget_total || 0)}</span>
            </div>
            <form
              className="form-stack"
              key={build.id}
              onSubmit={(e) =>
                runForm(e, async () => {
                  const fd = new FormData(e.currentTarget);
                  await useApexStore.getState().updateCurrentBuild(Object.fromEntries(fd.entries()) as Record<string, string>);
                }, "Build saved")
              }
            >
              <div className="form-grid three">
                <div className="field">
                  <label htmlFor="build-name">Build name</label>
                  <input id="build-name" name="name" defaultValue={build.name} required />
                </div>
                <div className="field">
                  <label htmlFor="car-model">Car model</label>
                  <input id="car-model" name="car_model" defaultValue={build.car_model} required />
                </div>
                <div className="field">
                  <label htmlFor="build-status">Status</label>
                  <select id="build-status" name="status" defaultValue={build.status}>
                    {Object.entries(BUILD_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn secondary" type="submit">
                <Save size={18} />
                Save build
              </button>
            </form>
          </section>
          <BuildPlanSummary build={build} />
        </>
      ) : null}
    </div>
  );
}

function PartsPage({ build }: { build: BuildRow | null }) {
  const parts = useApexStore((s) => s.parts);
  if (!build) {
    return <NoBuild />;
  }

  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Add part</h2>
            <p>Status changes generate timeline events automatically.</p>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={(e) =>
            runForm(e, async () => {
              const fd = new FormData(e.currentTarget);
              await useApexStore.getState().addPart(Object.fromEntries(fd.entries()) as Record<string, string>);
              e.currentTarget.reset();
            }, "Part added")
          }
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="part-name">Part name</label>
              <input id="part-name" name="name" placeholder="Turbo kit, brake pads, ECU tune" required />
            </div>
            <div className="field">
              <label htmlFor="part-category">Category</label>
              <input id="part-category" name="category" placeholder="Forced induction" />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="part-price">Price</label>
              <input id="part-price" name="price" type="number" min={0} step={0.01} placeholder="0" />
            </div>
            <div className="field">
              <label htmlFor="part-status">Status</label>
              <select id="part-status" name="status" defaultValue="planned">
                {Object.entries(PART_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn primary" type="submit">
            <Plus size={18} />
            Add part
          </button>
        </form>
      </section>

      <section className="table-shell desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {parts.length ? (
              parts.map((part) => (
                <tr key={part.id}>
                  <td>
                    <input
                      className="input"
                      defaultValue={part.name}
                      onBlur={(e) =>
                        void useApexStore.getState().updatePart(part.id, { name: e.target.value.trim() })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      defaultValue={part.category || ""}
                      onBlur={(e) =>
                        void useApexStore.getState().updatePart(part.id, { category: e.target.value.trim() || "General" })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={part.price ?? 0}
                      onBlur={(e) => void useApexStore.getState().updatePart(part.id, { price: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="compact-select"
                      defaultValue={part.status}
                      onChange={(e) => void useApexStore.getState().updatePart(part.id, { status: e.target.value })}
                    >
                      {Object.entries(PART_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn danger icon-only"
                        type="button"
                        aria-label="Delete part"
                        onClick={() => {
                          if (window.confirm("Delete this part?")) {
                            void useApexStore.getState().deletePart(part.id);
                          }
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  <p className="muted-copy">No parts added.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mobile-cards">
        {parts.length ? (
          parts.map((part) => (
            <article key={part.id} className="mobile-item">
              <div className="mobile-item-head">
                <div>
                  <strong>{part.name}</strong>
                  <div className="muted-copy">{part.category || "General"}</div>
                </div>
                <span className={`badge ${part.status}`}>{PART_STATUS[part.status] || part.status}</span>
              </div>
              <div className="form-stack">
                <div className="form-grid">
                  <div className="field">
                    <span>Price</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={part.price ?? 0}
                      onBlur={(e) => void useApexStore.getState().updatePart(part.id, { price: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <span>Status</span>
                    <select
                      defaultValue={part.status}
                      onChange={(e) => void useApexStore.getState().updatePart(part.id, { status: e.target.value })}
                    >
                      {Object.entries(PART_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Delete this part?")) {
                      void useApexStore.getState().deletePart(part.id);
                    }
                  }}
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="muted-copy">No parts added.</p>
        )}
      </section>
    </div>
  );
}

function BudgetPage({ build }: { build: BuildRow | null }) {
  const parts = useApexStore((s) => s.parts);
  if (!build) {
    return <NoBuild />;
  }
  const budget = calculateBudget(parts);
  const byCategory = Object.entries(groupBy(parts, "category"));
  const byStatus = Object.keys(PART_STATUS).map((status) => ({
    status,
    label: PART_STATUS[status],
    total: parts.filter((p) => p.status === status).reduce((s, p) => s + Number(p.price || 0), 0)
  }));

  return (
    <div className="content-grid">
      <section className="grid-3">
        <Metric label="Total budget" value={formatCurrency(budget.total)} sub="Sum of all parts" />
        <Metric label="Spent budget" value={formatCurrency(budget.spent)} sub="Status is not planned" />
        <Metric label="Remaining" value={formatCurrency(budget.remaining)} sub="Planned part cost" />
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Budget progress</h2>
            <p>One calculation path prevents duplicate totals and NaN states.</p>
          </div>
          <span className="badge installed">{budget.percent}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${budget.percent}%` }} />
        </div>
      </section>
      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>By category</h2>
          </div>
          {byCategory.length ? (
            byCategory.map(([category, items]) => (
              <div key={category} className="budget-row">
                <span>{category}</span>
                <strong>{formatCurrency(items.reduce((s, p) => s + Number(p.price || 0), 0))}</strong>
              </div>
            ))
          ) : (
            <p className="muted-copy">No budget data yet.</p>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>By status</h2>
          </div>
          {byStatus.map((item) => (
            <div key={item.status} className="budget-row">
              <span className="status-label">
                <span className={`dot ${item.status}`} />
                {item.label}
              </span>
              <strong>{formatCurrency(item.total)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TimelinePage({ build }: { build: BuildRow | null }) {
  const parts = useApexStore((s) => s.parts);
  const events = useApexStore((s) => s.timelineEvents);
  if (!build) {
    return <NoBuild />;
  }
  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Generated phases</h2>
            <p>Phase state is derived from part statuses only.</p>
          </div>
        </div>
        <div className="phase-grid">
          {getPhaseSummary(parts).map((phase) => (
            <article key={phase.status} className="phase-card">
              <span className={`badge ${phase.status}`}>{phase.label}</span>
              <strong>{phase.count} parts</strong>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${phase.percent}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Timeline events</h2>
            <p>Read-only events are written by Supabase triggers.</p>
          </div>
        </div>
        {events.length ? <TimelineList events={events} /> : <p className="muted-copy">No timeline events yet.</p>}
      </section>
    </div>
  );
}

function MaintenancePage({ build }: { build: BuildRow | null }) {
  const items = useApexStore((s) => s.maintenanceItems);
  const history = useApexStore((s) => s.maintenanceHistory);
  if (!build) {
    return <NoBuild />;
  }

  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Add maintenance</h2>
            <p>Maintenance is independent from parts, budget, and timeline.</p>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={(e) =>
            runForm(e, async () => {
              const fd = new FormData(e.currentTarget);
              await useApexStore.getState().addMaintenanceItem(Object.fromEntries(fd.entries()) as Record<string, string>);
              e.currentTarget.reset();
            }, "Maintenance added")
          }
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="maint-item">Item</label>
              <input id="maint-item" name="item" placeholder="Oil change, brakes, alignment" required />
            </div>
            <div className="field">
              <label htmlFor="maint-cost">Cost</label>
              <input id="maint-cost" name="cost" type="number" min={0} step={0.01} placeholder="0" />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="interval-km">Interval km</label>
              <input id="interval-km" name="interval_km" type="number" min={0} step={1} />
            </div>
            <div className="field">
              <label htmlFor="interval-months">Interval months</label>
              <input id="interval-months" name="interval_months" type="number" min={0} step={1} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="last-done">Last done date</label>
              <input id="last-done" name="last_done_date" type="date" />
            </div>
            <div className="field">
              <label htmlFor="next-due">Next due date</label>
              <input id="next-due" name="next_due_date" type="date" />
            </div>
          </div>
          <button className="btn primary" type="submit">
            <Plus size={18} />
            Add maintenance
          </button>
        </form>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>Checklist</h2>
          </div>
          {items.length ? (
            items.map((item) => {
              const st = getMaintenanceStatus(item);
              return (
                <article key={item.id} className="maintenance-item">
                  <div>
                    <div className="status-label">
                      <span className={`dot ${st}`} />
                      <strong>{item.item}</strong>
                      <span className={`badge ${st}`}>{MAINTENANCE_STATUS[st] || st}</span>
                    </div>
                    <div className="maintenance-meta">
                      <span className="badge">{formatCurrency(item.cost || 0)}</span>
                      <span className="badge">{item.interval_km ? `${formatNumber(item.interval_km)} km` : "No km interval"}</span>
                      <span className="badge">
                        {item.interval_months ? `${formatNumber(item.interval_months)} months` : "No month interval"}
                      </span>
                      <span className="badge">Last {formatDate(item.last_done_date)}</span>
                      <span className="badge">Next {formatDate(item.next_due_date)}</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => void useApexStore.getState().completeMaintenanceItem(item.id)}
                    >
                      Done
                    </button>
                    <button
                      className="btn danger icon-only"
                      type="button"
                      aria-label="Delete maintenance"
                      onClick={() => {
                        if (window.confirm("Delete this maintenance item?")) {
                          void useApexStore.getState().deleteMaintenanceItem(item.id);
                        }
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted-copy">No maintenance items yet.</p>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>History</h2>
          </div>
          {history.length ? (
            history.map((entry) => (
              <div key={entry.id} className="list-row">
                <div>
                  <strong>{entry.item}</strong>
                  <div className="muted-copy">
                    {formatDate(entry.done_date)} - {formatCurrency(entry.cost || 0)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="muted-copy">No completed maintenance history yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function PerformancePage() {
  const [stockHp, setStockHp] = useState(300);
  const [boostPsi, setBoostPsi] = useState(7);
  const [engineType, setEngineType] = useState<"turbo" | "supercharged">("supercharged");
  const [efficiency, setEfficiency] = useState(0.78);

  const result = useMemo(
    () => estimatePerformance({ stockHp, boostPsi, efficiency, engineType }),
    [stockHp, boostPsi, efficiency, engineType]
  );

  return (
    <section className="estimator">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Boost model</h2>
            <p>Use conservative inputs for a realistic planning range.</p>
          </div>
        </div>
        <div className="form-stack">
          <div className="field">
            <label htmlFor="stock-hp">Stock horsepower</label>
            <input id="stock-hp" type="number" min={0} step={1} value={stockHp} onChange={(e) => setStockHp(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="boost-psi">Boost pressure PSI</label>
            <input id="boost-psi" type="number" min={0} step={0.5} value={boostPsi} onChange={(e) => setBoostPsi(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="engine-type">Engine type</label>
            <select id="engine-type" value={engineType} onChange={(e) => setEngineType(e.target.value as "turbo" | "supercharged")}>
              <option value="turbo">Turbo</option>
              <option value="supercharged">Supercharged</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="efficiency">
              Efficiency factor <span>{Math.round(efficiency * 100)}%</span>
            </label>
            <input id="efficiency" type="range" min={0.55} max={0.98} step={0.01} value={efficiency} onChange={(e) => setEfficiency(Number(e.target.value))} />
          </div>
        </div>
      </div>
      <div className="estimator-output">
        <div className="range-value">
          <span>Estimated output range</span>
          <strong>
            {formatNumber(result.lowHp)} - {formatNumber(result.highHp)} hp
          </strong>
        </div>
        <div className="grid-2">
          <div className="metric">
            <span>Estimated gain</span>
            <strong>
              {formatNumber(result.lowGain)} - {formatNumber(result.highGain)} hp
            </strong>
            <small>Calculated as a range to avoid false precision.</small>
          </div>
          <div className="metric">
            <span>Efficiency factor</span>
            <strong>{Math.round(efficiency * 100)}%</strong>
            <small>Lower values are safer for heat, fuel, and driveline losses.</small>
          </div>
        </div>
        <div className="warning-list">
          {result.warnings.map((w) => (
            <div key={w} className="warning-item">
              <span>{w}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplateCard({ template }: { template: BuildTemplateRow }) {
  const partsTotal = (template.template_parts || []).reduce((s, p) => s + Number(p.price || 0), 0);
  const milestones = safeArray<Milestone>(template.milestones);
  return (
    <article className="card template-card">
      <div className="card-header">
        <div>
          <h2>{template.package_name}</h2>
          <p>{template.customer_summary}</p>
        </div>
        <span className="badge installed">{template.estimated_time_weeks}</span>
      </div>
      <div className="grid-3">
        <Metric label="Stock HP" value={`${template.stock_hp} hp`} sub={template.car_model} />
        <Metric label="Estimated HP" value={`${template.estimated_hp_low}-${template.estimated_hp_high} hp`} sub="Realistic range" />
        <Metric label="Parts budget" value={formatCurrency(partsTotal)} sub={`${template.template_parts?.length || 0} recommended items`} />
      </div>
      <div className="quote-block">{template.plan_notes}</div>
      <div className="template-list">
        <h3>Recommended parts</h3>
        {(template.template_parts || []).map((p) => (
          <div key={p.id} className="budget-row">
            <span>{p.name}</span>
            <strong>{formatCurrency(p.price)}</strong>
          </div>
        ))}
      </div>
      <div className="template-list">
        <h3>Estimated timeline</h3>
        {milestones.map((m) => (
          <div key={m.label} className="list-row">
            <span>
              <strong>{m.label}:</strong> {m.title}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function PlannerPage() {
  const templates = useApexStore((s) => s.templates);

  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Build from customer brief</h2>
            <p>Example: &quot;I have a BMW M340i and want Stage 2 turbo power, tune, and supporting upgrades.&quot;</p>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={(e: FormEvent<HTMLFormElement>) =>
            runForm(
              e,
              async () => {
                const fd = new FormData(e.currentTarget);
                await useApexStore.getState().createPlanFromBrief(Object.fromEntries(fd.entries()) as Record<string, string>);
                window.location.hash = "#/build";
              },
              "Customer build plan created"
            )
          }
        >
          <div className="field">
            <label htmlFor="customer-brief">Customer brief</label>
            <textarea
              id="customer-brief"
              name="customer_brief"
              required
              placeholder='I have a BMW M340i, I want more turbo power, Stage 2 tune, and supporting upgrades.'
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="build-name">Build name</label>
              <input id="build-name" name="build_name" placeholder="Customer M340i Stage 2" />
            </div>
            <div className="field">
              <label htmlFor="template-id">Plan template</label>
              <select id="template-id" name="template_id" disabled={!templates.length}>
                <option value="">Auto match from brief</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.package_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={!templates.length}>
            <Sparkles size={18} />
            Create editable build plan
          </button>
        </form>
      </section>

      {templates.length ? (
        <section className="grid-2">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <h2>No planner templates loaded</h2>
          <p>
            Run <strong>supabase/schema.sql</strong> in Supabase SQL Editor, then refresh this page.
          </p>
        </section>
      )}
    </div>
  );
}

export function PageRouter({ page, build }: { page: string; build: BuildRow | null }) {
  const needsBuild = !["build", "planner"].includes(page);
  if (needsBuild && !build) {
    return <NoBuild />;
  }

  switch (page) {
    case "planner":
      return <PlannerPage />;
    case "build":
      return <BuildPage build={build} />;
    case "parts":
      return <PartsPage build={build} />;
    case "budget":
      return <BudgetPage build={build} />;
    case "timeline":
      return <TimelinePage build={build} />;
    case "maintenance":
      return <MaintenancePage build={build} />;
    case "performance":
      return <PerformancePage />;
    case "dashboard":
    default:
      return <DashboardPage build={build} />;
  }
}
