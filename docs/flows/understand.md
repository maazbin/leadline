# Understand

Folder: `src/understand/`. Page: `/setup`.

## Done

`profileGaps()` is empty. That needs a business name, the sender's name, an offer, an audience, a problem, and either a website or notes.

## Two ways in

The person can type the form. Or they can hand over materials, and you write the empty fields from those:

- A PDF. `add_pdf` with the file path. Text is extracted on the machine. A scan with no selectable text stays `no_text` and does not fill the profile.
- Their website, as a public page.
- Their own social profile URLs: LinkedIn, X, Instagram, Facebook, TikTok, Reddit, YouTube. `add_materials` stores them. `read_source` opens each one in the Leadline Chrome only after that account is signed in. `needs_login` stores nothing about the business. Ask them to sign in, then read it again. Do not type the password.

## Steps

1. If `next_action` says `read_source`, do that one id.
2. If it says `sign_in`, the Leadline Chrome is not signed in to that platform. Stop on that profile. Other work waits until the profile exists.
3. If it says `fill_profile`, read the `profile` slice and call `fill_profile` with only facts that appear in the material. Leave a gap when the material does not say it. A field the person already typed is skipped.
4. `ask_person` when a fact is still missing. Stop asking once a question is open.
5. Do not search or draft until the gaps are empty.

`read_website` still stores pages and does not by itself overwrite their words. `fill_profile` is the write, and only into blank fields.

## Must not

Invent proof, prices, or customers. A person's answer overwrites an agent answer, never the other way. A logged-out social page is not a source.
