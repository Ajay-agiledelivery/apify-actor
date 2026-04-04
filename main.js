import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const {
    keyword = 'Delivery Manager',
    location = 'Bengaluru',
    experience = '10',
    maxItems = 20,
    freshness = '1'
} = input;

const results = [];
const searchUrl = `https://www.naukri.com/${keyword.toLowerCase().replace(/ /g, '-')}-jobs-in-${location.toLowerCase()}?experience=${experience}&freshness=${freshness}`;

console.log(`🔍 Searching: ${searchUrl}`);

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    },
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ page, request }) {

        // ─── LISTING PAGE ───────────────────────────────────────
        if (request.label === 'LIST') {
            console.log('📋 Scraping listing page...');

            // Wait for job cards
            await page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 20000 })
                .catch(() => console.log('⚠️ Selector timeout - trying anyway'));

            const jobLinks = await page.evaluate(() => {
                const cards = document.querySelectorAll('.srp-jobtuple-wrapper');
                return Array.from(cards).map(card => {
                    const titleEl = card.querySelector('.title');
                    const companyEl = card.querySelector('.comp-name');
                    const locationEl = card.querySelector('.locWdth');
                    const expEl = card.querySelector('.expwdth');
                    const salaryEl = card.querySelector('.sal-wrap span');
                    const postedEl = card.querySelector('.job-post-day');

                    return {
                        title: titleEl ? titleEl.innerText.trim() : '',
                        company: companyEl ? companyEl.innerText.trim() : '',
                        location: locationEl ? locationEl.innerText.trim() : '',
                        experience: expEl ? expEl.innerText.trim() : '',
                        salary: salaryEl ? salaryEl.innerText.trim() : 'Not disclosed',
                        postedDate: postedEl ? postedEl.innerText.trim() : '',
                        jobUrl: titleEl ? titleEl.href : null,
                        source: 'Naukri'
                    };
                });
            });

            console.log(`📌 Found ${jobLinks.length} jobs on listing page`);

            // Queue each job detail page
            for (const job of jobLinks.slice(0, maxItems)) {
                if (job.jobUrl) {
                    await crawler.addRequests([{
                        url: job.jobUrl,
                        label: 'DETAIL',
                        userData: { job }
                    }]);
                }
            }
        }

        // ─── DETAIL PAGE ────────────────────────────────────────
        if (request.label === 'DETAIL') {
            const baseJob = request.userData.job;
            console.log(`🔎 Scraping detail: ${baseJob.title}`);

            // Wait for description
            await page.waitForSelector('.job-desc, .dang-inner-html', { timeout: 15000 })
                .catch(() => null);

            const details = await page.evaluate(() => {

                // ── Job Description ──
                const descEl =
                    document.querySelector('.job-desc') ||
                    document.querySelector('.dang-inner-html') ||
                    document.querySelector('[class*="job-description"]') ||
                    document.querySelector('[class*="jobDescription"]');

                // ── Applicants Count ──
                const applicantsEl =
                    document.querySelector('[class*="applicants"]') ||
                    document.querySelector('.stat-item') ||
                    document.querySelector('[class*="application"]') ||
                    document.querySelector('.loco-details');

                // ── Key Skills / Tags ──
                const skillEls = document.querySelectorAll(
                    '.tag-li, .chip-btn, [class*="key-skill"], [class*="keySkill"], .skills-item'
                );
                const skills = Array.from(skillEls)
                    .map(el => el.innerText.trim())
                    .filter(Boolean)
                    .join(', ');

                // ── Openings ──
                const openingsEl = document.querySelector('[class*="opening"]');

                return {
                    jobDescription: descEl
                        ? descEl.innerText.trim().substring(0, 3000)
                        : 'N/A',
                    applicants: applicantsEl
                        ? applicantsEl.innerText.trim()
                        : 'N/A',
                    tags: skills || 'N/A',
                    openings: openingsEl
                        ? openingsEl.innerText.trim()
                        : 'N/A'
                };
            });

            const fullJob = {
                ...baseJob,
                jobDescription: details.jobDescription,
                applicants: details.applicants,
                tags: details.tags,
                openings: details.openings,
                scrapedAt: new Date().toISOString()
            };

            results.push(fullJob);
            await Actor.pushData(fullJob);
            console.log(`✅ Done: ${baseJob.title} @ ${baseJob.company} | Applicants: ${details.applicants}`);
        }
    },

    failedRequestHandler({ request, error }) {
        console.log(`❌ Failed: ${request.url} — ${error.message}`);
    }
});

// Start crawl
await crawler.addRequests([{ url: searchUrl, label: 'LIST' }]);
await crawler.run();

console.log(`\n🎯 Total jobs scraped: ${results.length}`);
await Actor.exit();
