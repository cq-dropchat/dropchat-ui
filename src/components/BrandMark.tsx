// The DropChat lockup: the shipping-tag symbol and the wordmark, as the
// brandbook composes it (symbol height ≈ 1.35× the cap height, gap 0.3× the
// symbol). Used on the standalone pages (login, onboarding, OAuth consent).
// Dark mode swaps to the inverse mark (--brand-tag / --brand-check in
// global.css): the blue tag is only 2.8:1 on the dark background.
export default function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex items-center text-foreground"
      style={{ gap: size * 0.3 }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size * 1.1}
        height={size * 1.1}
        aria-hidden="true"
      >
        <path
          fill="var(--brand-tag)"
          fillRule="evenodd"
          d="M16 6H40a5 5 0 0 1 5 5V37a5 5 0 0 1-5 5H16a5 5 0 0 1-3.6-1.5L3.9 27.5a5 5 0 0 1 0-7L12.4 7.5A5 5 0 0 1 16 6Z M13.5 24a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0Z"
        />
        <path
          d="M24.5 24.5l5.2 5.2L39.5 18.5"
          fill="none"
          stroke="var(--brand-check)"
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          fontFamily: '"Archivo", "Arial Black", system-ui, sans-serif',
          fontWeight: 800,
          fontStretch: "112%",
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        DropChat
      </span>
    </div>
  );
}
