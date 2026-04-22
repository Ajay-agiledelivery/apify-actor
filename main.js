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
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },
    maxConcurrency: 2,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 90,

    preNavigationHooks: [
        async ({ blockRequests }) => {
            await blockRequests({
                extraUrlPatterns: ['.png', '.jpg', '.gif', '.woff', '.woff2', '.svg', '.ico'],
            });
        },
    ],

    async requestHandler({ page, request }) {

        // ── LISTING PAGE ────────────────────────────────────────────────────
        if (request.label === 'LIST') {
            const currentPage = request.userData.page || 1;
            log.info(`Scraping listing page ${currentPage}: ${request.url}`);

            await Promise.race([
                page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 25000 }),
                page.waitForSelector('.no-result', { timeout: 25000 }),
            ]).catch(() => log.warning('Selector timeout — trying anyway'));

            const jobLinks = await page.evaluate(() => {
                const cards = document.querySelectorAll('.srp-jobtuple-wrapper');
                return Array.from(cards).map(card => {
                    const titleEl    = card.querySelector('.title');
                    const companyEl  = card.querySelector('.comp-name');
                    const locationEl = card.querySelector('.locWdth') ||
                                       card.querySelector('.location');
                    const expEl      = card.querySelector('.expwdth') ||
                                       card.querySelector('.experience');
                    const salaryEl   = card.querySelector('.sal-wrap span') ||
                                       card.querySelector('.salary');
                    const postedEl   = card.querySelector('.job-post-day') ||
                                       card.querySelector('.postedDate');
                    const tagEls     = card.querySelectorAll('.tag-li, .tags-gt');
                    const tags       = Array.from(tagEls).map(t => t.innerText.trim()).join(', ');

                    return {
                        title:      titleEl    ? titleEl.innerText.trim()    : '',
                        company:    companyEl  ? companyEl.innerText.trim()  : '',
                        location:   locationEl ? locationEl.innerText.trim() : '',
                        experience: expEl      ? expEl.innerText.trim()      : '',
                        salary:     salaryEl   ? salaryEl.innerText.trim()   : 'Not disclosed',
                        postedDate: postedEl   ? postedEl.innerText.trim()   : '',
                        tags:       tags || '',
                        jobUrl:     titleEl    ? titleEl.href                : null,
                        source:     'Naukri',
                    };
                });
            });

            log.info(`Found ${jobLinks.length} jobs on page ${currentPage}`);

            const freshJobs = jobLinks.filter(job => {
                if (!job.postedDate) return true;
                const d = job.postedDate.toLowerCase();
                if (freshness === '1') {
                    return d.includes('today') || d.includes('just') ||
                           d.includes('hour')  || d.includes('1 day') ||
                           d.includes('few');
                }
                return true;
            });

            log.info(`After freshness filter: ${freshJobs.length} jobs qualify`);

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
                log.info(`Queuing next page: ${nextUrl}`);
                await crawler.addRequests([{
                    url:      nextUrl,
                    label:    'LIST',
                    userData: { page: currentPage + 1 },
                }]);
            }
        }

        // ── DETAIL PAGE ─────────────────────────────────────────────────────
        if (request.label === 'DETAIL') {
            const baseJob = request.userData.job;
            log.info(`Scraping detail: ${baseJob.title} @ ${baseJob.company}`);

            await page.waitForTimeout(1500);

            const details = await page.evaluate(() => {

                const descSelectors = [
                    '.dang-inner-html',
                    '.job-desc',
                    '[class*="job-desc"]',
                    '[class*="jobDesc"]',
                    '[class*="description"]',
                    'section.styles_job-desc-container__txpYf',
                    '#job_description',
                    '.details-content',
                    '[class*="jd-desc"]',
                ];
                let jobDescription = 'N/A';
                for (const sel of descSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim().length > 50) {
                        jobDescription = el.innerText.trim().substring(0, 3000);
                        break;
                    }
                }

                const applicantSelectors = [
                    '[class*="applicant"]',
                    '[class*="Applicant"]',
                    '.stat-item',
                    '[class*="application-count"]',
                    '[class*="apply-count"]',
                    '[class*="hired"]',
                    '.loco-details span',
                    '[class*="applications"]',
                ];
                let applicants = 'N/A';
                for (const sel of applicantSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim()) {
                        applicants = el.innerText.trim();
                        break;
                    }
                }

                const skillSelectors = [
                    '.key-skill',
                    '.chip-btn',
                    '[class*="keySkill"] a',
                    '[class*="key-skill"] a',
                    '.skills-item',
                    '[class*="tag-li"]',
                    '[class*="skill-item"]',
                    '[class*="skillsList"] li',
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

                const openingsEl =
                    document.querySelector('[class*="opening"]')  ||
                    document.querySelector('[class*="vacancy"]')   ||
                    document.querySelector('[class*="Openings"]');

                const roleEl     = document.querySelector('[class*="role-res"]');
                const industryEl = document.querySelector('[class*="industry"]');

                return {
                    jobDescription,
                    applicants,
                    tags,
                    openings:     openingsEl  ? openingsEl.innerText.trim()  : 'N/A',
                    roleCategory: roleEl      ? roleEl.innerText.trim()      : '',
                    industry:     industryEl  ? industryEl.innerText.trim()  : '',
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
