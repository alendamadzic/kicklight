-- Local mode pins the bridge's TLS certificate at pairing (trust on first use).
-- The fingerprint is a public hash of a public certificate, so it is not a secret.
alter table public.hue_links add column if not exists cert_fingerprint text;
