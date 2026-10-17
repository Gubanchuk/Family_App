export type Wish = { id: string; household_id: string; owner_id: string; title: string; price: number | null; saved: number; done_at: string | null; created_by: string | null; created_at?: string; updated_at: string; deleted_at: string | null };
export type WishMetoo = { wish_id: string; member_id: string; household_id: string; updated_at: string; deleted_at: string | null };
export type WishGift = { wish_id: string; giver_id: string; household_id: string; updated_at: string; deleted_at: string | null };
// dept: the shopping department chosen for it; sent only once the server has the column.
export type Need = { id: string; household_id: string; for_id: string | null; title: string; note: string; due_on: string | null; price: number | null; dept?: string | null; created_by: string | null; created_at?: string; updated_at: string; deleted_at: string | null };
export type GoalStep = { id: string; t: string; done: boolean };
export type Goal = { id: string; household_id: string; owner_id: string | null; title: string; target: number; saved: number; steps: GoalStep[]; created_by: string | null; created_at?: string; updated_at: string; deleted_at: string | null };
export type Request = { id: string; household_id: string; from_id: string; to_id: string; title: string; due_on: string | null; urgent: boolean; status: 'open' | 'done' | 'cancelled'; done_at: string | null; created_at?: string; updated_at: string; deleted_at: string | null };
// One deposit into a wish's or goal's piggy bank; only added, taken back by its author within a day.
export type Deposit = { id: string; household_id: string; wish_id: string | null; goal_id: string | null; member_id: string; amount: number; created_at?: string; updated_at: string; deleted_at: string | null };
export const BOARD_TABLES = ['wishes', 'wish_metoo', 'wish_gifts', 'needs', 'goals', 'requests'] as const;
