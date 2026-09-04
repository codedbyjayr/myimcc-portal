export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://dusiokpfmkhutptomrqg.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1c2lva3BmbWtodXRwdG9tcnFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjczMzgsImV4cCI6MjEwMTYwMzMzOH0.pBjIXmcesFDU_lHDbhQA1CduWqxEY1SeaRgVh51fuKI';

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  const content = `window.__ENV__ = {
  SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)}
};`;

  res.status(200).send(content);
}
