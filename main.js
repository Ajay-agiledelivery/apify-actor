import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

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

const crawler = new PuppeteerCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    },

    async requestHandler({ page, request }) {

        if (request.label === 'LIST') {
            await page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 15000 });

            const jobLinks = await page.evaluate(() => {
                const cards = document.querySelectorAll('.srp-jobtuple-wrapper');
                return Array.from(cards).map(card => {
                    const titleEl = card.querySelector('.title');
                    const companyEl = card.querySelector('.comp-name');
                    const locationEl = card.querySelector('.locWdth');
                    const expEl = card.querySelector('.expwdth');
                    const salaryEl = card.querySelector('.sal-wrap span');
                    const postedEl = card.querySelector('.job-post-day');
                    const link = titleEl ? titleEl.href : null;

                    return {
                        title: titleEl ? titleEl.innerText.trim() : '',
                        company: companyEl ? companyEl.innerText.trim() : '',
                        location: locationEl ? locationEl.innerText.trim() : '',
                        experience: expEl ? expEl.innerText.trim() : '',
                        salary: salaryEl ? salaryEl.innerText.trim() : 'Not disclosed',
                        postedDate: postedEl ? postedEl.innerText.trim() : '',
                        jobUrl: link,
                        source: 'Naukri'
                    };
                });
            });

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

        if (request.label === 'DETAIL') {
            const baseJob = request.userData.job;

            await page.waitForSelector('.job-desc', { timeout: 10000 }).catch(() => null);

            const details = await page.evaluate(() => {
                const descEl = document.querySelector('.job-desc') ||
                               document.querySelector('[class*="job-description"]') ||
                               document.querySelector('.dang-inner-html');

                const applicantsEl = document.querySelector('[class*="applicants"]') ||
                                     document.querySelector('.stat-item') ||
                                     document.querySelector('[class*="application-count"]');

                const skillEls = document.querySelectorAll('.tag-li, .chip-btn, [class*="key-skill"]');
                const skills = Array.from(skillEls).map(el => el.innerText.trim()).join(', ');

                return {
                    jobDescription: descEl ? descEl.innerText.trim().substring(0, 2000) : 'N/A',
                    applicants: applicantsEl ? applicantsEl.innerText.trim() : 'N/A',
                    tags: skills || 'N/A'
                };
            });

            const fullJob = {
                ...baseJob,
                jobDescription: details.jobDescription,
                applicants: details.applicants,
                tags: details.tags,
                scrapedAt: new Date().toISOString()
            };

            results.push(fullJob);
            await Actor.pushData(fullJob);
            console.log(`✅ Scraped: ${baseJob.title} at ${baseJob.company}`);
        }
    },

    failedRequestHandler({ request, error }) {
        console.log(`❌ Failed: ${request.url} — ${error.message}`);
    }
});

await crawler.addRequests([{ url: searchUrl, label: 'LIST' }]);
await crawler.run();

console.log(`🎯 Total jobs scraped: ${results.length}`);
await Actor.exit();
