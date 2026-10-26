-- Honours kiosk redesign (A1): club-wide kiosk display defaults.
-- Additive only:
--   honour_display_settings.kiosk_look   motion + size defaults edited on the Look tab
--                                        (move, trans, dur, size, perPage, pageSecs, speed,
--                                        hold, columnsPerScreen); each board's board_configs
--                                        entry overrides them
-- '{}' everywhere on deploy: an empty look is derived from the existing kiosk_dwell_ms,
-- kiosk_end_hold_ms and kiosk_scroll_speed columns, so nothing changes until a club saves one.
-- Apply BEFORE republishing: the new code selects this column.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "honour_display_settings" ADD COLUMN IF NOT EXISTS "kiosk_look" jsonb DEFAULT '{}'::jsonb NOT NULL;
