import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
const {
    keyword = 'Delivery Manager',
    location = 'Bengaluru',
    experience = '10',
    maxItems = 20,
    freshness = '1',
} = input;

console.log(`Scraping Naukri for: ${keyword} in ${location}`);

const keywords = keyword.split(' ').join('-').toLowerCase();
const locationSlug = location.toLowerCase().replace(/\s+/g, '-');
const searchUrl = `https://www.naukri.com/${keywords}-jobs-in-${locationSlug}?experience=${experience}&jobAge=${freshness}`;

console.log('Search URL:', searchUrl);

const results = [];

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 5,
    requestHandlerTimeoutSecs: 120,
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },
    async requestHandler({ page, request }) {
        console.log(`Processing: ${request.url}`);

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });

        // Wait for job listings to load
        await page.waitForTimeout(3000);

        // Try to extract from page JSON state
        const jobsFromState = await page.evaluate(() => {
            try {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.innerText || '';
                    if (text.includes('jobDetails') || text.includes('INITIAL_STATE')) {
                        const match = text.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
                        if (match) {
                            const data = JSON.parse(match[1]);
                            return data?.jobDetails || data?.jobList || [];
                        }
                    }
                }
            } catch(e) {}
            return [];
        });

        if (jobsFromState.length > 0) {
            console.log(`Found ${jobsFromState.length} jobs from page state`);
            for (const job of jobsFromState.slice(0, maxItems)) {
                results.push({
                    title: job.title || '',
                    company: job.companyName || '',
                    location: (job.placeholders || []).find(p => p.type === 'location')?.label || location,
                    experience: (job.placeholders || []).find(p => p.type === 'experience')?.label || '',
                    salary: (job.placeholders || []).find(p => p.type === 'salary')?.label || 'Not disclosed',
                    postedDate: job.footerPlaceholderLabel || '',
                    jobUrl: job.jdURL || '',
                    tags: (job.tagsAndSkills || '').split(',').map(t => t.trim()),
                    source: 'Naukri',
                    scrapedAt: new Date().toISOString(),
                });
            }
        } else {
            // Fallback: scrape from HTML
            console.log('Trying HTML scraping...');
            const jobs = await page.evaluate(() => {
                const items = [];
                document.querySelectorAll('.srp-jobtuple-wrapper, article.jobTuple').forEach(el => {
                    const title = el.querySelector('.title, a.title')?.innerText?.trim() || '';
                    const company = el.querySelector('.comp-name, .companyName')?.innerText?.trim() || '';
                    const loc = el.querySelector('.locWdth, .location')?.innerText?.trim() || '';
                    const exp = el.querySelector('.exp, .experience')?.innerText?.trim() || '';
                    const salary = el.querySelector('.sal, .salary')?.innerText?.trim() || 'Not disclosed';
                    const posted = el.querySelector('.job-post-day, .postedDate')?.innerText?.trim() || '';
                    const url = el.querySelector('a.title, a.jobTitle')?.href || '';
                    if (title) items.push({ title, company, loc, exp, salary, posted, url });
                });
                return items;
            });

            console.log(`Found ${jobs.length} jobs from HTML`);
            for (const job of jobs.slice(0, maxItems)) {
                results.push({
                    title: job.title,
                    company: job.company,
                    location: job.loc || location,
                    experience: job.exp,
                    salary: job.salary,
                    postedDate: job.posted,
                    jobUrl: job.url,
                    source: 'Naukri',
                    scrapedAt: new Date().toISOString(),
                });
            }
        }

        console.log(`Total results so far: ${results.length}`);
    },
    failedRequestHandler({ request, error }) {
        console.error(`Failed: ${request.url} — ${error.message}`);
    },
});

await crawler.run([searchUrl]);

console.log(`Saving ${results.length} jobs`);
if (results.length > 0) {
    await Dataset.pushData(results);
    console.log('✅ Done!');
} else {
    console.log('❌ No results found');
}

await Actor.exit();
