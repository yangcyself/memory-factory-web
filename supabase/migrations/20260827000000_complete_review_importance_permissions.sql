-- complete_review owns the entire review transaction, including the audited
-- importance change. Run it with the function owner's table privileges because
-- authenticated users intentionally cannot update items.importance directly.
-- The function still derives the acting user from auth.uid() and scopes every
-- read and write to that user.
alter function public.complete_review(uuid, smallint, smallint) security definer;
