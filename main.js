import { Actor } from 'apify';
import { Dataset } from 'apify';

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

const results = [];

try {
    const apiUrl = `https://www.naukri.com/api/mobile/search/job/search?` +
        `keyword=${encodeURIComponent(keyword)}` +
        `&location=${encodeURIComponent(location)}` +
        `&experience=${experience}` +
        `&freshness=${freshness}` +
        `&noOfResults=${maxItems}` +
        `&urlType=search_by_key_loc` +
        `&searchType=adv` +
        `&src=jobsearchDesk`;

    console.log('Calling Naukri API:', apiUrl);

    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'appid': '109',
            'systemid': '109',
            'referer': 'https://www.naukri.com/',
            'origin': 'https://www.naukri.com',
        }
    });

    console.log('Response status:', response.status);
    const text = await response.text();
    console.log('Response preview:', text.substring(0, 200));

    const data = JSON.parse(text);
    const jobs = data?.jobDetails || data?.jobs || [];

    console.log(`Found ${jobs.length} jobs from API`);

    for (const job of jobs.slice(0, maxItems)) {
        results.push({
            title: job.title || job.jobTitle || '',
            company: job.companyName || job.company || '',
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

} catch (e) {
    console.error('Error:', e.message);
}

console.log(`Saving ${results.length} jobs to dataset`);

if (results.length > 0) {
    await Dataset.pushData(results);
} else {
    console.log('No jobs found — Naukri may be blocking. Check response preview in logs above.');
}

await Actor.exit();
