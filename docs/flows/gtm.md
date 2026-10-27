# GTM

Folder: `src/gtm/`. Page: `/gtm`.

## Done

One campaign is `active`. Its channels are the ones Discover and Reach use. `followup_days` is how long a first send waits before the follow-up shell is due.

## Steps

1. `create_campaign` from the profile: name, goal, offer, audience, channels. Status stays `draft`.
2. Stop. The person presses Start.
3. `campaign_view` when you need counts. Do not re-do Discover's or Reach's work in this folder.

## Must not

Set status to `active` from a tool. Put send logic here. Store the campaign in a JSON file.
