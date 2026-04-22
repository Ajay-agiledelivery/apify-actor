import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const {
    keyword    = 'Delivery Manager',
    location   = 'Bengaluru',
    experience = '10',
    maxItems   = 20,
    freshness  = '1',          // FIX 1: default '1' = last 24 hrs
    maxPages   = 3,            // NEW: how many listing pages to paginate
} = input;

const results   = [];
const seenUrls  = new Set(); // FIX 2: prevent duplicate job scraping

// FIX 3: Build URL correctly — freshness MUST be in the URL, not appended after
const buildSearchUrl = (keyword, location, experience, freshness, page = 1) => {
    const role = keyword.toLowerCase().replace(/ /g, '-');
    const city = location.toLowerCase().replace(/ /g, '-');
    // Naukri pagination uses page number at end: -jobs-in-city-1, -jobs-in-city-2
    const pageStr = page > 1 ? `-${page}` : '';
    return `https://www.naukri.com/${role}-jobs-in-${city}${pageStr}?experience=${experience}&freshness=${freshness}`;
};

const searchUrl = buildSearchUrl(keyword, location, experience, freshness, 1);
log.info(`Starting scrape: ${searchUrl}`);

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },
    maxConcurrency: 2,           // FIX 4: was missing — prevents rate limiting
    maxRequestRetries: 3,        // FIX 5: increased from 2 to 3
    requestHandlerTimeoutSecs: 90,

    // FIX 6: Block images/fonts to speed up page loads significantly
    preNavigationHooks: [
        async ({ blockRequests }) => {
            await blockRequests({
                extraUrlPatterns: ['.png', '.jpg', '.gif', '.woff', '.woff2', '.svg', '.ico'],
            });
        },
    ],

    async requestHandler({ page, request }) {

        // ─── LISTING PAGE ──────────────────────────────────────────────────────
        if (request.label === 'LIST') {
            const currentPage = request.userData.page || 1;
            log.info(`Scraping listing page ${currentPage}: ${request.url}`);

            // FIX 7: Better wait — waits for jobs OR a "no results" message
            await Promise.race([
                page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 25000 }),
                page.waitForSelector('.no-result', { timeout: 25000 }),
            ]).catch(() => log.warning('Selector timeout — trying anyway'));

            const jobLinks = await page.evaluate(() => {
                const cards = document.querySelectorAll('.srp-jobtuple-wrapper');
                return Array.from(cards).map(card => {
                    const titleEl   = card.querySelector('.title');
                    const companyEl = card.querySelector('.comp-name');
                    // FIX 8: Naukri uses multiple location selectors — try both
                    const locationEl = card.querySelector('.locWdth') ||
                                       card.querySelector('.location');
                    const expEl    = card.querySelector('.expwdth') ||
                                     card.querySelector('.experience');
                    const salaryEl = card.querySelector('.sal-wrap span') ||
                                     card.querySelector('.salary');
                    const postedEl = card.querySelector('.job-post-day') ||
                                     card.querySelector('.postedDate');
                    // FIX 9: Get tags from listing card directly
                    const tagEls   = card.querySelectorAll('.tag-li, .tags-gt');
                    const tags     = Array.from(tagEls).map(t => t.innerText.trim()).join(', ');

                    return {
                        title:      titleEl   ? titleEl.innerText.trim()   : '',
                        company:    companyEl ? companyEl.innerText.trim() : '',
                        location:   locationEl ? locationEl.innerText.trim() : '',
                        experience: expEl     ? expEl.innerText.trim()     : '',
                        salary:     salaryEl  ? salaryEl.innerText.trim()  : 'Not disclosed',
                        postedDate: postedEl  ? postedEl.innerText.trim()  : '',
                        tags:       tags || '',
                        jobUrl:     titleEl   ? titleEl.href               : null,
                        source:     'Naukri',
                    };
                });
            });

            log.info(`Found ${jobLinks.length} jobs on page ${currentPage}`);

            // FIX 10: Filter for truly fresh jobs (today / 1 day ago only)
            const freshJobs = jobLinks.filter(job => {
                if (!job.postedDate) return true; // include if date unknown
                const d = job.postedDate.toLowerCase();
                if (freshness === '1') {
                    return d.includes('today') || d.includes('just') ||
                           d.includes('hour')  || d.includes('1 day') ||
                           d.includes('few');
                }
                return true; // for freshness > 1 include all
            });

            log.info(`After freshness filter: ${freshJobs.length} jobs qualify`);

            // Queue detail pages (avoid duplicates)
            for (const job of freshJobs.slice(0, maxItems)) {
                if (job.jobUrl && !seenUrls.has(job.jobUrl)) {
                    seenUrls.add(job.jobUrl);
                    await crawler.addRequests([{
                        url:      job.jobUrl,
                        label:    'DETAIL',
                        userData: { job },
                    }]);
                }
            }

            // FIX 11: Pagination — follow next pages up to maxPages
            if (currentPage < maxPages && jobLinks.length > 0) {
                const nextUrl = buildSearchUrl(keyword, location, experience, freshness, currentPage + 1);
                log.info(`Queuing next page: ${nextUrl}`);
                await crawler.addRequests([{
                    url:      nextUrl,
                    label:    'LIST',
                    userData: { page: currentPage + 1 },
                }]);
            }
        }

        // ─── DETAIL PAGE ───────────────────────────────────────────────────────
        if (request.label === 'DETAIL') {
            const baseJob = request.userData.job;
            log.info(`Scraping detail: ${baseJob.title} @ ${baseJob.company}`);

            // FIX 12: Reduced wait from 3000ms to 1500ms — faster + still reliable
            await page.waitForTimeout(1500);

            const details = await page.evaluate(() => {

                // ── Job Description ──
                const descSelectors = [
                    '.dang-inner-html',
                    '.job-desc',
                    '[class*="job-desc"]',
                    '[class*="jobDesc"]',
                    '[class*="description"]',
                    'section.styles_job-desc-container__txpYf',
                    '#job_description',
                    '.details-content',
                    '[class*="jd-desc"]',   // NEW selector
                ];
                let jobDescription = 'N/A';
                for (const sel of descSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim().length > 50) {
                        jobDescription = el.innerText.trim().substring(0, 3000);
                        break;
                    }
                }

                // ── Applicants Count ──
                const applicantSelectors = [
                    '[class*="applicant"]',
                    '[class*="Applicant"]',
                    '.stat-item',
                    '[class*="application-count"]',
                    '[class*="apply-count"]',
                    '[class*="hired"]',
                    '.loco-details span',
                    '[class*="applications"]',  // NEW
                ];
                let applicants = 'N/A';
                for (const sel of applicantSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim()) {
                        applicants = el.innerText.trim();
                        break;
                    }
                }

                // ── Key Skills ──
                const skillSelectors = [
                    '.key-skill',
                    '.chip-btn',
                    '[class*="keySkill"] a',
                    '[class*="key-skill"] a',
                    '.skills-item',
                    '[class*="tag-li"]',
                    '[class*="skill-item"]',    // NEW
                    '[class*="skillsList"] li', // NEW
                ];
                let tags = '';
                for (const sel of skillSelectors) {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) {
                        const collected = Array.from(els)
                            .map(el => el.innerText.trim())
                            .filter(t => t.length > 1 && t.length < 50)
                            .join(', ');
                        if (collected.length > 5) { tags = collected; break; }
                    }
                }

                // ── Openings ──
                const openingsEl =
                    document.querySelector('[class*="opening"]') ||
                    document.querySelector('[class*="vacancy"]')  ||
                    document.querySelector('[class*="Openings"]'); // NEW

                // FIX 13: Extract role category and industry if present
                const roleEl     = document.querySelector('[class*="role-res"]');
                const industryEl = document.querySelector('[class*="industry"]');

                return {
                    jobDescription,
                    applicants,
                    tags,
                    openings:  openingsEl  ? openingsEl.innerText.trim()  : 'N/A',
                    roleCategory: roleEl   ? roleEl.innerText.trim()      : '',
                    industry:  industryEl  ? industryEl.innerText.trim()  : '',
                };
            });

            const fullJob = {
                ...baseJob,
                jobDescription: details.jobDescription,
                applicants:     details.applicants,
                // FIX 14: Merge tags from listing + detail page for completeness
                tags:           baseJob.tags || details.tags,
                openings:       details.openings,
                roleCategory:   details.roleCategory,
                industry:       details.industry,
                scrapedAt:      new Date().toISOString(),
            };

            results.push(fullJob);
            await Actor.pushData(fullJob);
            log.info(`Saved: "${baseJob.title}" @ ${baseJob.company} | Posted: ${baseJob.postedDate}`);
        }
    },

    failedRequestHandler({ request, error }) {
        log.error(`Failed: ${request.url} — ${error.message}`);
    },
});

// ─── START CRAWL ───────────────────────────────────────────────────────────────
await crawler.addRequests([{
    url:      searchUrl,
    label:    'LIST',
    userData: { page: 1 },
}]);

await crawler.run();

log.info(`Done. Total jobs scraped: ${results.length}`);
await Actor.exit();
