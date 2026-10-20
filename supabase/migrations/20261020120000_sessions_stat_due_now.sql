-- A stat switch from the phone makes the session due at once, so the next tick puts it on
-- the lights instead of waiting out the polling window. It also covers a switch that lands
-- while a tick is mid-flight: that tick writes back the stat it ran with (runner_state's
-- appliedStat) along with a fresh snapshot, and if that no longer matches, the session
-- stays due. The claim update only moves next_due_at, so it never trips this.

create function public.sessions_stat_due_now() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.stat is distinct from old.stat
      or new.snapshot is distinct from old.snapshot)
     and coalesce(new.runner_state->>'appliedStat', new.stat) <> new.stat then
    new.next_due_at := least(new.next_due_at, now());
  end if;
  return new;
end;
$$;

create trigger sessions_stat_due_now before update on public.sessions
  for each row execute function public.sessions_stat_due_now();
