// Jest gives each test file a copy of process.env, so the time zone has to be set out here to take effect
module.exports = () => {
  require('dotenv/config');
  process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
};
