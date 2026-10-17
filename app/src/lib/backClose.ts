import { createContext, useEffect, useRef } from 'react';

// The phone's Back button closes what is open on top (a sheet, a story) before it leaves the page.
// Every open layer stands on a history entry of its own with the page's URL, so react-router sees the
// same location on Back and keeps the page. Back takes the newest entry away and closes the newest layer;
// a layer closed by its cross, backdrop or Save takes its own entry away with history.go().
// Entries keep their depth in history.state (`layer`, next to react-router's usr/key/idx), so after any
// popstate the depth tells how many layers still have an entry, whoever moved the history.
//
// A sheet whose action opens another page (MealSheet «Заменить», a link in QuickAddSheet) leaves its
// entry under that page: the router pushed over it, and an entry below the current one cannot be taken
// away. Back from that page shows the old page from the leftover entry, and the next Back changes
// nothing visible. Nothing breaks: the leftover has the old page's URL and no layer is waiting for it.

type Layer = { back: () => void };
type Entry = { layer?: number; idx?: number } & Record<string, unknown>;

const open: Layer[] = []; // mounted layers, oldest first
let base = 0; // depth of the entry under the first layer
let at = 0; // depth of the entry the page stands on
let pageIdx: number | undefined; // react-router's idx and pathname of the page under the layers
let pagePath = '';
let moving = false; // our own history.go() has not landed yet
let target = 0; // the depth it goes to
let late = -1; // the same for a go() given up on, in case it lands after all
let carry: { url: string; state: unknown } | null = null;
let quiet = false;
let timer = 0;
let guard = 0;
let listening = false;
const after: Array<() => void> = [];

const entry = () => (history.state ?? null) as Entry | null;
const depth = () => entry()?.layer ?? 0;
function marked(state: unknown, n: number): Entry {
  const next = { ...(state as Entry | null) };
  if (n) next.layer = n;
  else delete next.layer;
  return next;
}

// History changes wait a tick: a sheet that closes as another opens (a list sheet handing over to its
// item) passes its entry on instead of going back and forward, and React's development double mount
// comes to nothing.
function schedule() {
  if (!timer) timer = window.setTimeout(sync, 0);
}

function sync() {
  timer = 0;
  if (moving) return;
  const s = entry();
  const d = depth();
  if (d !== at) {
    if (at > base && pageIdx !== undefined && s?.idx === pageIdx && location.pathname === pagePath) {
      // The router replaced the top entry (a sheet's onClose with setParams(..., { replace: true })): still ours.
      history.replaceState(marked(s, at), '');
    } else {
      // The router pushed another entry over ours, or the app has just started: count from here.
      base = at = d;
    }
  }
  const want = base + open.length;
  if (want < at) {
    // A replaced top entry takes its URL down with it, so the page keeps the address it asked for.
    carry = { url: location.href, state: history.state };
    moving = true;
    target = want;
    guard = window.setTimeout(lost, 2000);
    history.go(want - at);
    return;
  }
  if (want > at) {
    if (at === base) { pageIdx = s?.idx; pagePath = location.pathname; }
    while (at < want) history.pushState(marked(history.state, ++at), '');
  }
  for (const fn of after.splice(0)) fn();
}

// A history.go() that has not landed in two seconds: stop waiting, so sheets keep closing, and treat
// the entries left over as the page's own. If it lands later after all, onPop knows it by its depth.
function lost() {
  moving = false;
  late = target;
  carry = null;
  at = depth();
  base = at - open.length;
  schedule();
}

function onPop() {
  if (quiet) return;
  const d = depth();
  if (moving) {
    moving = false;
    late = -1;
    window.clearTimeout(guard);
    at = d;
    const c = carry;
    carry = null;
    if (c && c.url !== location.href) {
      history.replaceState(marked(c.state, d), '', c.url);
      // react-router reads the new address on popstate, as after a real Back.
      quiet = true;
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      quiet = false;
    }
  } else if (d === late) {
    late = -1;
    at = d;
    base = d - open.length;
  } else {
    // Back by the person: the layers whose entries are gone close, newest first. One that stays open
    // (asks before throwing away what is typed) gets a new entry from sync().
    const keep = Math.min(open.length, Math.max(0, d - base));
    for (const l of open.slice(keep).reverse()) l.back();
    at = d;
    base = d - keep;
  }
  schedule();
}

// Makes the component a layer that Back closes: onBack runs instead of the page going back.
// active=false while the layer is already backed by its own URL (see OwnUrl).
export function useBackClose(onBack: () => void, active = true) {
  const latest = useRef(onBack);
  useEffect(() => { latest.current = onBack; });
  useEffect(() => {
    if (!active) return;
    if (!listening) { window.addEventListener('popstate', onPop); listening = true; }
    const layer = { back: () => latest.current() };
    open.push(layer);
    schedule();
    return () => {
      const i = open.indexOf(layer);
      if (i >= 0) open.splice(i, 1);
      schedule();
    };
  }, [active]);
}

// Runs fn once the entries of layers that just closed are gone, so a page's own navigate() lands on
// the page's entry, not on a sheet's. With no layer open and nothing on the way, it runs right away.
export function afterBackClose(fn: () => void) {
  if (!open.length && !timer && !moving && at === base) { fn(); return; }
  after.push(fn);
  schedule();
}

// True for the sheet right inside: it is shown because of its own URL (?add=1), which already is its
// history entry, so Back closes it through the router. Sheets opened from it are layers again.
export const OwnUrl = createContext(false);

// Location state of a sheet URL pushed by a tap: the page's entry is right below, and closing goes back to it.
export const OPENED_HERE = { sheet: true };
export const openedHere = (state: unknown) => !!(state as { sheet?: boolean } | null)?.sheet;
