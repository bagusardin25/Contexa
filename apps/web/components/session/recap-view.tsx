import type { SessionRecap } from "@/types/session";

/** The recap's body: summary, key points, action items, open questions. */
export function RecapView({ recap, language }: { recap: SessionRecap; language: string }) {
  return (
    <div lang={language} className="space-y-4 text-sm">
      <p className="leading-relaxed">{recap.summary}</p>
      <RecapList title="Key points" items={recap.keyPoints} />
      <RecapList title="Action items" items={recap.actionItems} />
      <RecapList title="Open questions" items={recap.openQuestions} />
    </div>
  );
}

function RecapList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <ul className="list-disc space-y-1 pl-5 leading-relaxed marker:text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
