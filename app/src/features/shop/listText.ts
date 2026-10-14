import { deptRank } from './build';

export function listText(title: string, rows: Array<{ title: string; qty_text: string; dept: string; urgent: boolean }>): string {
  const depts = [...new Set(rows.map((r) => r.dept))].sort((a, b) => deptRank(a) - deptRank(b));
  const blocks = depts.map((d) => [d, ...rows.filter((r) => r.dept === d).map((r) => `— ${r.title}${r.qty_text ? `, ${r.qty_text}` : ''}${r.urgent ? ' (срочно)' : ''}`)].join('\n'));
  return [title, '', blocks.join('\n\n')].join('\n');
}
