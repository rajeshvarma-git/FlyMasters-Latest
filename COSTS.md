# What this actually costs to run

Figures checked September 2026. Sources at the bottom.

## Railway

| Plan | Price | Included usage |
|---|---|---|
| Hobby | $5/month | $5 of resource usage |
| Pro | $20/month | $20 of resource usage |

Usage is billed on top of the included credit:
RAM **$10/GB/month**, CPU **$20/vCPU/month**, egress **$0.05/GB**,
volume storage **$0.15/GB/month**.

### Before the merge — four services plus Postgres

| Item | Estimate |
|---|---|
| 4 web services, ~0.25 GB RAM each | ~$10/month |
| 4 web services, ~0.05 vCPU each | ~$4/month |
| Postgres (0.5 GB + 1 GB volume) | ~$5/month |
| **Total** | **~$19/month** |

### After the merge — one service plus Postgres

| Item | Estimate |
|---|---|
| 1 web service, ~0.5 GB RAM | ~$5/month |
| 1 web service, ~0.05 vCPU | ~$1/month |
| Postgres (0.5 GB + 1 GB volume) | ~$5/month |
| **Total** | **~$11/month** |

### Read this part carefully

The merge saves roughly **$8–10 a month**. That is about ₹800. It is real, but
it is not the reason to have done it, and anyone selling a consolidation on
infrastructure savings at this scale is selling the wrong thing.

**The merge pays for itself in developer time, not server time.** Before it, a
change to how permissions work had to be written four times, in four
repositories, with four deploys — and the fourth one is the one that gets
forgotten and becomes a data leak. That is what you stopped paying for.

At your traffic, Hobby at $5/month plus roughly $6 of usage covers this
comfortably. Move to Pro when you need team seats or guaranteed no-sleep
behaviour, not because of load.

## WhatsApp

From 1 January 2026 Meta charges **per message**, not per 24-hour conversation.
India rates:

| Type | Rate | Use it for |
|---|---|---|
| Marketing | **₹1.09** | Promotions only. 7.5× the cost of utility. |
| Utility | **₹0.145** | Status updates, document reminders, partner reports |
| Authentication | **₹0.145** | OTP |
| Service | **free** | Any reply within 24 hours of the user messaging you |

**This is your largest controllable cost line, and it is bigger than your
server bill.** One marketing blast to 1,000 leads is ₹1,090 — more than eight
months of hosting.

Three rules that cost nothing to follow:

1. **Classify templates correctly.** A lead status update is *utility*, not
   marketing. Getting this wrong multiplies that message's cost by 7.5.
2. **Answer inside the 24-hour window.** Replies there are free. Your AI chat
   should be doing this already.
3. **Never send a marketing template where a utility one is truthful.** Meta
   decides the category from the template content, so write it as the status
   update it is.

### Worked example: partner updates

50 partners, one update each week:

- As utility: 50 × 4 × ₹0.145 = **₹29/month**
- As marketing: 50 × 4 × ₹1.09 = **₹218/month**

Same content. The category is the whole difference.

## What not to spend money on yet

| Thing | Monthly cost if added | When it is actually justified |
|---|---|---|
| Load balancer / multiple instances | $10–20+ | Sustained concurrent users, not a busy morning |
| Separate staging environment | ~$11 | When a broken deploy costs more than a day of rework — worth it soon |
| Redis | ~$5 | When you have a real session or queue need; you have neither |
| Microservices | 3–5× current | Never, at this size |
| Separate partner portal service | ~$5 + support | See PARTNERS.md — a signed link costs nothing |

One exception worth buying early: a **staging environment (~$11/month)**. It is
the cheapest insurance you can buy against a bad deploy reaching students, and
it is the one line here that saves more than it costs.

## Sources

- [Railway pricing plans](https://docs.railway.com/pricing/plans)
- [Railway pricing](https://railway.com/pricing)
- [WhatsApp Business API pricing India 2026 — AiSensy](https://aisensy.com/pricing)
