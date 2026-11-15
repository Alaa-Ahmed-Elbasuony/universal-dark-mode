import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

const ITEMS = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}`, status: i % 3 === 0 ? 'Open' : 'Done' }));

function useRoute(): [string, (to: string) => void] {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const onPop = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return [path, (to) => (history.pushState({}, '', to), setPath(to))];
}

let detailStyleInjected = false;
function ensureDetailStyles(): void {
  if (detailStyleInjected) return;
  detailStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = '.detail{background:#fffdf5;border:1px solid #eadfb4;padding:16px;border-radius:8px}.detail h2{color:#3d3200}';
  document.head.append(style);
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return createPortal(
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center' }}>
      <div id="modal" style={{ background: '#ffffff', color: '#222222', padding: 20, borderRadius: 8, minWidth: 280 }}>
        {children}
        <button id="modal-close" onClick={onClose} style={{ background: '#eeeeee', color: '#222222', border: '1px solid #cccccc', padding: '6px 12px' }}>
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}

function List({ go }: { go: (to: string) => void }) {
  return (
    <ul id="items" style={{ listStyle: 'none', padding: 0 }}>
      {ITEMS.map((it) => (
        <li key={it.id} style={{ background: it.id % 2 ? '#ffffff' : '#f6f7f9', border: '1px solid #e3e5e8', padding: 10, margin: '4px 0' }}>
          <a href={`/spa.html?item=${it.id}`} onClick={(e) => (e.preventDefault(), go(`/spa.html?item=${it.id}`))} style={{ color: '#0b57d0' }}>
            {it.title}
          </a>{' '}
          <span style={{ color: '#6b7280' }}>{it.status}</span>
        </li>
      ))}
    </ul>
  );
}

function Detail({ id, go }: { id: number; go: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(ensureDetailStyles, []);
  return (
    <section className="detail" id="detail">
      <h2>Task {id}</h2>
      <p>Details for task {id} rendered by React.</p>
      <button id="open-modal" onClick={() => setOpen(true)} style={{ background: '#f1f3f4', color: '#202124', border: '1px solid #c0c4c8', padding: '6px 12px' }}>
        Open modal
      </button>{' '}
      <button onClick={() => go('/spa.html')}>Back</button>
      {open && <Modal onClose={() => setOpen(false)}>Confirm action for task {id}?</Modal>}
    </section>
  );
}

function App() {
  const [path, go] = useRoute();
  const item = Number(new URLSearchParams(path.split('?')[1] ?? '').get('item'));
  return (
    <div style={{ background: '#ffffff', color: '#1f2328', minHeight: '100vh', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginTop: 0 }}>React tasks</h1>
      {item ? <Detail id={item} go={go} /> : <List go={go} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
