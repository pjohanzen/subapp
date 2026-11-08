import type { Cycle } from "./renewals";

export type Status = "active" | "trial" | "paused" | "cancelled";

export interface Profile {
  id: string;
  home_currency: string;
  timezone: string;
}
export interface Named {
  id: string;
  name: string;
}
export interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  amount_minor: number;
  currency: string;
  cycle: Cycle;
  interval_count: number;
  next_renewal: string;
  anchor_day: number | null;
  category_id: string;
  payment_method_id: string;
  status: Status;
  notes: string | null;
}
