---
name: society-voting
description: Use for the society Voting feature — SocialPanel "Voting" page (staff post a note with answer options such as Interested / Not interested, watch the ratio and who voted, end the vote, publish the result) and the member app Voting screen (vote once, see results after). Backend endpoints, rules, UI states and the dry check (see DRY_CHECK.md).
---

# Society Voting

Built on the existing `Poll` / `PollVote` models (they were already used by Community polls — keep that working).

## 1. Rules (enforced by the server)
- Only staff with the `community` permission (admin, secretary, manager) can read or change votes on the staff
  endpoints (treasurer and committee get 403, so hide the Voting nav item for them).
- A vote = question (5–300), optional note `description` (≤ 2000), 2–8 options (UI defaults to two:
  "Interested" / "Not interested", editable, add up to 4 in the UI), optional close time (≥ 5 min, ≤ 1 year ahead).
- Members with an **approved** membership of that society vote **once**; no changing (409 `ALREADY_VOTED`).
  Pending/suspended members and other societies can't see or vote (403 / 404). Double taps count once.
- Members see counts only after they voted or the vote ended. Staff always see counts, percentages and the voter
  list (name, flat, option, time) — `GET /society/polls/:id`.
- Ended = staff pressed **End now** (`status: closed`) or the close time passed. After that: no votes
  (409 `POLL_ENDED`); staff can publish a **result** text (`PUT /society/polls/:id/result`, 409 `POLL_OPEN` before
  the end); members get a notification and see the result on the vote. Editing the result later is allowed (audited).
- Delete only while nobody voted (409 `POLL_HAS_VOTES` → "End it instead").
- Notifications: new vote and first result → type `poll`, `data.route = 'Poll'`, `data.id` = poll id.
- Every staff action audited: `poll.created|closed|result_published|result_updated|deleted`.

## 2. API
Staff (`/society/*`, panel session): `GET /society/polls?status=open|ended&page&limit` (items with `ended`,
`options[].votes/percent`, `totalVotes`, `eligibleVoters`, `turnoutPercent`, `description`, `result`,
`resultPublishedAt`); `POST /society/polls { question, description?, options[], closesAt? (ISO with offset) }`;
`GET /society/polls/:id` (+ `votes[]`); `POST /society/polls/:id/close`; `PUT /society/polls/:id/result { result }`;
`DELETE /society/polls/:id`.
Members (`/resident/*`): `GET /resident/polls` (≤30 latest: `question, description, result, resultPublishedAt,
closesAt, open, myVote, totalVotes?, options[{_id,label,votes?}]`), `GET /resident/polls/:id`,
`POST /resident/polls/:id/vote { optionId }`.

## 3. UI
**SocialPanel → "Voting"** (sidebar under Residents, perm `community`; also keep any existing Community poll UI
working or point it to Voting):
- Tabs Open / Ended / All, cards with question, note, ratio bar per option (votes + %), turnout "x of y members
  (z%)", time left / ended date, result badge.
- "New vote": question, note, options (2 defaults, add/remove, max 4), close date + time (IST), preview.
- Detail drawer/page: ratio bars, turnout, voter table (name, flat, option, time; search; CSV export optional),
  **End now** (confirm), **Publish result** textarea (only when ended; edit later), **Delete** (only with 0 votes).
- Members' names are personal data: show them only here, never in member-facing screens.
**App → "Voting"** (Society hub tile + notification route `Poll`):
- List: open first, then ended; each card: question, note, options as large buttons (≥ 44 px), "You voted: X",
  closes-in text, after vote/end the result bars; ended with a published result shows a highlighted "Result" box.
- Confirm before voting ("You can't change your vote"), disable while sending, handle 409 by refreshing.
- Detail screen for `Poll` notifications (`/polls/[id]`).

## 4. Done means
Everything in `skills/society-voting/DRY_CHECK.md` passed and was reported with counts.
