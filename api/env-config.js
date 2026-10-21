export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).send('throw new Error("Supabase environment configuration is missing.");');
  }

  const content = `window.__ENV__ = {
  SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)}
};`;

  res.status(200).send(content);
}
