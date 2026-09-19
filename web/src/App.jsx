import { useEffect, useState } from 'react';

export default function App() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ ok: false }));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p>
        rufus-web scaffold — API: {status ? JSON.stringify(status) : 'verificando...'}
      </p>
    </main>
  );
}
