import type { AssistantError } from '../../../../supabase/functions/_shared/assistant';

// The Messages API wire format, as much of it as the phone builds or reads. Blocks the model returns
// (thinking with its signature, fallback, tool_use) are kept whole and sent back unchanged.
export type Block = { type: string; [key: string]: unknown };
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AssistantImage = { media_type: ImageType; data: string };
export type ToolUse = { type: 'tool_use'; id: string; name: string; input: unknown };
export type ApiMessage = { role: 'user' | 'assistant'; content: Block[] };

export type ChatBody = { mode: 'chat'; messages: ApiMessage[]; screen?: string };
export type ApiReply = { content: Block[]; stop_reason: string | null } | { error: AssistantError | 'network' };

export type CardStatus = 'pending' | 'running' | 'done' | 'undone' | 'failed' | 'declined';
export type CardState = { tool: string; kind: 'auto' | 'confirm'; summary: string; status: CardStatus; error?: string };
export type ToolOutcome = { content: string; is_error: boolean };

// One conversation per member, only on this phone. messages only ever grow; pending holds the results
// of the last reply's tool calls until all of them are in; notes tell the model what was undone since.
export type AssistantThread = {
  member_id: string;
  messages: ApiMessage[];
  snapshot_hash: string;
  updated_at: string;
  pending?: Record<string, ToolOutcome>;
  cards?: Record<string, CardState>;
  notes?: string[];
  // Started by itself because the previous conversation grew too long.
  reset?: boolean;
  error?: string | null;
};
