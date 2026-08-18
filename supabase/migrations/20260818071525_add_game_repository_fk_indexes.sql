-- Keep foreign-key checks and parent-row deletes from scanning the durable
-- command and event histories as those tables grow.

create index game_commands_user_idx
  on game_private.game_commands (user_id);

create index game_events_round_idx
  on game_private.game_events (round_id);
