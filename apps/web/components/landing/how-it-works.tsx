import Link from "next/link";
import { AppWindowIcon, ArrowRightIcon, FileTextIcon, LanguagesIcon } from "lucide-react";

import { SectionIntro } from "./primitives";

const STEPS = [
  {
    icon: FileTextIcon,
    title: "Bring a little context.",
    body: "Add the docs behind your work, or try the sample project. They give your copilot something meaningful to draw on.",
    detail: "PDF · DOCX · Markdown · TXT",
  },
  {
    icon: AppWindowIcon,
    title: "Connect the conversation.",
    body: "Share a browser tab, use your microphone, or play a recording. You decide when listening begins and ends.",
    detail: "Tab audio works in Chrome and Edge",
  },
  {
    icon: LanguagesIcon,
    title: "Make yourself understood.",
    body: "Follow the transcript in your language. When a question lands, review the sources and make the suggested reply your own.",
    detail: "Understand it. Review it. Say it your way.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-section workflow-section">
      <div className="landing-container">
        <div className="section-heading-row">
          <SectionIntro
            eyebrow="A SIMPLE START"
            title="From listening to joining in."
            body="Set the context once. Stay present for the conversation."
          />
          <Link href="/session?preview" className="section-text-link">
            Try it with sample docs <ArrowRightIcon aria-hidden />
          </Link>
        </div>
        <ol className="workflow-grid">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <div className="workflow-top">
                <span className="workflow-number">0{index + 1}</span>
                <span className="workflow-rule" />
                <step.icon aria-hidden />
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="workflow-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
