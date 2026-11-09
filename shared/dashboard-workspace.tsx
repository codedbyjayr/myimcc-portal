import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import './tailwind.css';

export function DashboardWorkspace({ markup }: { markup: string }) {
  const initialMarkup = useRef(markup);
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function startControllers() {
      for (const source of document.querySelectorAll<HTMLScriptElement>('script[data-dashboard-controller]')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = source.src;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Dashboard scripts could not load. Reload this page to retry.'));
          document.body.appendChild(script);
        });
      }
    }

    void startControllers().catch(error => setError(error.message));
  }, []);

  return <>
    {/* shortcut: controllers own this subtree for the document lifetime, add teardown before client-side routing. */}
    <div data-dashboard-workspace className="contents" dangerouslySetInnerHTML={{ __html: initialMarkup.current }} />
    {error && <p role="alert" className="fixed inset-x-4 bottom-4 z-[9999] rounded-lg bg-red-950 p-4 text-white">{error}</p>}
  </>;
}

export function mountDashboard(view: ReactElement) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Dashboard root is missing.');
  createRoot(root).render(<DashboardWorkspace markup={renderToStaticMarkup(view)} />);
}
