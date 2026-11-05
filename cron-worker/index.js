export default {
  async scheduled(_event, env) {
    const res = await fetch(`${env.PORTAL_URL.replace(/\/+$/, '')}/api/cron/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'X-Requested-With': 'l2l', 'Content-Type': 'application/json' },
      body: '{}',
    });
    console.log('portal cron:', res.status, await res.text());
  },
};
