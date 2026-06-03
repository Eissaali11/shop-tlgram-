-- جدول رسائل الدعم. القيد UNIQUE على tg_message_id ضروري حتى يعمل upsert بدون تكرار.

create table if not exists public.support_messages (
    id                 bigint generated always as identity primary key,
    tg_message_id      text unique not null,
    chat_name          text,
    message            text,
    sender             text,
    sent_at            timestamptz,
    status             text default 'pending', -- pending, analyzed, resolved
    sentiment          text,                   -- positive, neutral, negative
    category           text,                   -- billing, technical, sales, general, complaint
    urgency            text,                   -- high, medium, low
    evaluation_summary text,
    rating             integer,                -- 1 to 5
    created_at         timestamptz default now()
);

create index if not exists support_messages_status_idx
    on public.support_messages (status);

create index if not exists support_messages_sent_at_idx
    on public.support_messages (sent_at desc);

create index if not exists support_messages_urgency_idx
    on public.support_messages (urgency);

create index if not exists support_messages_rating_idx
    on public.support_messages (rating);
