// src/kernel/playbook.js — the starting playbook. Outcomes live in SQLite after this.
//
// Owns: the seed steps for each platform.
// Must not: read or write the database. seed.js inserts these once.

/** @type {Array<{ id: string, platform: string, when: string, step: string, result: string, evidence: string, sort: number }>} */
export const PLAYBOOK = [
  { id: 'ig-comments', platform: 'Instagram', when: 'A hiring or buyer post is open', step: 'Read the comments first. The email, link, or instruction is often there.', result: 'open', evidence: '', sort: 10 },
  { id: 'ig-bio', platform: 'Instagram', when: 'The caption points at the bio, or the comments do not name a link', step: 'Open the profile and use the link in the bio.', result: 'open', evidence: '', sort: 20 },
  { id: 'ig-dm', platform: 'Instagram', when: 'The post or the bio says to send a message', step: 'Send one short note. Do not open a personal chat or a promotion.', result: 'open', evidence: '', sort: 30 },
  { id: 'ig-old', platform: 'Instagram', when: 'The keyword grid is on screen', step: 'Treat the first posts as the newest.', result: 'failed', evidence: 'That grid was weeks old. Open a post from the last day.', sort: 40 },
  { id: 'ig-personal', platform: 'Instagram', when: 'The inbox shows a personal chat or a promotion', step: 'Reply in that thread.', result: 'failed', evidence: 'Those threads are not outreach.', sort: 50 },
  { id: 'ig-comment', platform: 'Instagram', when: 'Someone posted about their own job hunt', step: 'Leave one comment that names the offer. Skip a personal chat.', result: 'open', evidence: '', sort: 60 },
  { id: 'x-link', platform: 'X', when: 'The post has an apply or contact link', step: 'Open the link and complete the page it points to.', result: 'worked', evidence: 'A public reply is the wrong step when the post already has a link.', sort: 10 },
  { id: 'x-reply', platform: 'X', when: 'The post has an apply or contact link', step: 'Leave a public reply and stop.', result: 'failed', evidence: 'The link is the path. A reply does not replace it.', sort: 20 },
  { id: 'x-reply-people', platform: 'X', when: 'Someone else posted about their own job hunt', step: 'Reply once with the offer. Skip your own post and a post you already answered.', result: 'open', evidence: '', sort: 30 },
  { id: 'x-dm', platform: 'X', when: 'A person who is hunting can take a message', step: 'Send one short note in Messages. Do not open a promotion.', result: 'open', evidence: '', sort: 40 },
  { id: 'li-pace', platform: 'LinkedIn', when: 'A profile or message box is open', step: 'Send one note, then wait. Count it only when the page says it was sent.', result: 'worked', evidence: 'A burst is what gets the account restricted.', sort: 10 },
  { id: 'li-burst', platform: 'LinkedIn', when: 'Several people are open at once', step: 'Send them all in the same minute.', result: 'failed', evidence: 'Fast repeats are a restriction trigger. One write, then a long gap.', sort: 20 },
  { id: 'li-comment', platform: 'LinkedIn', when: 'Someone posted about their own job hunt', step: 'Leave one comment that names the offer. Do not start a Premium trial.', result: 'open', evidence: '', sort: 30 },
  { id: 'li-dm', platform: 'LinkedIn', when: 'A person who is hunting can take a message', step: 'Send one short note. If the page asks for Premium, stop and wait.', result: 'open', evidence: '', sort: 40 },
  { id: 'email-one', platform: 'Email', when: 'The lead has an email address', step: 'Send one note that names the offer and the recipient.', result: 'open', evidence: '', sort: 10 },
  { id: 'email-burst', platform: 'Email', when: 'A list of addresses is on screen', step: 'Send the whole list at once.', result: 'failed', evidence: 'Gmail throttles a burst. One send, then the next.', sort: 20 },
  { id: 'rd-thread', platform: 'Reddit', when: 'A relevant thread is open', step: 'Read the thread, then one reply that answers it.', result: 'open', evidence: '', sort: 10 },
  { id: 'fb-page', platform: 'Facebook', when: 'A page or a post is open', step: 'Respond to that post. Skip a personal profile you were not asked to message.', result: 'open', evidence: '', sort: 10 },
  { id: 'tt-one', platform: 'TikTok', when: 'A post from the last day is open', step: 'One comment or one post. Then wait.', result: 'open', evidence: '', sort: 10 },
  { id: 'wa-open', platform: 'WhatsApp', when: 'A chat is already open in WhatsApp Web', step: 'Send one note in that chat. A QR code waits for the person.', result: 'open', evidence: '', sort: 10 },
  { id: 'web-once', platform: 'Web', when: 'A public form is open', step: 'Submit it once. A captcha waits for the person.', result: 'open', evidence: '', sort: 10 },
  { id: 'vir-one', platform: 'Virality', when: 'A post is ready', step: 'Change one thing: the hook, the length, or the hour. Record the views you can see.', result: 'open', evidence: '', sort: 10 },
  { id: 'vir-spray', platform: 'Virality', when: 'The same asset is ready', step: 'Post it to every platform in the same minute.', result: 'failed', evidence: 'That pattern draws restrictions. One platform, then a gap.', sort: 20 },
];
