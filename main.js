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
    // Naukri's actual search API
    const params = new URLSearchParams({
        noOfResults: maxItems,
        urlType: 'search_by_key_loc',
        sea
