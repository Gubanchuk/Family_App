export type Payment = { id: string; household_id: string; title: string; amount: number; day: number; kind: 'monthly' | 'installment'; total: number | null; first_month: string | null; note: string; created_by: string | null; created_at?: string; updated_at: string; deleted_at: string | null };
export type PaymentMark = { payment_id: string; month: string; household_id: string; paid: boolean; amount: number; paid_by: string | null; paid_on: string | null; updated_at: string };
export type MoneyEntry = { id: string; household_id: string; kind: 'expense' | 'income'; amount: number; category: string | null; member_id: string | null; on_date: string; note: string; created_by: string | null; created_at?: string; updated_at: string; deleted_at: string | null };
export type Budget = { household_id: string; category: string; amount: number; updated_at: string; deleted_at: string | null };
export const MONEY_TABLES = ['payments', 'payment_marks', 'money_entries'] as const;
export const CATEGORIES = ['Продукты', 'Дети', 'Транспорт', 'Кафе и доставка', 'Дом', 'Здоровье', 'Одежда', 'Другое'];
export const MANDATORY = 'Обязательные';
