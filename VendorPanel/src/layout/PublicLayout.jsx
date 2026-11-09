import { Icon, Logo } from '../components/ui.jsx';

const FEATURES = [
  ['fa-solid fa-screwdriver-wrench', 'List your home services and properties'],
  ['fa-regular fa-calendar-check', 'Accept bookings from NIVASA members'],
  ['fa-solid fa-indian-rupee-sign', 'Record cash and see your settlement'],
  ['fa-solid fa-rocket', 'Boost your posts to the top of results'],
];

/** Sign-in / sign-up layout: purple brand panel + white card on the light background. */
export function PublicLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-azea-bg">
      <aside className="bg-brand-panel relative hidden w-[42%] max-w-[560px] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-12">
        <Logo light />
        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Grow your business
            <br />
            with NIVASA.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">The vendor website for home-service professionals and property owners who serve NIVASA communities.</p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon name={icon} className="text-xs" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-white/60">© {new Date().getFullYear()} NIVASA · Vendor Panel</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border-[40px] border-white/5" aria-hidden="true" />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export function PublicCard({ children }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">{children}</div>;
}
