import Sidebar from './Sidebar';

export default function Layout({ title, subtitle, actions, children }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-paper-raised/90 backdrop-blur border-b border-line px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
            {subtitle && <p className="text-sm text-slate mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
        <main className="px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
