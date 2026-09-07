-- A15 contact inbox: track who handled a message and when.
alter table contact_messages add column handled_at timestamptz;
--;;
alter table contact_messages add column handled_by text;
