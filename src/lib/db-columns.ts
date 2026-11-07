// Columns the app reads from its own rows, shared by the browser stores and the server code
// that seeds them, so both always read the same shape.

/** `preferences` (own row). */
export const PREFERENCE_COLUMNS =
  "followed_teams, tv_delay_ms, brightness, default_stat, auto_start, strip_reversed, kit_overrides";

/** `sessions` (own rows). */
export const SESSION_COLUMNS =
  "id, league, event_id, stat, status, mode, delay_ms, snapshot, pause_reason, updated_at";
