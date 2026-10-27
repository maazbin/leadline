# Discover

Folder: `src/discover/`. Page: `/discover`.

## Done

A lead row exists with a source, a canonical URL, and a fit of yes, maybe, or no.

## Steps

1. `discover_hints`, or `reddit_search` for a public read.
2. `browser_open` the URL. `browser_snapshot`. Read `path_lookup` for that site first.
3. `save_lead` only when the page is a real person or company. Dedup is by URL and by email.
4. `set_lead_fit` with a reason. `no` skips them. Only `yes` may be drafted.

## Must not

Message from the search page. Save a do-not-contact match as anything but skipped. The save does that itself.
