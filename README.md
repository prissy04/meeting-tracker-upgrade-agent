# Meeting Tracker Upgrade Agent 🔷

**Cross-meeting intelligence layer for Project Managers — solving the visibility gap that no single meeting platform addresses.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

## The Problem

Microsoft Teams, Zoom, and Google Meet all generate per-meeting summaries and action items. But they only work in isolation — within *that single meeting*. If you're a PM or TPM managing 8–12 recurring meetings per week across multiple workstreams, critical signals get lost:

- Action items assigned in one weekly status call reappear unresolved weeks later
- Decisions made in one meeting contradict commitments from another
- External stakeholder deadlines drift without cross-meeting visibility
- Risk patterns emerge across meetings that no single summary captures

## The Solution

Meeting Tracker Upgrade Agent is a **platform-agnostic intelligence layer** that sits on top of your existing meeting workflow. Paste notes from Teams, Zoom, Google Meet, or any source — the AI agent extracts structured data and cross-references it across your entire meeting history.

### Features

| Feature | What It Does |
|---|---|
| **AI-Powered Extraction** | Automatically identifies action items, decisions, risks, and attendees from unstructured meeting notes |
| **Cross-Meeting Intelligence** | Flags recurring unresolved issues across multiple meetings and weekly status calls |
| **Accountability Tracking** | Tracks action item ownership, completion status, and timestamps over time |
| **Overdue Detection** | Items past deadline surface automatically with owner context and meeting origin |
| **Reminder Generation** | One-click copy of ready-to-send follow-up messages for action item owners (internal and external) |
| **Risk Detection** | Surfaces risk patterns — blockers mentioned repeatedly, deadlines slipping, escalation triggers |
| **Weekly Digest** | Generates a full summary of open, overdue, and completed items for standup or leadership reporting |
| **Stakeholder Reports** | Shareable follow-up summaries for external attendees (clients, vendors, partners) |
| **Decision Log** | Aggregates decisions across all meetings so nothing falls through the cracks |
| **Platform Agnostic** | Works with Teams, Zoom, Google Meet, Webex, or manual notes — no vendor lock-in |

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  React Frontend                   │
│  Dashboard · Meeting Log · Action Items · Reports │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│          AI Engine (Swappable)                    │
│  NLP Extraction · Cross-Reference · Risk Scoring  │
│  Default: Anthropic Claude API                    │
│  Enterprise: Azure OpenAI / AWS Bedrock / etc.    │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│            Persistent Browser Storage             │
│     Meetings · Action Items · Decision History    │
└──────────────────────────────────────────────────┘
```

**Tech Stack:**
- **Frontend:** React 18 with Hooks
- **AI Engine:** Anthropic Claude API (Sonnet 4) — swappable to any LLM provider
- **Storage:** Browser persistent storage (key-value, per-user)
- **Fonts:** JetBrains Mono (display), DM Sans (body)
- **Deployment:** Vercel (Hobby tier — free)

## Getting Started

### Prerequisites
- Node.js 18+
- An AI API key (default: [Anthropic](https://console.anthropic.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/prissy04/meeting-tracker-upgrade-agent.git
cd meeting-tracker-upgrade-agent

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API key

# Start development server
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_ANTHROPIC_API_KEY` | Yes | Your Anthropic API key (or swap for your org's approved LLM) |

### Deployment (Vercel)

```bash
npm install -g vercel
vercel --prod
```

Set `VITE_ANTHROPIC_API_KEY` in Vercel Dashboard → Settings → Environment Variables.

## Usage

1. **Add a Meeting** — Paste meeting notes from any platform (Teams transcript, Zoom summary, manual notes)
2. **Analyze** — Click "Analyze with AI" to extract action items, decisions, risks, and attendees
3. **Track** — View all action items across meetings on the Dashboard; click the checkbox to mark items complete (with timestamp)
4. **Detect Patterns** — Recurring issues are automatically flagged when the same blockers appear across meetings
5. **Send Reminders** — Click "Remind" on any action item to get a ready-to-paste follow-up message for the owner
6. **Generate Digest** — Click "Weekly Digest" to produce a full open/overdue/completed summary for standups or leadership
7. **Share** — Generate stakeholder-ready follow-up reports from any meeting detail view

## Cost

| Component | Cost |
|---|---|
| Vercel Hosting (Hobby) | Free |
| Anthropic Claude API | ~$0.003 per meeting analysis |
| GitHub | Free |

**Estimated monthly cost:** $0.03–$0.15 for typical usage (10–50 meetings/month).

**To avoid unexpected charges:** Set a monthly spend limit at your AI provider's console. For Anthropic, go to [console.anthropic.com](https://console.anthropic.com) → Settings → Spend Limits. A $5 limit is more than sufficient.

## Security & Data Flow

**Current implementation (personal use / portfolio):**
- API keys are never committed to source control
- `.env` is in `.gitignore`
- Meeting data is stored locally in the browser — not on any external server
- Meeting notes are sent to the AI API for analysis only
- No authentication layer — single-user, local-only

**What this means:** This version is designed for personal meetings (standups, networking calls, community discussions). It is **not** designed for proprietary enterprise meeting data without the enterprise modifications described below.

## Enterprise Architecture

This project is built as a **proof of concept** demonstrating the cross-meeting intelligence pattern. The AI layer is intentionally swappable — adapting it for enterprise use requires minimal code changes.

### Current vs. Enterprise Comparison

| Layer | Portfolio Version | Enterprise Version |
|---|---|---|
| **AI Engine** | Anthropic Claude API (external) | Your org's approved LLM (Azure OpenAI, AWS Bedrock, Google Vertex AI, SAS Viya, etc.) |
| **Data Storage** | Browser persistent storage | Company-approved database (SQL Server, PostgreSQL) with encryption at rest |
| **Authentication** | None | SSO via corporate identity provider (Okta, Azure AD, SAML) |
| **Data Residency** | Data leaves browser → AI API | All data stays within corporate network boundary |
| **Hosting** | Vercel (public cloud) | Internal infrastructure (Azure App Service, AWS, on-prem, etc.) |
| **Compliance** | N/A | SOC 2, GDPR, HIPAA, FedRAMP as required by org |

### Swapping the AI Engine

The `analyzeWithClaude()` function is a single integration point. Replacing it with your organization's approved LLM requires changing one API endpoint and auth header. The rest of the application — dashboard, tracking logic, report generation, reminder system — is infrastructure-agnostic.

```javascript
// Current: Anthropic Claude
const res = await fetch("https://api.anthropic.com/v1/messages", { ... });

// Enterprise: Azure OpenAI (example)
const res = await fetch("https://your-org.openai.azure.com/openai/deployments/...", { ... });

// Enterprise: AWS Bedrock, Google Vertex, or any OpenAI-compatible endpoint
```

### Enterprise Deployment Path

1. **Propose as internal tooling** for your team or department
2. **Swap AI engine** to your org's approved LLM (Azure OpenAI, Bedrock, Vertex, etc.)
3. **Route through IT security review** — demonstrate that no data leaves the corporate boundary
4. **Add SSO** — integrate with existing identity provider for role-based access
5. **Deploy internally** — host on company infrastructure behind VPN/firewall
6. **Pilot with one team** → gather feedback → expand

This path mirrors how internal tools are adopted at enterprise organizations: a working prototype demonstrates value, security review clears deployment, and phased rollout builds organizational buy-in.

### Why This Architecture Matters

Enterprise PM and TPM roles require candidates who understand that building a tool and shipping a tool are different challenges. This project demonstrates both:

- **Building:** AI integration, data modeling, cross-meeting pattern detection, stakeholder-ready outputs
- **Shipping awareness:** Data residency requirements, SSO integration points, swappable AI layers, security review readiness, phased adoption strategy

The question "would this work at [Company]?" has an intentional answer: "Not as-is — and here's exactly what changes for production, and how I'd drive that adoption internally."

## Why This Project Matters

This project demonstrates:
- **AI fluency** — integrating LLM APIs into production workflows
- **PM domain expertise** — solving a real cross-meeting visibility problem that PMs and TPMs face daily
- **Platform-agnostic thinking** — designing tools that work across organizational boundaries and meeting platforms
- **Stakeholder communication** — shareable reports and reminders bridge internal and external meeting participants
- **Enterprise awareness** — swappable AI layer, documented security posture, phased deployment strategy

Built as part of a deliberate AI upskilling initiative to combine 10+ years of enterprise PM experience with hands-on AI engineering.

## Roadmap

- [ ] **Manager Dashboard** — Aggregated view across all PMs on a team: team-level overdue items, cross-project risk heatmap, completion rates by PM, and escalation visibility for leadership
- [ ] **User accounts & role-based access** — SSO authentication with PM vs. Manager vs. Leadership views
- [ ] **Shared database backend** — Move from browser storage to a centralized database so teams can collaborate on the same data
- [ ] Email integration for automated follow-up reminders
- [ ] Calendar API sync (Google Calendar, Outlook)
- [ ] Meeting transcript file upload (.vtt, .txt, .docx)
- [ ] Slack/Teams webhook notifications for overdue items
- [ ] Export to CSV/PDF

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**Prisca Manokore** — Senior AI Technical Project Manager
- [LinkedIn](https://linkedin.com/in/priscamanokore)
- [GitHub](https://github.com/prissy04)

---

*Built with React, Anthropic Claude API, and a PM's frustration with losing action items across meetings.*
