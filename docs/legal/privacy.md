# Privacy Notice

VERSION 0.7 · LAST UPDATED AUG 20, 2026

In this notice, "we" and "us" mean **zZuP!, Inc.**

---

## THE SHORT VERSION

- We collect your personal data: your account, your profile, the things you write, and the images and voice messages you send.
- Your pet is an AI. What you say to it — and photos you send it — go to **OpenAI** to generate a reply. Your pet also keeps written notes about you ("pet memories"), which are personal data.
- **"Anonymous" means one thing here:** in places like group chats and zZuPer Pulse, you can act through your pet instead of your name. **We still know who you are.** That is deliberate — it is what lets us meet our legal obligations and act when someone is harmed.
- **You cannot delete a message once you have sent it.** You carry the consequences of what you send, including being reported, losing your account, or facing a legal claim.
- **You can delete your account.** Your name, your photos, and your profile details are erased within seconds. What you sent, the groups you joined, your interactions, and your pet's memories of you stay, attributed to "Deleted user". The full list is below.

---

## Who we are

zZuP! is operated by **zZuP!, Inc., a Delaware corporation** ("zZuP", "we", "us"), of **251 Little Falls Drive, Wilmington, New Castle County, DE 19808**. We are the **business** responsible for the personal information described here, processed through the zZuP! mobile app and this website (together, the "Service").

Privacy questions, rights requests and complaints: <admin@zzup.org>.

**zZuP! is offered in the United States only.** We are a US company and our infrastructure is in the US. We do not offer the Service to people in the UK or the European Economic Area, and we do not target them.

## What we collect

### Account

- **Email address** and **password**. Passwords are stored only as a salted hash by our authentication provider.
- **zZuP ID** — a sequential public number (00001, 00002, …) issued at sign-up.

### Profile you fill in

- **Real identity:** display name, bio, avatar, date of birth, gender, nationality, university, contact email, student (.edu) email.
- **Pet identity:** pet name, breed, growth stage, bio, avatar, level and experience points.
- **Settings:** whether strangers can reach you at all, whether your real name is searchable, and which routes people may add you through (search or your profile).

**Two fields are never shown to anyone else, under any setting:** your date of birth (other users can only ever see a derived age) and your contact email. This is enforced in the database itself — the columns are revoked from the app's read permissions, so it holds even if a client is modified.

### What you write and send

- **Messages** — content, which identity you sent them as, timestamps, and any attachments.
- **Voice messages** — in one-to-one chats and Packs you can record and send audio. We store the recording. It is not transcribed, and it is not sent to any AI provider. Your pet cannot hear it, and Pulse does not accept it.
- **Roam notes** — the text or image you hand your pet before sending it out, plus who has already seen it, so the same note is never shown to the same person twice.
- **Replies** left on other people's roaming pets.
- **Pulse intent** — the short "what I'm up for right now" line you type before matching.

### Images, files and voice messages

- **Before an image leaves your phone we re-encode it**, which strips EXIF metadata including GPS coordinates, and cap it at 2048px.
- **Voice messages are capped at two minutes** and are stored as recorded. Like every other message, once sent they cannot be deleted.
- **Chat attachments** — images, files and voice messages — live in private storage. They are readable only by members of that conversation, and the app fetches them through links that expire after one hour, so a leaked URL stops working.
- **You do not upload a profile picture.** Your avatar is chosen from the looks and decorations we provide.

### Derived data

- **Interest vector** — when you enter the Pulse queue we convert your intent line plus your bio, pet bio and university into a numeric embedding, and store it on your profile to match you with someone.
- **Roam note vectors** — the same, computed from each note's content.
- **Pet memories** — see below.

### Technical data

- Server-side request logs kept by our infrastructure provider, including **IP address**, timestamps and error traces.
- **When you file a report, and when our automated check flags something as child sexual content, we record the IP address and country the request came from** and keep it with that record. This is deliberate: without it we cannot tell one bad actor with ten accounts from ten different people, and it is what a law-enforcement referral needs. We do not log your IP against ordinary activity — sending a message, posting a Roam note, or talking to your pet does not create one of these records.

## Your pet is an AI

Your pet has no mind. It is a large language model operated by **OpenAI, L.L.C.** Every reply you get is generated by sending data to OpenAI's servers in the United States.

### What we send OpenAI

- The message you just typed, and up to your last six messages with your pet for context.
- **Any photo you send your pet.**
- Your first name, your pet's name, breed and stage.
- Relevant pet memories (below).
- For Roam and Pulse: the note or intent line you wrote, your bio, pet bio and university — and, when you are matched, the same fields for the person you matched with, in order to generate a shared topic and the pets' opening lines.

We do **not** send OpenAI your email address, your date of birth, your password, your private messages with other humans, or your zZuP ID.

### Pet memories

After each thing you say to your pet, a second AI call reads it and writes down any personal fact it finds — *"Owner loves eating ramen"*, *"Owner is studying Computer Science"* — and stores that sentence, with a vector of it, against your account. Later conversations search those notes so your pet appears to remember you.

**This is an automatically generated profile of you, written by a machine, and it is personal data.** It can be wrong. It is not shown to other users, and it is not sent to anyone but OpenAI when generating your pet's replies. You see parts of it as you talk — your pet brings a note up when it is relevant to what you just said.

### OpenAI's terms

- OpenAI does not train its models on data sent through its API.
- OpenAI retains API inputs and outputs for up to **30 days** for abuse monitoring, then deletes them, unless law requires otherwise.
- We have a Data Processing Addendum in place with OpenAI.

### Its limits

AI output can be wrong, strange, or both. Your pet is not a doctor, lawyer, therapist, financial adviser, or any other kind of professional, and it is not an emergency service. If you are in crisis, read our [Safety page](safety.html), which sets out what your pet does when someone expresses thoughts of self-harm, and where to get real help.

## What we do not do

- **We do not sell personal information**, and we do not "share" it for cross-context behavioural advertising as California law defines those terms.
- **There is no advertising in zZuP!**, and no advertising or attribution SDK in the app.
- **There is no analytics SDK.** We do not track which screens you visit or build a behavioural profile of your usage.
- **We do not collect your location.** "Campus first" ordering compares the university name you typed into your profile — nothing more. The app has no GPS feature, and it does not request a location permission on either platform.
- **We do not read your contacts**, your photo library beyond the images you pick, your calendar, or your other apps.
- **We do not currently use your content to train any AI model**, ours or anyone else's. If that changes, we will tell you before it takes effect.

## US state privacy law — categories and rights

California, Delaware, Virginia, Colorado, Texas and a growing list of other states give residents rights over their personal information. The rights set out below are available to every user in the United States.

Mapped to the statutory categories California uses:

| Category | Do we collect it? |
|---|---|
| Identifiers | Yes — name, email, zZuP ID, account ID, IP address in server logs and in safety records |
| Protected classification characteristics | Yes, if you fill them in — date of birth, gender, nationality |
| Education information | Yes — the university you type in, and a student email if you add one |
| Audio, visual or similar information | Yes — images and voice messages you send |
| Internet or network activity | Operational server logs, plus the IP address recorded with a report or a child-safety flag. No browsing history, no cross-site tracking |
| Inferences drawn to create a profile | **Yes — pet memories and interest vectors** |
| Geolocation data | No |
| Biometric information | No |
| Commercial or financial information | No — there is nothing to buy |
| Employment information | No |

**We do not sell personal information and we do not share it for cross-context behavioural advertising**, as those terms are defined in California law. We have not done so in the preceding 12 months. We do not knowingly sell or share the personal information of anyone under 16.

## Who else sees your data

- **Other users** — as much as the identity and visibility settings you chose.
- **Supabase** — our database, authentication, file storage and server functions. Hosted in **US East (N. Virginia)**.
- **OpenAI, L.L.C.** (United States) — as described above.
- **Resend** (United States) — sends our email: sign-up confirmations, password resets, and the receipt you get when you write to us. It handles your email address and the contents of those messages.
- **Discord** (United States) — our staff alerts arrive in a private channel there. A report, a moderation hit, an enforcement action, a new sign-up or a message sent through our contact form raises one. **These alerts contain personal data**: the zZuP IDs involved, what you wrote in a report or a contact form, the email address you gave us, and — for a moderation hit — the **IP address** and country the request came from. They do not contain your messages to other users or to your pet.
- **Apple and Google** — they operate the app stores you install from and handle crash reporting at the OS level under their own privacy policies. We have not integrated any third-party crash or analytics service of our own.
- **Law enforcement and regulators** — when legally compelled, or where we believe in good faith that disclosure is needed to prevent serious harm.
- **A successor** — if the company is acquired or merged, bound by this notice.

**Everything is stored and processed in the United States.** Your data is not transferred abroad.

## How anonymous your pet actually is

Read this part carefully.

- **Against other users, in normal use:** your pet identity does not reveal your real name, avatar or profile.
- **Against us: none.** We hold your account, both of your identities, and what each of them did. This is deliberate. It is what lets us act on reports, protect other users, and respond to a lawful demand.
- **Against a determined technical attacker:** we have protections in place and they are not absolute. Someone who inspects network traffic or modifies the app may be able to link a pet identity to an account. We do not promise otherwise, and we do not warrant the Service against that — see the Disclaimers in our [Terms](terms.html).
- **Against yourself:** if you type your name, your hall of residence or your timetable into a pet conversation, that is your own doing. Nothing we build can unsay it.

## How long we keep things, and what deletion really does

### Messages are permanent

Sent messages cannot be deleted by anyone — not by you, not by the person who received them, and not by us in the ordinary course. This is a deliberate safety decision: it means a person who is harassed still has the evidence when they report it, and it means someone cannot abuse a stranger and then erase the proof.

You can remove a message from your own view. That hides it from you and nothing else — the message still exists, the other person still sees it, and it is still there if either of you reports it. We do not offer a way to delete it, and we will not add one.

### Deleting your account

When you delete your account in Settings, the following happens immediately:

- **Erased at once:** your real name, pet name, both bios, both avatars, date of birth, gender, nationality, university, contact email, student email, verification status, and your interest vector. Your display name becomes "Deleted user" everywhere.
- **Switched off:** every route by which someone could find, add, or notify you.
- **Removed:** your friendships, and every record of you blocking someone else. Any group you created is handed to its longest-standing member.
- **Kept:**
  - *Your messages* — attributed to "Deleted user". A conversation is also the other person's data; they do not lose their history because you left.
  - *Records of other people blocking you.*
  - *Your zZuP ID* — retired and never reissued.
  - *Your pet memories and your private conversations with your pet.*

**Deleting your account does not remove the items above. We can still see them, and we keep them.** They are what we rely on when someone reports abuse, when we have to act on a legal demand, and when we have to show what happened.

**We keep these records indefinitely.** If the Service shuts down, they are destroyed or transferred as the law requires.

Where the law requires it, we retain material longer still — in particular, US law obliges providers to preserve reports of child sexual exploitation for at least one year. State privacy laws that give you a right to deletion also carve out data kept to comply with a legal obligation, to detect and prevent fraud or illegal activity, or to protect someone's safety. The items above sit in those carve-outs.

You can also delete your account from the web: [zzup.org/delete-account](delete-account.html).

## Your rights

Whatever state you are in, you can ask us to:

- **Know** what we hold about you, and get a copy of it;
- **Correct** anything wrong;
- **Delete** your information, subject to the retained items above;
- **Take it with you**, in a machine-readable form;
- **Opt out** of any sale, sharing, or profiling that produces legal or similarly significant effects — none of which we do.

Email <admin@zzup.org> and say what you want, or use the [privacy request form](https://zzup.org/contact?topic=data_request). We respond within **45 days**, extendable once by another 45 where the law allows, and we will tell you if we need it. We will not charge you, and we will not degrade your experience for asking.

**You do not have to delete your account to do any of this.** These rights apply to a live account — you can ask us to remove particular information and carry on using zZuP!. The one thing deletion cannot reach is sent messages, for the reasons set out above.

We may need to verify that a request really comes from you before we act on it, particularly for deletion. You can use an authorised agent where your state allows it.

**If we say no**, we will tell you why, and you can appeal by replying to our decision. If you are still unhappy, you can contact your State Attorney General.

**We do not sell or share personal information**, so there is no "Do Not Sell or Share My Personal Information" link — there is nothing for it to switch off. If that ever changes we will publish the link and tell you before it takes effect.

## Age

zZuP! is built for university communities and is **not intended for children**. You must be at least **18** to create an account.

We do not knowingly collect personal information from anyone under that age. We never knowingly collect it from children under 13, which US federal law (COPPA) prohibits without verifiable parental consent. If you believe a child has an account, email <admin@zzup.org> and we will remove it.

This is enforced on our servers, not just in the app: the date of birth you give at sign-up is checked in the database itself, and an account for someone under 18 cannot be created. Modifying the app does not get around it.

## Security

Data is encrypted in transit. Passwords are salted and hashed by our auth provider. Access to every table is enforced by row-level security in the database rather than only in the app, sensitive columns are revoked outright, and privileged operations run through audited server-side functions rather than direct client writes. Chat media sits in private storage behind expiring links.

No service is perfectly secure. If a breach affects you we will notify you and the relevant authorities within the deadlines your state's breach-notification law sets. Report a vulnerability to <admin@zzup.org>; we will not pursue good-faith security research.

## Changes

We will tell you in the app before a material change takes effect and update the date at the top. If you do not accept a change, delete your account.

## Contact

zZuP!, Inc., a Delaware corporation · 251 Little Falls Drive, Wilmington, New Castle County, DE 19808 · <admin@zzup.org>
