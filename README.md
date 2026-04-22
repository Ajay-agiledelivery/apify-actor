# Naukri Advanced Job Scraper

Scrape **fresh job listings from Naukri.com** — India's #1 job portal — for any role, any city. Filter by **last 24 hours**, last 3 days, or last 7 days. Get job title, company, salary, experience, location, job description, and direct apply URL — all in one clean dataset.

> **No login required. No API key needed. Focuses on latest jobs only.**

---

## Why Use This Actor?

- **Latest jobs first** — filter by last 24 hours, 3 days, or 7 days
- **India-specific** — built specifically for Naukri.com, India's largest job board
- **Full job details** — title, company, salary, experience, location, description, apply URL
- **Any role, any city** — Delivery Manager in Bangalore, Scrum Master in Hyderabad, and more
- **Clean output** — structured JSON/CSV ready for Excel, Google Sheets, or your app
- **Scheduled runs** — set up daily 8 AM alerts for new jobs automatically

---

## What Data You Get

| Field | Description | Example |
|---|---|---|
| `title` | Full job title | `Delivery Manager` |
| `company` | Company name | `WNS Holdings` |
| `experience` | Experience required | `10-15 Yrs` |
| `salary` | Salary range | `₹18L - ₹25L PA` |
| `location` | City / Location | `Bangalore, Hyderabad` |
| `jobDescription` | Full job description | `We are looking for...` |
| `tags` | Skills / Keywords | `Agile, Scrum, JIRA` |
| `postedDate` | When it was posted | `Today`, `1 day ago` |
| `openings` | Number of openings | `3` |
| `applicants` | Number of applicants | `142` |
| `source` | Job board source | `Naukri` |
| `jobUrl` | Direct apply link | `https://naukri.com/job-listings/...` |
| `scrapedAt` | Timestamp of scrape | `2026-04-22T10:00:00Z` |

---

## How to Use

**Step 1** — Go to [Naukri.com Jobs](https://www.naukri.com/) and search for your role and city.

**Step 2** — Copy the URL from your browser. Example:
```
https://www.naukri.com/delivery-manager-jobs-in-bangalore
```

**Step 3** — Paste into the **Search URL** field, set **Freshness** to `1` (last 24 hours), and click **Start**.

**Step 4** — Download results as **JSON, CSV, or Excel** from the dataset tab.

---

## Example Input

```json
{
  "searchUrls": [
    "https://www.naukri.com/delivery-manager-jobs-in-bangalore",
    "https://www.naukri.com/scrum-master-jobs",
    "https://www.naukri.com/project-manager-jobs-in-hyderabad"
  ],
  "freshness": 1,
  "maxResults": 50
}
```

### Freshness Values

| Value | Filters jobs posted in |
|---|---|
| `1` | Last 24 hours ⭐ recommended |
| `3` | Last 3 days |
| `7` | Last 7 days |
| `15` | Last 15 days |
| `30` | Last 30 days |

---

## Example Output

```json
[
  {
    "title": "Delivery Manager",
    "company": "WNS Holdings",
    "experience": "10-15 Yrs",
    "salary": "Not disclosed",
    "location": "Hybrid - Bengaluru, Hyderabad, Pune",
    "tags": ["Project Management", "Service Delivery", "Stakeholder Management"],
    "jobDescription": "Delivery-focused and proactive. Strong problem-solving mindset. Able to challenge technical and functional assumptions...",
    "postedDate": "Today",
    "openings": "3",
    "applicants": "N/A",
    "source": "Naukri",
    "jobUrl": "https://www.naukri.com/job-listings-delivery-manager-wns-holdings-...",
    "scrapedAt": "2026-04-22T10:39:30Z"
  }
]
```

---

## Popular Search URL Formats

### By Role
```
https://www.naukri.com/delivery-manager-jobs
https://www.naukri.com/scrum-master-jobs
https://www.naukri.com/project-manager-jobs
https://www.naukri.com/program-manager-jobs
https://www.naukri.com/agile-coach-jobs
https://www.naukri.com/software-engineer-jobs
https://www.naukri.com/data-engineer-jobs
```

### By Role + City
```
https://www.naukri.com/delivery-manager-jobs-in-bangalore
https://www.naukri.com/scrum-master-jobs-in-hyderabad
https://www.naukri.com/project-manager-jobs-in-mumbai
https://www.naukri.com/software-engineer-jobs-in-pune
https://www.naukri.com/data-analyst-jobs-in-chennai
```

### Remote Jobs
```
https://www.naukri.com/remote-delivery-manager-jobs
https://www.naukri.com/work-from-home-project-manager-jobs
```

---

## Popular Use Cases

### Job Seekers
- Get only today's fresh job postings — never waste time on old listings
- Track new openings daily with scheduled runs
- Export to Excel and apply systematically
- Monitor salary trends across companies

### Recruiters & HR Teams
- Research competitor job postings in real time
- Track talent demand by role and city
- Monitor industry hiring velocity
- Source passive candidates by role and location

### Researchers & Analysts
- Indian labour market research
- Salary benchmarking by role and city
- Skills demand mapping across industries
- Hiring trend analysis for investors and consultants

### Developers & SaaS Builders
- Power Indian job board aggregators
- Feed job recommendation engines
- Build resume-job matching applications
- Create WhatsApp/email job alert bots

---

## Scheduling — Daily Fresh Job Alerts

Get today's jobs delivered automatically every morning:

1. Click **Save as a new task** (top right of actor page)
2. Enter your search URLs and set `freshness: 1`
3. Go to **Schedules** → **Add schedule**
4. Set to run daily at **7:00 AM IST**
5. Connect to **Google Sheets** or **email** via Integrations tab

---

## Integration Options

| Platform | Use Case |
|---|---|
| **Google Sheets** | Auto-populate a job tracker spreadsheet |
| **Gmail / Outlook** | Send daily job digest email |
| **WhatsApp (via Make)** | Get job alerts on WhatsApp |
| **Zapier** | Connect to 5000+ apps |
| **Make (Integromat)** | Build powerful automation workflows |
| **REST API** | Call from your own application |
| **Webhooks** | Trigger when new jobs are found |

---

## How Fresh Filtering Works

This actor appends Naukri's built-in freshness parameter to your search URL:

```
Original URL:  https://www.naukri.com/delivery-manager-jobs-in-bangalore
With filter:   https://www.naukri.com/delivery-manager-jobs-in-bangalore?freshness=1
```

Setting `freshness=1` tells Naukri to return only jobs posted in the **last 24 hours**, so every result you get is a brand-new posting.

---

## FAQ

**Does it require a Naukri account or login?**
No. This actor works on Naukri's public job search pages. No account required.

**How do I get only today's jobs?**
Set `freshness` to `1` in the input. This filters for jobs posted in the last 24 hours only.

**Can I scrape multiple roles and cities in one run?**
Yes — add multiple Naukri search URLs to the `searchUrls` field and all will be scraped in one run.

**How many results can I get per run?**
Set `maxResults` to any number. Most users run 50–100 results per search URL.

**Can I export to Excel or CSV?**
Yes — from the dataset tab, click **Export** and choose CSV, JSON, or Excel.

**Why are some salary fields "Not disclosed"?**
Many Indian companies choose not to disclose salary on Naukri. The actor captures whatever Naukri shows — if the company didn't post a salary, it shows "Not disclosed".

---

## Technical Details

- **Built with:** Node.js, Playwright, Crawlee, Apify SDK
- **Target site:** Naukri.com (India's #1 job portal)
- **Rendering:** Full browser rendering for dynamic content
- **Rate limiting:** Respectful crawling with delays
- **Memory:** 1 GB recommended
- **Average run time:** 1–3 minutes for 50 results

---

## Changelog

- **v1.0** — Initial release with basic Naukri scraping
- **v1.1** — Added freshness filter for 24hr / 3-day / 7-day posts
- **v1.2** — Added salary, experience, tags, and applicant count fields
- **v1.3** — Added multi-URL support and pagination

---

## Support

Found a bug or need a custom feature? Open an issue via the **Issues** tab.
Response within 24 hours.

---

*Built by [Ajay Kumar](https://apify.com/scrapemaster_in) — Delivery Manager & Automation Builder | Bengaluru, India*
