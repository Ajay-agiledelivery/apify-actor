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

        // ─── LISTING PAGE ──────────────────────────────────────
        if (request.label === 'LIST') {
            console.log('📋 Scraping listing page...');

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

            for (const job of jobLinks.slice(0, maxItems)) {
                if (job.jobUrl) {
                    await crawler.addRequests([{
                        url: job.jobUrl,
                        label: 'DETAIL',
                        userData: { job }
                    }]);
                }
            }
        }  // ← closes LIST block

        // ─── DETAIL PAGE ───────────────────────────────────────
        if (request.label === 'DETAIL') {
            const baseJob = request.userData.job;
            console.log(`🔎 Scraping detail: ${baseJob.title}`);

            await page.waitForTimeout(3000);

            // DEBUG — find correct selectors
            const allClasses = await page.evaluate(() => {
                return [...document.querySelectorAll('[class]')]
                    .map(el => el.className)
                    .filter(c =>
                        c.includes('desc') ||
                        c.includes('applicant') ||
                        c.includes('skill')
                    )
                    .slice(0, 20);
            });
            console.log('🔍 Found classes:', JSON.stringify(allClasses));

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
                    '.details-content'
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
                    '.loco-details span',
                    '[class*="hired"]'
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
                    '[class*="tag-li"]'
                ];
                let tags = 'N/A';
                for (const sel of skillSelectors) {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) {
                        tags = Array.from(els)
                            .map(el => el.innerText.trim())
                            .filter(t => t.length > 1 && t.length < 50)
                            .join(', ');
                        if (tags.length > 5) break;
                    }
                }

                // ── Openings ──
                const openingsEl =
                    document.querySelector('[class*="opening"]') ||
                    document.querySelector('[class*="vacancy"]');

                return {
                    jobDescription,
                    applicants,
                    tags,
                    openings: openingsEl ? openingsEl.innerText.trim() : 'N/A'
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
            console.log(`✅ Done: ${baseJob.title} | Applicants: ${details.applicants}`);

        }  // ← closes DETAIL block

    },  // ← closes requestHandler

    failedRequestHandler({ request, error }) {
        console.log(`❌ Failed: ${request.url} — ${error.message}`);
    }

});  // ← closes PlaywrightCrawler

// ─── START CRAWL ───────────────────────────────────────────
await crawler.addRequests([{ url: searchUrl, label: 'LIST' }]);
await crawler.run();

console.log(`\n🎯 Total jobs scraped: ${results.length}`);
await Actor.exit();
