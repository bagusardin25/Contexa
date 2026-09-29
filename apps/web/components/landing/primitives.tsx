export function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="section-intro">
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="section-description">{body}</p>
    </div>
  );
}
