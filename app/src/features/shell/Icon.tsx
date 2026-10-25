const PATHS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  menu: '<path d="M7 3v8"/><path d="M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7 11v10"/><path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 6.5V13H17"/>',
  cart: '<path d="M3 4h2.2l2.3 11h10.8l2.2-8H7"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  spark: '<path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z"/><path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>',
  photo: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M8.5 6 10 3.5h4L15.5 6"/><circle cx="12" cy="13" r="3.5"/>',
  send: '<path d="M4 12 20 4l-5 16-3.5-6.5Z"/><path d="m11.5 13.5 4-4"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14.5h2"/>',
  board: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M12 9v11M4 13h16"/><path d="M12 9C10 5 6.5 5 6.5 7.2S10 9 12 9c2 0 5.5 0 5.5-1.8S14 5 12 9Z"/>',
  metoo: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4"/><path d="M19 12H9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  swap: '<path d="M7 4 4 7l3 3"/><path d="M4 7h13"/><path d="m17 20 3-3-3-3"/><path d="M20 17H7"/>',
};

export default function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />;
}
