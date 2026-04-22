import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const {
    keyword    = 'Delivery Manager',
    location   = 'Bengaluru',
    experience = '10',
    maxItems   = 20,
    freshness  = '1',
    maxPages   = 3,
} = input;

const results  = [];
const seenUrls = new Set();

const buildSearchUrl = (keyword, location, experience, freshness, page = 1) => {
    const role    = keyword.toLowerCase().replace(/ /g, '-');
    const city    = location.toLowerCase().replace(/ /g, '-');
    const pageStr = page > 1 ? `-${page}` : '';
    return `https://www.naukri.com/${role}-jobs-in-${city}${pageStr}?experience=${experience}&freshness=${freshness}`;
};

const searchUrl = buildSearchUrl(keyword, location, experience, freshness, 1);
log.info(`Starting scrape: ${searchUrl}`);

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
        },
    },
    maxConcurrency: 1,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 120,

    preNavigationHooks: [
        async ({ page }) => {
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-IN,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            });
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
                Object.defineProperty(navigator, 'platform',  { get: () => 'Win32' });
                window.chrome = { runtime: {} };
            });
        },
    ],

    async requestHandler({ page, request }) {

        // ── LISTING PAGE ──────────────────────────────────────────────────────
        if (request.label === 'LIST') {
            const currentPage = request.userData.page || 1;
            log.info(`Scraping listing page ${currentPage}: ${request.url}`);

            await page.waitForLoadState('networkidle', { timeout: 30000 })
                .catch(() => log.warning('networkidle timeout — continuing'));

            // Scroll slowly to simulate human browsing
            await page.evaluate(async () => {
                await new Promise(resolve => {
                    let y = 0;
                    const timer = setInterval(() => {
                        window.scrollBy(0, 300);
                        y += 300;
                        if (y >= 3000) { clearInterval(timer); resolve(); }
                    }, 200);
                });
            });

            await page.waitForTimeout(2000);

            // Check if Naukri blocked us
            const pageTitle = await page.title();
            log.info(`Page title: ${pageTitle}`);

            if (pageTitle.toLowerCase().includes('login') ||
                pageTitle.toLowerCase().includes('access denied')) {
                log.error('Naukri is showing login/blocked page — retrying');
                throw new Error('Blocked by Naukri');
            }

            // Try multiple selectors
            const jobCardSelectors = [
                '.srp-jobtuple-wrapper',
                '.jobTuple',
                '[class*="jobTuple"]',
                '[class*="job-tuple"]',
                '.cust-job-tuple',
                '[data-job-id]',
                'article.jobTupleHeader',
            ];

            let foundSelector = null;
            for (const sel of jobCardSelectors) {
                const count = await page.locator(sel).count();
                if (count > 0) {
                    foundSelector = sel;
                    log.info(`Found ${count} job cards with selector: ${sel}`);
                    break;
                }
            }

            if (!foundSelector) {
                const bodySnippet = await page.evaluate(() =>
                    document.body.innerHTML.substring(0, 800)
                );
                log.warning(`No job cards found. Page snippet: ${bodySnippet}`);
                return;
            }

            const jobLinks = await page.evaluate((selector) => {
                const cards = document.querySelectorAll(selector);
                return Array.from(cards).map(card => {
                    const titleEl    = card.querySelector('.title') ||
                                       card.querySelector('[class*="title"]') ||
                                       card.querySelector('a[href*="job-listings"]');
                    const companyEl  = card.querySelector('.comp-name') ||
                                       card.querySelector('[class*="comp-name"]') ||
                                       card.querySelector('[class*="company"]');
                    const locationEl = card.querySelector('.locWdth') ||
                                       card.querySelector('[class*="location"]');
                    const expEl      = card.querySelector('.expwdth') ||
                                       card.querySelector('[class*="experience"]');
                    const salaryEl   = card.querySelector('.sal-wrap span') ||
                                       card.querySelector('[class*="salary"]');
                    const postedEl   = card.querySelector('.job-post-day') ||
                                       card.querySelector('[class*="posted"]') ||
                                       card.querySelector('[class*="date"]');
                    const tagEls     = card.querySelectorAll('.tag-li, .tags-gt, [class*="tag"]');
                    const tags       = Array.from(tagEls)
                        .map(t => t.innerText.trim())
                        .filter(t => t.length > 1)
                        .join(', ');

                    return {
                        title:      titleEl    ? titleEl.innerText.trim()    : '',
                        company:    companyEl  ? companyEl.innerText.trim()  : '',
                        location:   locationEl ? locationEl.innerText.trim() : '',
                        experience: expEl      ? expEl.innerText.trim()      : '',
                        salary:     salaryEl   ? salaryEl.innerText.trim()   : 'Not disclosed',
                        postedDate: postedEl   ? postedEl.innerText.trim()   : '',
                        tags:       tags || '',
                        jobUrl:     titleEl && titleEl.href ? titleEl.href   : null,
                        source:     'Naukri',
                    };
                });
            }, foundSelector);

            log.info(`Extracted ${jobLinks.length} jobs from page ${currentPage}`);

            const freshJobs = jobLinks.filter(job => {
                if (!job.postedDate) return true;
                const d = job.postedDate.toLowerCase();
                if (freshness === '1') {
                    return d.includes('today') || d.includes('just') ||
                           d.includes('hour')  || d.includes('1 day') ||
                           d.includes('few')   || d.includes('minute');
                }
                return true;
            });

            log.info(`After freshness filter: ${freshJobs.length} qualify`);

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

            if (currentPage < maxPages && jobLinks.length > 0) {
                const nextUrl = buildSearchUrl(keyword, location, experience, freshness, currentPage + 1);
                await crawler.addRequests([{
                    url:      nextUrl,
                    label:    'LIST',
                    userData: { page: currentPage + 1 },
                }]);
            }
        }

        // ── DETAIL PAGE ───────────────────────────────────────────────────────
        if (request.label === 'DETAIL') {
            const baseJob = request.userData.job;
            log.info(`Scraping detail: ${baseJob.title} @ ${baseJob.company}`);

            await page.waitForLoadState('networkidle', { timeout: 20000 })
                .catch(() => {});
            await page.waitForTimeout(1500);

            const details = await page.evaluate(() => {
                const descSelectors = [
                    '.dang-inner-html', '.job-desc',
                    '[class*="job-desc"]', '[class*="jobDesc"]',
                    '[class*="description"]', '#job_description',
                    '.details-content', '[class*="jd-desc"]',
                ];
                let jobDescription = 'N/A';
                for (const sel of descSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim().length > 50) {
                        jobDescription = el.innerText.trim().substring(0, 3000);
                        break;
                    }
                }

                const skillSelectors = [
                    '.key-skill', '.chip-btn',
                    '[class*="keySkill"] a', '[class*="key-skill"] a',
                    '.skills-item', '[class*="tag-li"]', '[class*="skill-item"]',
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

                const openingsEl  = document.querySelector('[class*="opening"]') ||
                                    document.querySelector('[class*="vacancy"]');
                const roleEl      = document.querySelector('[class*="role-res"]');
                const industryEl  = document.querySelector('[class*="industry"]');
                const applicantEl = document.querySelector('[class*="applicant"]') ||
                                    document.querySelector('[class*="application"]');

                return {
                    jobDescription,
                    tags,
                    openings:     openingsEl  ? openingsEl.innerText.trim()  : 'N/A',
                    roleCategory: roleEl      ? roleEl.innerText.trim()      : '',
                    industry:     industryEl  ? industryEl.innerText.trim()  : '',
                    applicants:   applicantEl ? applicantEl.innerText.trim() : 'N/A',
                };
            });

            const fullJob = {
                ...baseJob,
                jobDescription: details.jobDescription,
                applicants:     details.applicants,
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

await crawler.addRequests([{
    url:      searchUrl,
    label:    'LIST',
    userData: { page: 1 },
}]);

await crawler.run();
log.info(`Done. Total jobs scraped: ${results.length}`);
await Actor.exit();
