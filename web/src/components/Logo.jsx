export function Pata({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="42" rx="14" ry="12" />
      <ellipse cx="14" cy="27" rx="6" ry="8" />
      <ellipse cx="25" cy="16" rx="6" ry="8" />
      <ellipse cx="39" cy="16" rx="6" ry="8" />
      <ellipse cx="50" cy="27" rx="6" ry="8" />
    </svg>
  );
}

export function Logo({ nome = 'Rufus' }) {
  return (
    <span className="logo" aria-label={nome}>
      <span aria-hidden="true">Ruf</span>
      <span className="logo-pata" aria-hidden="true">
        <Pata />
      </span>
      <span aria-hidden="true">s</span>
    </span>
  );
}
