// 自动生成，不要手改 —— 跑 `node scripts/sync-legal.mjs` 重新生成。
// 正本：docs/legal/*.md
// ⚠️ 网站的 privacy.html / terms.html 是手写的，不是从正本生成的。改文书要改两处。
// 生成时间不写进来，否则每次跑都产生一个假 diff。

export type LegalDocKey = 'terms' | 'guidelines' | 'privacy';

export interface LegalDoc {
  key: LegalDocKey;
  title: string;
  version: string;
  updated: string;
  body: string;
}

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  terms: {
    key: 'terms',
    title: "Terms of Service",
    version: "0.4",
    updated: "AUG 17, 2026",
    body: `## Agreement

These Terms of Service ("Terms") are a contract between you and **zZuP!, Inc., a Delaware corporation** ("zZuP", "we", "us"), governing your use of the zZuP! application and website (the "Service"). By creating an account or using the Service, you accept these Terms, our [Privacy Notice](privacy.html), and our Community Guidelines (Appendix A), which form part of these Terms. If you do not accept them, do not use the Service.

## Eligibility

- You must be at least **18** years old.
- zZuP! is built for university communities. It is open to current students, incoming students, and graduates. You do not need to be enrolled at a university to hold an account.
- You must provide accurate account information and keep your credentials secure. You are responsible for all activity on your account, including everything done through your pet identity.
- One person, one account. Buying, selling, renting, transferring, or sharing an account is prohibited.

## Your zZuP ID

Every account is issued a sequential zZuP ID beginning at # 00001. The ID is a label we assign to your account. It is not your property. It may not be transferred, sold, or reserved, and it is retired permanently — never reissued — when an account is terminated. We may reclaim any ID obtained through fraud or mass registration, without notice and without compensation.

## Your pet is an AI

- **zZuPer responses are artificially generated and are not written by a human.** Your pet stays in character by design; that is a matter of tone, not a claim that it is a person. See our [Safety & AI Disclosure](safety.html) page.
- Pet conversations, roaming notes and Pulse icebreakers are produced by third-party large language models. They may be inaccurate, incomplete, or inappropriate despite our safeguards.
- AI output is not professional advice. Do not rely on your pet for medical, legal, financial, safety, or emergency matters.
- If you are in crisis, contact local emergency services or a crisis line. Do not rely on your pet. Our published crisis protocol, and its limits, are on the [Safety](safety.html) page.
- Your pet writes and keeps notes about you and draws on them in later conversations. These are described in the [Privacy Notice](privacy.html).
- You are responsible for what you do with AI output, and for any content you direct your pet to carry or share.

## Identities and anonymity

- Acting through your pet does not exempt you from these Terms or the Guidelines. Both identities are you.
- You may not attempt to unmask, deanonymize, or link another user's pet identity to their real identity.
- You may not impersonate a person, university, or organization through either identity.
- Anonymity features are provided as is. We do not guarantee that information you choose to reveal remains unlinked.

## Your content

- **The content you create is yours.** Posts, comments, messages, and images belong to you.
- **You grant us a licence to operate the Service.** You grant zZuP a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, adapt (for example, to generate thumbnails), and display your content — including distributing posts to other users' feeds through features such as zZuPer Roam — solely to operate, improve, and promote the Service within the Service itself.
- The licence ends when your content is removed from the Service, except for content we retain under the [Privacy Notice](privacy.html), such as messages and safety records.
- You must hold the rights to anything you post. Uploading content that infringes the rights of others is prohibited.
- We may remove or restrict any content that violates these Terms, the Guidelines, or the law.

## Permanent records

Parts of the Service are permanent by design. By using it, you accept the following.

- **A message cannot be deleted once sent** — not by you, not by the recipient, and not by us in the ordinary course.
- **The identity used to send a message is fixed at the time of sending and cannot be changed afterwards.** A message sent through your pet identity remains a pet-identity message permanently.
- **Deleting your account removes you from the Service; it does not erase your history.** Other users retain the messages you sent them, attributed to a deleted user, and see nothing else about you. We retain the underlying records in full, as set out in the [Privacy Notice](privacy.html).
- **Your zZuP ID is permanent.** It is retired when you leave and is never reissued.

## Prohibited conduct

You may not use the Service to:

- harass, threaten, defame, or bully any person, through either identity;
- post illegal content, sexual content involving minors (zero tolerance; reported to the authorities), or content that sexualizes any person without their consent;
- dox, stalk, or track another user;
- send spam, run scams or phishing, or conduct unauthorized commercial activity;
- scrape the Service, reverse-engineer the application, probe our infrastructure, or evade rate limits or blocks;
- manipulate matching, verification, identifiers, or experience systems through automation or fraud;
- upload malware or otherwise interfere with the operation of the Service.

## Moderation and enforcement

- We may review content, including messages, which are retained for this purpose, when it is reported or when automated systems flag a potential violation.
- **We may take any action we consider appropriate, up to and including permanent termination of your account, at our discretion.** We are not required to follow any particular sequence of steps before doing so.
- You may report any content or user **from inside the application** — on a person's profile, on a pet's profile, or under Profile → Report a problem. You may also email <admin@zzup.org>.
- **We review every report we receive. We aim to review a report within seven days, and sooner where it indicates an immediate risk of harm.** We decide what action to take, if any. We are not obliged to tell you the outcome.
- **We are not an emergency service and we do not provide crisis intervention.** We cannot dispatch help, contact your family, or intervene in person. If someone is in immediate danger, contact your local emergency services first.
- If we take action against your account, you may appeal to <admin@zzup.org>.

## The Service

- The Service is provided free of charge during the beta. We may introduce paid features later, which we expect to take the form of an optional subscription or purchasable credits for additional cosmetic items and priority. Nothing that is free today becomes paid retroactively without notice.
- We may add, change, or remove features as the Service develops, including changes to the AI models that alter how pets behave.
- We may suspend the Service for maintenance, security, or legal reasons.

## Termination

- You may stop using the Service and delete your account at any time in Settings, or at [zzup.org/delete-account](delete-account.html). What is erased and what is retained is set out there and in the [Privacy Notice](privacy.html).
- We may suspend or terminate any account that violates these Terms, creates risk for other users, or that we are required by law to remove.
- Provisions that by their nature survive termination — the licence covering retained content, disclaimers, limitations of liability, indemnity, and disputes — survive.

## Disclaimers

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED — INCLUDING FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND UNINTERRUPTED OR ERROR-FREE OPERATION. WE DO NOT WARRANT THE ACCURACY OF AI-GENERATED CONTENT OR THE CONDUCT OF OTHER USERS, ONLINE OR OFFLINE.

## Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, ZZUP AND ITS OFFICERS, EMPLOYEES, AND PARTNERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF DATA, GOODWILL, OR PROFITS, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM IS LIMITED TO THE GREATER OF US$100 OR THE AMOUNT YOU PAID US IN THE PRECEDING 12 MONTHS. WHERE A JURISDICTION DOES NOT PERMIT THESE LIMITS, THEY APPLY TO THE FULLEST EXTENT THAT JURISDICTION PERMITS.

## Indemnity

You are responsible for your own conduct and your own content. You will defend, indemnify, and hold harmless zZuP and its officers, employees, and partners against any claim, loss, liability, or expense, including reasonable legal fees, arising out of your content, your use of the Service, or your breach of these Terms or of the law. Where your conduct causes us loss, we reserve the right to recover it from you.

## Governing law and disputes

These Terms are governed by the laws of the **State of Delaware, USA**, excluding its conflict-of-law rules. Any dispute arising out of or relating to these Terms or the Service will be brought exclusively in the state or federal courts located in **New Castle County, Delaware**, and you consent to the personal jurisdiction of those courts.

Nothing in these Terms limits any right granted to you by mandatory consumer protection law that cannot be waived by agreement.

## Changes to these Terms

The current version of these Terms is always published at zzup.org/terms, with the date of the most recent change shown at the top. We will indicate in the application when the Terms have been updated. Continued use of the Service after that date constitutes acceptance of the updated Terms. If you do not accept them, stop using the Service and delete your account.

## Contact

zZuP!, Inc., a Delaware corporation · 251 Little Falls Drive, Wilmington, New Castle County, DE 19808 · <admin@zzup.org>

---
---

# Appendix A — Community Guidelines

VERSION 0.3 · LAST UPDATED AUG 17, 2026

These Guidelines form part of the Terms of Service. They apply to **both of your identities**. A pet identity is a second face on the same person, not a separate account and not an exemption. A violation carries the same consequences regardless of which identity committed it.

## Conduct

zZuP! is a place to meet people. Approach it that way. Talk to others as you would want to be talked to, and give people room to be themselves.

## Anonymity does not limit your responsibility

- A pet identity is a way of speaking without your name attached — in group chats, in Pulse, and in Roam. **Whatever you say through it, you said.** Harassment through a pet identity is harassment.
- You may not use a pet identity to evade a block, avoid consequences, or restart a conversation another user has ended.
- You may not attempt to identify the person behind another user's pet identity, publicly or privately.

## Zero tolerance

The following result in immediate removal and, where applicable, a report to the authorities:

- any sexual content involving minors, in any form — image, video, drawing, text, or roleplay, and whether the depiction is of a real child or generated;
- sexualising a minor, including describing, requesting, or soliciting such content;
- grooming — building a relationship with a minor for the purpose of sexual exploitation;
- sextortion — threatening to release intimate material in order to obtain more of it, money, or compliance;
- credible threats of violence, or encouragement of self-harm;
- doxxing — publishing another person's private information, including their address, schedule, or the identity behind a pet, without consent;
- sexual harassment, including unsolicited sexual content;
- human trafficking, exploitation, or solicitation of illegal goods or services.

## Automated and inauthentic activity

- No spam, chain messages, pyramid schemes, or mass friend requests.
- No fake accounts, identifier farming, or manipulation of engagement systems.
- No unauthorized advertising or promotion. To run a campus campaign, contact <admin@zzup.org>.

## Consent and unwanted contact

The Service is built so that contact is consensual: friend requests require a real exchange first, a single setting shuts strangers out entirely, and blocks operate per identity. If a user does not reply, blocks your pet, or declines your friend request, that is the answer. **We do not ask users to explain it, and neither should you.** Repeated attempts to reach someone who has disengaged are a violation.

## Reporting and enforcement

- Report any message, roaming note, reply, or user **from inside the application** — Report is available on a person's profile, on a pet's profile, and under Profile → Report a problem. If you cannot access the application, email <admin@zzup.org>. See the [Safety page](safety.html).
- Report what you have actually seen and what actually affected you. Reports submitted to harass another user are themselves a violation.
- Reports are confidential. Messages are retained on our side, so the evidence cannot be removed from under you.
- **We may take any action we consider appropriate, up to and including permanent termination.** Zero-tolerance violations result in immediate termination.
- If you believe action was taken against you in error, appeal to <admin@zzup.org>.

## Emergencies

**We are not an emergency service and we do not monitor conversations in real time.** If you believe a person is at immediate risk of harming themselves or another person, contact your local emergency services first, then report to us. Your pet is a companion. It is not a crisis line, and neither are we.`,
  },
  guidelines: {
    key: 'guidelines',
    title: "Community Guidelines",
    version: "0.4",
    updated: "AUG 20, 2026",
    body: `VERSION 0.3 · LAST UPDATED AUG 17, 2026

These Guidelines form part of the Terms of Service. They apply to **both of your identities**. A pet identity is a second face on the same person, not a separate account and not an exemption. A violation carries the same consequences regardless of which identity committed it.

## Conduct

zZuP! is a place to meet people. Approach it that way. Talk to others as you would want to be talked to, and give people room to be themselves.

## Anonymity does not limit your responsibility

- A pet identity is a way of speaking without your name attached — in group chats, in Pulse, and in Roam. **Whatever you say through it, you said.** Harassment through a pet identity is harassment.
- You may not use a pet identity to evade a block, avoid consequences, or restart a conversation another user has ended.
- You may not attempt to identify the person behind another user's pet identity, publicly or privately.

## Zero tolerance

The following result in immediate removal and, where applicable, a report to the authorities:

- any sexual content involving minors, in any form — image, video, drawing, text, or roleplay, and whether the depiction is of a real child or generated;
- sexualising a minor, including describing, requesting, or soliciting such content;
- grooming — building a relationship with a minor for the purpose of sexual exploitation;
- sextortion — threatening to release intimate material in order to obtain more of it, money, or compliance;
- credible threats of violence, or encouragement of self-harm;
- doxxing — publishing another person's private information, including their address, schedule, or the identity behind a pet, without consent;
- sexual harassment, including unsolicited sexual content;
- human trafficking, exploitation, or solicitation of illegal goods or services.

## Automated and inauthentic activity

- No spam, chain messages, pyramid schemes, or mass friend requests.
- No fake accounts, identifier farming, or manipulation of engagement systems.
- No unauthorized advertising or promotion. To run a campus campaign, contact <admin@zzup.org>.

## Consent and unwanted contact

The Service is built so that contact is consensual: friend requests require a real exchange first, a single setting shuts strangers out entirely, and blocks operate per identity. If a user does not reply, blocks your pet, or declines your friend request, that is the answer. **We do not ask users to explain it, and neither should you.** Repeated attempts to reach someone who has disengaged are a violation.

## Reporting and enforcement

- Report any message, roaming note, reply, or user **from inside the application** — Report is available on a person's profile, on a pet's profile, and under Profile → Report a problem. If you cannot access the application, email <admin@zzup.org>. See the [Safety page](safety.html).
- Report what you have actually seen and what actually affected you. Reports submitted to harass another user are themselves a violation.
- Reports are confidential. Messages are retained on our side, so the evidence cannot be removed from under you.
- **We may take any action we consider appropriate, up to and including permanent termination.** Zero-tolerance violations result in immediate termination.
- If you believe action was taken against you in error, appeal to <admin@zzup.org>.

## Emergencies

**We are not an emergency service and we do not monitor conversations in real time.** If you believe a person is at immediate risk of harming themselves or another person, contact your local emergency services first, then report to us. Your pet is a companion. It is not a crisis line, and neither are we.`,
  },
  privacy: {
    key: 'privacy',
    title: "Privacy Notice",
    version: "0.7",
    updated: "AUG 20, 2026",
    body: `In this notice, "we" and "us" mean **zZuP!, Inc.**

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

zZuP!, Inc., a Delaware corporation · 251 Little Falls Drive, Wilmington, New Castle County, DE 19808 · <admin@zzup.org>`,
  },
};

/** 写进 profiles 的三个版本号。改文书 → 重跑脚本 → 这里变 → 老用户被重新拦一次。 */
export const DOC_VERSIONS = {
  terms: LEGAL_DOCS.terms.version,
  guidelines: LEGAL_DOCS.guidelines.version,
  privacy: LEGAL_DOCS.privacy.version,
} as const;
