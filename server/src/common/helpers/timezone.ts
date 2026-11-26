import 'dotenv/config';

// Every "today", month and financial year is the business's, not the host's: a server running in UTC would
// otherwise reject today's date in India until 05:30. Imported first, before anything reads the clock.
// Stored dates are UTC midnight, so use a zone at or ahead of UTC: behind it, local getters give the day before.
const zone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
new Intl.DateTimeFormat('en', { timeZone: zone }); // throws on a misspelt zone, which TZ would silently read as UTC
process.env.TZ = zone;
