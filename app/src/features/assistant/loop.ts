import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { kindOf, TOOLS, type AssistantError } from '../../../../supabase/functions/_shared/assistant';
import { callAssistant } from './api';
import { buildSnapshot, snapshotHash } from './snapshot';
import { planTool, runTool, type ToolCtx, type ToolRun } from './tools';
import type { ApiMessage, ApiReply, AssistantImage, AssistantThread, Block, CardState, CardStatus, ChatBody, ImageType, ToolUse } from './types';

// The conversation on the phone. The history only grows and goes back to the function whole: the model's
// blocks exactly as they came, every tool_use answered by one tool_result in the very next message.

export const MAX_CALLS = 8;
export const MAX_THREAD_MESSAGES = 80;
export const MAX_THREAD_BYTES = 400_000;
const SNAPSHOT_TAG = '<снимок_семьи>';
const UNDONE_TAG = '<отменено>';
export const DECLINED = 'Человек ответил «Не надо»';
const UNANSWERED = 'Человек не нажал «Сделать» и написал дальше: действие не выполнено';
const INTERRUPTED = 'Приложение закрылось, пока действие выполнялось: неизвестно, сделано ли оно.';
const IMAGE_TYPES: ImageType[] = ['image/jpeg', 'image/png', 'image/webp'];

export type ErrorCode = AssistantError | 'network' | 'limit' | 'interrupted';
const SOMETHING = 'Что-то пошло не так. Попробуйте ещё раз.';
export const ERROR_TEXT: Record<ErrorCode, string> = {
  network: 'Нет связи. Помощнику нужен интернет.',
  no_credit: 'У помощника закончился лимит на этот месяц. Он обновится с новым месяцем подписки.',
  daily_limit: 'На сегодня помощник устал: дневной лимит семьи исчерпан. Завтра снова в строю.',
  busy: 'Помощник сейчас перегружен. Попробуйте через минуту.',
  refusal: 'Помощник не может ответить на это.',
  failed: SOMETHING,
  bad_request: SOMETHING,
  not_member: 'Помощник работает только для членов семьи.',
  limit: 'Помощник сделал слишком много шагов подряд. Нажмите «Повторить» или спросите иначе.',
  interrupted: 'Ответ не успел прийти. Нажмите «Повторить».',
};

export type ActionCard = {
  id: string; tool: string; kind: 'auto' | 'confirm'; summary: string; status: CardStatus; error?: string;
  // A pending «Сделать?» card.
  decide?: (yes: boolean) => Promise<void>;
  // A done auto action while this app is open.
  undo?: () => Promise<void>;
};
export type ChatItem =
  | { type: 'user'; key: string; text: string; images: string[] }
  | { type: 'assistant'; key: string; text: string }
  | { type: 'action'; key: string; card: ActionCard };
export type AssistantState = {
  loaded: boolean;
  items: ChatItem[];
  cards: ActionCard[];
  // Waiting for the model's answer.
  thinking: boolean;
  // Anything under way (answer, action, undo): the input should wait.
  busy: boolean;
  error: string | null;
  errorCode: ErrorCode | null;
  // This conversation began by itself because the previous one grew too long.
  wasReset: boolean;
};
export type ApiFn = (body: ChatBody) => Promise<ApiReply>;
export type SessionDeps = { db: LocalDb; me: Member; members: Member[]; api?: ApiFn; now?: () => Date };

const emptyThread = (memberId: string, reset = false): AssistantThread => ({ member_id: memberId, messages: [], snapshot_hash: '', updated_at: new Date().toISOString(), ...(reset ? { reset } : {}) });
const toolUses = (content: Block[]): ToolUse[] => content.filter((b): b is ToolUse => b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string');
const isText = (b: Block): b is Block & { text: string } => b.type === 'text' && typeof b.text === 'string';
// A tool's error as the card shows it: without the «Ошибка:» meant for the model.
const shown = (result: string) => result.replace(/^Ошибка:\s*/, '');
const dataUrl = (b: Block) => {
  const s = b.source as { media_type?: string; data?: string } | undefined;
  return s?.media_type && s.data ? `data:${s.media_type};base64,${s.data}` : null;
};

export class AssistantSession {
  private db: LocalDb;
  private me: Member;
  private members: Member[];
  private api: ApiFn;
  private now: () => Date;
  private thread: AssistantThread;
  private undos = new Map<string, () => Promise<void>>();
  private calls = 0;
  private busy = false;
  private running = 0;
  private thinking = false;
  private errorCode: ErrorCode | null = null;
  private loaded = false;
  // Bumped by «Новый разговор»: a reply still on its way to the old conversation is dropped.
  private epoch = 0;
  private screen: string | undefined;
  private listeners = new Set<() => void>();
  private state: AssistantState;
  readonly ready: Promise<void>;

  constructor(deps: SessionDeps) {
    this.db = deps.db;
    this.me = deps.me;
    this.members = deps.members;
    this.api = deps.api ?? ((body) => callAssistant(body));
    this.now = deps.now ?? (() => new Date());
    this.thread = emptyThread(deps.me.id);
    this.state = this.build();
    this.ready = this.load();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getState = () => this.state;
  setFamily(me: Member, members: Member[]) { this.me = me; this.members = members; }

  // Sends a question; false when it was not taken (empty, or something is still under way).
  send = async (text: string, images: AssistantImage[] = [], screen?: string): Promise<boolean> => {
    await this.ready;
    const words = text.trim();
    if (this.busy || this.running || (!words && !images.length)) return false;
    const epoch = this.epoch;
    this.busy = true;
    this.clearError();
    this.screen = screen;
    this.emit();
    let taken = false;
    try {
      if (this.tooLong()) { this.thread = emptyThread(this.me.id, true); this.undos.clear(); } else await this.closeOpenCalls();
      const snap = await buildSnapshot(this.db, this.me, this.members, this.now(), screen);
      const hash = snapshotHash(snap);
      const content: Block[] = [];
      if (hash !== this.thread.snapshot_hash) content.push({ type: 'text', text: snap });
      if (this.thread.notes?.length) content.push({ type: 'text', text: `${UNDONE_TAG}${this.thread.notes.join('\n')}</отменено>` });
      for (const im of images) {
        if (IMAGE_TYPES.includes(im.media_type) && im.data) content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
      }
      if (words) content.push({ type: 'text', text: words });
      this.thread.messages.push({ role: 'user', content });
      this.thread.snapshot_hash = hash;
      this.thread.notes = [];
      taken = true;
      await this.save();
      this.emit();
      this.calls = 0;
      await this.cycle(epoch);
    } catch {
      if (epoch === this.epoch) await this.fail('failed');
    } finally {
      if (epoch === this.epoch) { this.busy = false; this.emit(); }
    }
    return taken;
  };

  // «Сделать» or «Не надо» on a card; once every call of the reply has a result, the conversation goes on.
  decide = async (id: string, yes: boolean) => {
    await this.ready;
    const card = this.thread.cards?.[id];
    const call = this.lastCalls().find((u) => u.id === id);
    if (!card || card.status !== 'pending' || !call || this.busy) return;
    const epoch = this.epoch;
    this.clearError();
    const pending = (this.thread.pending ??= {});
    if (yes) {
      card.status = 'running';
      this.running += 1;
      this.emit();
      let r: ToolRun;
      try { r = await this.safeRun(call); } finally { if (epoch === this.epoch) this.running -= 1; }
      if (epoch !== this.epoch) return;
      pending[id] = { content: r.result, is_error: !!r.error };
      card.status = r.error ? 'failed' : 'done';
      if (r.error) card.error = shown(r.result);
    } else {
      card.status = 'declined';
      pending[id] = { content: DECLINED, is_error: false };
    }
    await this.save();
    this.emit();
    if (this.busy || !(await this.sendResults())) return;
    this.busy = true;
    try { await this.cycle(epoch); } catch { if (epoch === this.epoch) await this.fail('failed'); } finally { if (epoch === this.epoch) { this.busy = false; this.emit(); } }
  };

  // «Отменить» on a done auto action: only what that action added or changed, and the model hears of it next time.
  undo = async (id: string) => {
    const thread = this.thread;
    const card = thread.cards?.[id];
    const fn = this.undos.get(id);
    if (!card || !fn || card.status !== 'done') return;
    this.undos.delete(id);
    card.status = 'running';
    this.emit();
    try {
      await fn();
      card.status = 'undone';
      delete card.error;
      (thread.notes ??= []).push(`Человек отменил: ${card.summary}`);
    } catch {
      card.status = 'done';
      card.error = 'Не получилось отменить.';
      this.undos.set(id, fn);
    }
    if (thread === this.thread) await this.save();
    this.emit();
  };

  // «Повторить»: the history as it is, sent again; nothing is added twice.
  retry = async () => {
    await this.ready;
    const last = this.thread.messages.at(-1);
    if (this.busy || this.running || !last) return;
    const epoch = this.epoch;
    this.busy = true;
    this.clearError();
    this.emit();
    try {
      if (last.role === 'assistant' && !(await this.sendResults())) return;
      this.calls = 0;
      await this.cycle(epoch);
    } catch {
      if (epoch === this.epoch) await this.fail('failed');
    } finally {
      if (epoch === this.epoch) { this.busy = false; this.emit(); }
    }
  };

  newThread = async () => {
    await this.ready;
    this.epoch += 1;
    this.busy = false;
    this.thinking = false;
    this.running = 0;
    this.calls = 0;
    this.errorCode = null;
    this.undos.clear();
    this.thread = emptyThread(this.me.id);
    await this.save();
    this.emit();
  };

  private async load() {
    const row = await this.db.assistant_threads.get(this.me.id);
    if (row) this.thread = row;
    // Calls of the last reply that neither finished nor wait for a decision were cut off by the app closing:
    // they are not run again, the model hears so.
    const calls = this.lastCalls();
    let touched = false;
    for (const u of calls) {
      const pending = (this.thread.pending ??= {});
      const card = this.thread.cards?.[u.id];
      if (pending[u.id] || card?.status === 'pending') continue;
      pending[u.id] = { content: INTERRUPTED, is_error: true };
      if (card) { card.status = 'failed'; card.error = INTERRUPTED; }
      touched = true;
    }
    this.errorCode = (this.thread.error as ErrorCode | null | undefined) ?? (this.unanswered() ? 'interrupted' : null);
    if (touched) await this.save();
    this.loaded = true;
    this.emit();
  }

  private async cycle(epoch: number) {
    for (;;) {
      if (this.calls >= MAX_CALLS) { await this.fail('limit'); return; }
      this.calls += 1;
      this.thinking = true;
      this.emit();
      let r: ApiReply;
      try {
        r = await this.api({ mode: 'chat', messages: [...this.thread.messages], ...(this.screen ? { screen: this.screen } : {}) });
      } catch {
        r = { error: 'network' };
      }
      if (epoch !== this.epoch) return;
      this.thinking = false;
      if ('error' in r) { await this.fail(r.error); return; }
      // An empty turn cannot stay in the history (the API refuses it), so it is not kept.
      if (!r.content.length) { await this.fail('failed'); return; }
      this.thread.messages.push({ role: 'assistant', content: r.content });
      this.thread.error = null;
      await this.save();
      this.emit();
      const next = await this.runCalls(epoch);
      if (epoch !== this.epoch || next !== 'ready') { this.emit(); return; }
      await this.sendResults();
    }
  }

  // Runs what can run at once and puts a card on what needs a decision.
  private async runCalls(epoch: number): Promise<'none' | 'waiting' | 'ready'> {
    const calls = this.lastCalls();
    if (!calls.length) return 'none';
    const pending = (this.thread.pending ??= {});
    const cards = (this.thread.cards ??= {});
    for (const u of calls) {
      if (pending[u.id] || cards[u.id]) continue;
      const kind = kindOf(u.name);
      const parentsOnly = !!TOOLS.find((t) => t.name === u.name)?.parentsOnly;
      if (!kind || (parentsOnly && this.me.role !== 'parent')) {
        // Unknown, or not for this member: refused without asking, and no card.
        const r = await this.safeRun(u);
        pending[u.id] = { content: r.result, is_error: true };
      } else if (kind === 'read') {
        const r = await this.safeRun(u);
        pending[u.id] = { content: r.result, is_error: !!r.error };
      } else {
        const p = await planTool(u.name, u.input, this.ctx());
        if (p.error) {
          pending[u.id] = { content: `Ошибка: ${p.error}`, is_error: true };
        } else if (kind === 'confirm') {
          cards[u.id] = { tool: u.name, kind: 'confirm', summary: p.summary, status: 'pending' };
        } else {
          const card: CardState = { tool: u.name, kind: 'auto', summary: p.summary, status: 'running' };
          cards[u.id] = card;
          this.emit();
          const r = await this.safeRun(u);
          pending[u.id] = { content: r.result, is_error: !!r.error };
          card.status = r.error ? 'failed' : 'done';
          if (r.error) card.error = shown(r.result);
          if (r.undo) this.undos.set(u.id, r.undo);
        }
      }
      if (epoch !== this.epoch) return 'waiting';
      await this.save();
      this.emit();
    }
    return calls.every((u) => pending[u.id]) ? 'ready' : 'waiting';
  }

  private async safeRun(u: ToolUse): Promise<ToolRun> {
    try {
      return await runTool(u.name, u.input, this.ctx());
    } catch (e) {
      return { result: `Ошибка: не получилось выполнить (${(e as Error)?.message || 'неизвестная ошибка'}).`, summary: u.name, error: true };
    }
  }

  // All results of the last reply in one message of their own, in the order of the calls. The check and the
  // append happen before any await, so two decisions finishing together cannot send them twice.
  private async sendResults(): Promise<boolean> {
    const last = this.thread.messages.at(-1);
    if (!last || last.role !== 'assistant') return false;
    const calls = toolUses(last.content);
    const pending = this.thread.pending ?? {};
    if (!calls.length || !calls.every((u) => pending[u.id])) return false;
    this.thread.messages.push({
      role: 'user',
      content: calls.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: pending[u.id].content, is_error: pending[u.id].is_error })),
    });
    this.thread.pending = {};
    await this.save();
    return true;
  }

  // A new question while a card still waits: the card closes as not done, and its result goes first.
  private async closeOpenCalls() {
    const calls = this.lastCalls();
    if (!calls.length) return;
    const pending = (this.thread.pending ??= {});
    for (const u of calls) {
      if (pending[u.id]) continue;
      const card = this.thread.cards?.[u.id];
      if (card?.status === 'pending') card.status = 'declined';
      pending[u.id] = card ? { content: UNANSWERED, is_error: false } : { content: INTERRUPTED, is_error: true };
    }
    await this.sendResults();
  }

  private lastCalls(): ToolUse[] {
    const last = this.thread.messages.at(-1);
    return last?.role === 'assistant' ? toolUses(last.content) : [];
  }

  // The history ends where the model owes an answer: a question, or results not yet sent.
  private unanswered(): boolean {
    const last = this.thread.messages.at(-1);
    if (!last) return false;
    if (last.role === 'user') return true;
    const calls = toolUses(last.content);
    return calls.length > 0 && calls.every((u) => this.thread.pending?.[u.id]);
  }

  private tooLong() {
    const m = this.thread.messages;
    return m.length >= MAX_THREAD_MESSAGES || JSON.stringify(m).length >= MAX_THREAD_BYTES;
  }

  private ctx(): ToolCtx { return { db: this.db, me: this.me, members: this.members, today: this.now() }; }

  private clearError() { this.errorCode = null; this.thread.error = null; }

  private async fail(code: ErrorCode) {
    this.thinking = false;
    this.errorCode = code;
    this.thread.error = code;
    await this.save();
    this.emit();
  }

  private async save() {
    this.thread.updated_at = new Date().toISOString();
    await this.db.assistant_threads.put(this.thread);
  }

  private emit() {
    this.state = this.build();
    for (const fn of [...this.listeners]) fn();
  }

  private build(): AssistantState {
    const items: ChatItem[] = [];
    const cards: ActionCard[] = [];
    this.thread.messages.forEach((m: ApiMessage, i) => {
      if (m.role === 'user') {
        const text = m.content.filter(isText).map((b) => b.text).filter((t) => !t.startsWith(SNAPSHOT_TAG) && !t.startsWith(UNDONE_TAG)).join('\n');
        const images = m.content.filter((b) => b.type === 'image').map(dataUrl).filter((x): x is string => !!x);
        if (text || images.length) items.push({ type: 'user', key: `m${i}`, text, images });
        return;
      }
      // Only the model's words: thinking and fallback blocks stay in the history, never on screen.
      const text = m.content.filter(isText).map((b) => b.text.trim()).filter(Boolean).join('\n\n');
      if (text) items.push({ type: 'assistant', key: `m${i}`, text });
      for (const u of toolUses(m.content)) {
        const c = this.thread.cards?.[u.id];
        if (!c) continue;
        const card: ActionCard = {
          id: u.id, tool: c.tool, kind: c.kind, summary: c.summary, status: c.status,
          ...(c.error ? { error: c.error } : {}),
          ...(c.status === 'pending' ? { decide: (yes: boolean) => this.decide(u.id, yes) } : {}),
          ...(c.status === 'done' && c.kind === 'auto' && this.undos.has(u.id) ? { undo: () => this.undo(u.id) } : {}),
        };
        cards.push(card);
        items.push({ type: 'action', key: u.id, card });
      }
    });
    return {
      loaded: this.loaded, items, cards, thinking: this.thinking, busy: this.busy || this.running > 0 || this.thinking,
      error: this.errorCode ? ERROR_TEXT[this.errorCode] : null, errorCode: this.errorCode, wasReset: !!this.thread.reset,
    };
  }
}

// One session per member and database for the app's lifetime, so leaving the screen keeps a reply on its way.
const sessions = new WeakMap<LocalDb, Map<string, AssistantSession>>();
export function sessionFor(db: LocalDb, me: Member, members: Member[]): AssistantSession {
  let byMember = sessions.get(db);
  if (!byMember) { byMember = new Map(); sessions.set(db, byMember); }
  let s = byMember.get(me.id);
  if (!s) { s = new AssistantSession({ db, me, members }); byMember.set(me.id, s); } else s.setFamily(me, members);
  return s;
}

export type AssistantApi = AssistantState & {
  send: (text: string, images?: AssistantImage[]) => Promise<boolean>;
  decide: (id: string, yes: boolean) => Promise<void>;
  undo: (id: string) => Promise<void>;
  retry: () => Promise<void>;
  newThread: () => Promise<void>;
};

// The screen's view of the conversation. screen: where the person came from (home, menu, shop, board, money).
export function useAssistant(me: Member, members: Member[], screen?: string, opts: { db?: LocalDb; session?: AssistantSession } = {}): AssistantApi {
  const db = opts.db ?? localDb;
  const injected = opts.session;
  // members reach the session through the effect below; a new list must not make a new session.
  const session = useMemo(() => injected ?? sessionFor(db, me, members), [injected, db, me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { session.setFamily(me, members); }, [session, me, members]);
  const state = useSyncExternalStore(session.subscribe, session.getState);
  return useMemo(() => ({
    ...state,
    send: (text: string, images?: AssistantImage[]) => session.send(text, images, screen),
    decide: session.decide, undo: session.undo, retry: session.retry, newThread: session.newThread,
  }), [state, session, screen]);
}

// A photo for send(): base64 without the data: prefix.
export function imageFromBlob(blob: Blob): Promise<AssistantImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ media_type: IMAGE_TYPES.includes(blob.type as ImageType) ? (blob.type as ImageType) : 'image/jpeg', data: url.slice(url.indexOf(',') + 1) });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
