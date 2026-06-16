/**
 * Node Color Configuration
 * -------------------------
 * Centralized color mapping for node types.
 * Used for edges, minimap, and node styling.
 */

// Hex color values for each node type
export const NODE_TYPE_COLORS: Record<string, string> = {
  // ── Triggers ──────────────────────────────────────────────────────────────
  trigger: '#10b981',          // Emerald
  inbox_trigger: '#0ea5e9',    // Sky Blue

  // ── Actions ───────────────────────────────────────────────────────────────
  action: '#8b5cf6',           // Violet
  send_reply: '#14b8a6',       // Teal
  send_whatsapp: '#25d366',    // WhatsApp Green
  send_email: '#3b82f6',       // Blue
  send_sms: '#f59e0b',         // Amber
  send_telegram: '#0ea5e9',    // Sky
  send_instagram: '#e1306c',   // Instagram Pink
  vapi: '#5b21b6',             // Deep Purple
  webrtc: '#0284c7',           // Sky-700 (WebRTC)

  // ── Logic & Flow ──────────────────────────────────────────────────────────
  wait: '#3b82f6',             // Blue
  decision: '#f59e0b',         // Amber
  approval: '#6366f1',         // Indigo
  iterator: '#f97316',         // Orange
  split: '#d946ef',            // Fuchsia  (Parallel Split)
  join: '#c026d3',             // Fuchsia-700 (Parallel Join)
  end: '#ef4444',              // Red (terminal)

  // ── AI & Intelligence ─────────────────────────────────────────────────────
  ai_decision: '#ec4899',      // Pink
  ai_action: '#a855f7',        // Purple
  ai_router: '#e11d48',        // Rose (AI Router)
  morgan_leads: '#e11d48',     // Rose (Morgan Leads)
  flyn_feedback: '#f59e0b',    // Amber (Flyn Feedback)
  hr_voice_agent: '#eab308',   // Yellow (HR Voice)
  freelancer_voice_agent: '#0d9488', // Teal
  church_voice_agent: '#db2777', // Pink
  voice_agent: '#6366f1',        // Indigo (Dynamic Agent)

  // ── Data & Integration ────────────────────────────────────────────────────
  query_records: '#06b6d4',    // Cyan
  mongodb: '#00ed64',          // Mongo Green
  postgresql: '#336791',       // PG Blue
  mysql: '#f29111',            // MySQL Orange
  merge: '#2dd4bf',            // Teal-400

  // ── Plugins ───────────────────────────────────────────────────────────────
  crm: '#7c3aed',              // Violet-700
  hr: '#eab308',               // Yellow (HR)
  church: '#db2777',           // Pink-600 (Church)
  freelancer: '#0d9488',       // Teal-600 (Freelancer)
  coaches: '#7c3aed',          // Violet (Coaches) — differs from crm shade
};

// Default color for unknown node types
export const DEFAULT_NODE_COLOR = '#64748b'; // Slate

/**
 * Get the hex color for a given node type
 */
export const getNodeColor = (nodeType: string): string => {
  return NODE_TYPE_COLORS[nodeType] || DEFAULT_NODE_COLOR;
};

/**
 * Get a lighter/darker shade for gradients and hover states
 */
export const getNodeColorShade = (nodeType: string, opacity: number = 0.5): string => {
  const color = getNodeColor(nodeType);
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
};
