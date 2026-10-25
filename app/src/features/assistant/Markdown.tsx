import { Fragment, type ReactNode } from 'react';

// The little the assistant writes with: paragraphs, «- » and «1. » lists, **bold**. Plain text otherwise,
// never HTML: the reply goes in as text nodes.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, k) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <b key={k}>{part.slice(2, -2)}</b> : <Fragment key={k}>{part.replace(/\*\*/g, '')}</Fragment>);
}

export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((t, k) => <li key={k}>{inline(t)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
    } else if (!line) {
      flushPara(); flushList();
    } else {
      flushList();
      // A heading the model may still write reads as a bold line.
      para.push(line.replace(/^#{1,6}\s+/, ''));
    }
  }
  flushPara(); flushList();
  return <>{blocks}</>;
}
