import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
const {
    keyword = 'Delivery Manager',
    location = 'Bengaluru',
    experience = '10',
    maxItems = 10,
    freshness = '1',
} = input;

console.log(`Scraping Naukri for: ${keyword} in ${location}`);

const keywords = keyword.split(' ').join('-').toLowerCase();
const locationSlug = location.toLowerCase().replace(/\s+/g, '-');

const searchUrl = `https://www.naukri.com/${keywords}-jobs-in-${locationSlug}?experience=${experience}&jobAge=${freshness}`;

console.log('Search URL:', searchUrl);

const results = [];

const proxyConfiguration = await Actor.createProxyConfiguration({
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
});

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 3,
    requestHandlerTimeoutSecs: 60,
    additionalMimeTypes: ['text/html'],
    proxyConfiguration,
    preNavigationHooks: [
        async (crawlingContext) => {
            crawlingContext.request.headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'appid': '109',
                'systemid': '109',
            };
        },
    ],
    async requestHandler({ $, request }) {
        console.log(`Processing: ${request.url}`);

        let jobsFromScript = [];
        $('script').each((i, el) => {
            const text = $(el).html() || '';
            if (text.includes('"jobDetails"') || text.includes('"jobList"')) {
                try {
                    const match = text.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
                    if (match) {
                        const data = JSON.parse(match[1]);
                        const jobs = data?.jobDetails || data?.jobList || [];
                        jobsFromScript.push(...jobs);
                    }
                } catch (e) {}
            }
        });

        if (jobsFromScript.length === 0) {
            $('.srp-jobtuple-wrapper, .jobTuple, article.jobTuple').each((i, el) => {
                if (results.length >= maxItems) return false;

                const title = $(el).find('.title, .jobTitle, a.title').first().text().trim();
                const company = $(el).find('.comp-name, .companyName, .subTitle').first().text().trim();
                const location = $(el).find('.locWdth, .location, .loc').first().text().trim();
                const experience = $(el).find('.exp, .experience').first().text().trim();
                const salary = $(el).find('.sal, .salary').first().text().trim();
                const posted = $(el).find('.job-post-day, .postedDate').first().text().trim();
                const jobUrl = $(el).find('a.title, a.jobTitle').first().attr('href') || '';
                const description = $(el).find('.job-desc, .jobDesc').first().text().trim();

                if (title) {
                    results.push({
                        title,
                        company,
                        location,
                        experience,
                        salary,
                        postedDate: posted,
                        jobUrl: jobUrl.startsWith('http') ? jobUrl : `https://www.naukri.com${jobUrl}`,
                        jobDescription: description,
                        source: 'Naukri',
                        scrapedAt: new Date().toISOString(),
                    });
                }
            });
        } else {
            for (const job of jobsFromScript.slice(0, maxItems)) {
                results.push({
                    title: job.title || job.jobTitle || '',
                    company: job.companyName || job.company || '',
                    location: (job.placeholders || []).find(p => p.type === 'location')?.label || location,
                    experience: (job.placeholders || []).find(p => p.type === 'experience')?.label || '',
                    salary: (job.placeholders || []).find(p => p.type === 'salary')?.label || 'Not disclosed',
                    postedDate: job.footerPlaceholderLabel || '',
                    jobUrl: job.jdURL || `https://www.naukri.com${job.jobId}`,
                    jobDescription: job.jobDescription || '',
                    source: 'Naukri',
                    scrapedAt: new Date().toISOString(),
                });
            }
        }

        console.log(`Found ${results.length} jobs so far`);
    },
    failedRequestHandler({ request, error }) {
        console.error(`Request failed: ${request.url} — ${error.message}`);
    },
});

await crawler.run([searchUrl]);

if (results.length === 0) {
    console.log('HTML scraping returned 0 results, trying Naukri API...');
    try {
        const apiUrl = `https://www.naukri.com/api/mobile/search/job/search?keyword=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&experience=${experience}&freshness=${freshness}&noOfResults=${maxItems}&urlType=search_by_key_loc&searchType=adv&src=jobsearchDesk&latLong=`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'appid': '109',
                'systemid': '109',
                'referer': 'https://www.naukri.com/',
            }
        });
        if (response.ok) {
            const data = await response.json();
            const jobs = data?.jobDetails || [];
            for (const job of jobs.slice(0, maxItems)) {
                results.push({
                    title: job.title || '',
                    company: job.companyName || '',
                    location: (job.placeholders || []).find(p => p.type === 'location')?.label || location,
                    experience: (job.placeholders || []).find(p => p.type === 'experience')?.label || '',
                    salary: (job.placeholders || []).find(p => p.type === 'salary')?.label || 'Not disclosed',
                    postedDate: job.footerPlaceholderLabel || '',
                    jobUrl: job.jdURL || '',
                    jobDescription: job.jobDescription || '',
                    source: 'Naukri',
                    scrapedAt: new Date().toISOString(),
                });
            }
        }
    } catch (e) {
        console.error('API fallback failed:', e.message);
    }
}

console.log(`Saving ${results.length} jobs to dataset`);
await Dataset.pushData(results);

await Actor.exit();
