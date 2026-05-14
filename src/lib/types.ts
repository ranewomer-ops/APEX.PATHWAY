import type { Session } from "@supabase/supabase-js";

export type UserRow = {
  id: string;
  username: string;
  password_reference?: string;
  created_at?: string;
};

export type BuildRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  name: string;
  car_model: string;
  status: string;
  budget_total?: number;
  customer_brief?: string | null;
  package_name?: string | null;
  stock_hp?: number | null;
  estimated_hp_low?: number | null;
  estimated_hp_high?: number | null;
  estimated_gain_low?: number | null;
  estimated_gain_high?: number | null;
  estimated_time_weeks?: string | null;
  plan_notes?: string | null;
  plan_milestones?: unknown;
};

export type PartRow = {
  id: string;
  build_id: string;
  name: string;
  price: number | string;
  category: string;
  status: string;
  created_at?: string;
};

export type TimelineRow = {
  id: string;
  build_id: string;
  event_type: string;
  message: string;
  created_at: string;
};

export type MaintenanceItemRow = {
  id: string;
  build_id: string;
  item: string;
  cost: number | string;
  interval_km?: number | null;
  interval_months?: number | null;
  last_done_date?: string | null;
  next_due_date?: string | null;
  status?: string;
};

export type MaintenanceHistoryRow = {
  id: string;
  build_id: string;
  item: string;
  cost: number | string;
  done_date: string;
};

export type TemplatePartRow = {
  id: string;
  template_id: string;
  name: string;
  category: string;
  price: number | string;
  sort_order: number;
  notes?: string | null;
};

export type BuildTemplateRow = {
  id: string;
  slug: string;
  package_name: string;
  car_model: string;
  customer_summary: string;
  stock_hp: number;
  estimated_hp_low: number;
  estimated_hp_high: number;
  estimated_gain_low: number;
  estimated_gain_high: number;
  estimated_time_weeks: string;
  plan_notes: string;
  match_keywords: string[] | null;
  milestones: unknown;
  is_active: boolean;
  template_parts?: TemplatePartRow[];
};

export type { Session };
