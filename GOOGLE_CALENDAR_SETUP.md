# Google Calendar Sync — Setup Guide

This connects SkyShare Talent to a shared Google Calendar using a **service account**.
You do this once. Takes ~10 minutes.

## What you'll end up with (3 values to give Claude)
1. `GOOGLE_SERVICE_ACCOUNT_EMAIL`
2. `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
3. `GOOGLE_SHARED_CALENDAR_ID`

---

## Step 1 — Create / pick the shared calendar
1. Go to https://calendar.google.com (signed in as a SkyShare Workspace account)
2. Left sidebar → **Other calendars** → **+** → **Create new calendar**
3. Name it **"SkyShare Interviews"** → **Create calendar**
4. Open that calendar's **Settings and sharing**
5. Scroll to **Integrate calendar** → copy the **Calendar ID**
   (looks like `c_abc123...@group.calendar.google.com`)
   → this is **GOOGLE_SHARED_CALENDAR_ID**

## Step 2 — Create a Google Cloud project + service account
1. Go to https://console.cloud.google.com
2. Top bar → project dropdown → **New Project** → name it "SkyShare Talent" → Create
3. Make sure that project is selected
4. Search bar → **Google Calendar API** → **Enable**
5. Left menu → **APIs & Services → Credentials**
6. **+ Create credentials → Service account**
   - Name: `skyshare-calendar-sync` → **Create and continue**
   - Skip roles (click **Continue**) → **Done**
7. Click the new service account → **Keys** tab → **Add key → Create new key → JSON**
   - A `.json` file downloads. Open it.
   - `client_email` → this is **GOOGLE_SERVICE_ACCOUNT_EMAIL**
   - `private_key` → this is **GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY**
     (the long `-----BEGIN PRIVATE KEY-----\n...` string)

## Step 3 — Share the calendar with the service account
1. Back in Google Calendar → **SkyShare Interviews** → **Settings and sharing**
2. **Share with specific people** → **Add people**
3. Paste the service account's `client_email` (from Step 2)
4. Permission: **Make changes to events**
5. **Send**

That's it. Send Claude the 3 values and they'll be added to Vercel + deployed.

---

## How it works once connected
- Creating/editing/cancelling an interview in the app pushes it to the shared calendar
- Events are **color-coded by stage** (Recruiter Screen = blue, Hiring Manager = purple,
  Technical/Sim = orange, Panel = green, Final = red, Offer = yellow)
- Edits/moves/cancellations made **in Google** sync back every 15 min (or via "Sync now")
- The event title shows `[Department] Stage: Candidate Name`

## Security note
The private key is a credential — it's stored only in Vercel's encrypted env vars,
never committed to git. Don't paste the JSON file into git or chat history you want public.
