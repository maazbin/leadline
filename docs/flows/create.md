# Create

Folder: `src/create/`. Page: `/create`. Lane: `next_action` with `lane` `create`.

## Done

A draft exists for a channel on the active campaign, or the person has marked one published after they posted it.

## Steps

1. Wait until a campaign is active. Content does not start the campaign.
2. `create_content` for one channel that has no live draft.
3. Stop. The person approves it, opens the composer, posts it, and marks it published.

## Must not

Press Post. Add a tool that sets status to `published`. Block the Reach lane on a missing post.
