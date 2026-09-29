import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  AudioLinesIcon,
  CheckIcon,
  FileSearchIcon,
  FileTextIcon,
  HandIcon,
  LanguagesIcon,
  MessageSquareQuoteIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { LiveTurnDemo } from "./live-turn-demo";
import { SectionIntro } from "./primitives";

export function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-container hero-grid">
        <div className="hero-copy">
          <p className="landing-eyebrow">
            <span className="eyebrow-line" /> YOUR REAL-TIME CONVERSATION COPILOT
          </p>
          <h1>
            Good ideas.
            <br />
            Any language.
            <br />
            <span>Your voice.</span>
          </h1>
          <p className="hero-description">
            Follow the conversation. Find the right words. Contexa translates live speech and helps you answer
            with confidence, using your own documents.
          </p>
          <div className="hero-actions">
            <Button asChild size="lg" className="landing-primary">
              <Link href="/session">
                Start a session <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="landing-secondary">
              <Link href="/session?preview">
                <PlayIcon /> Explore the demo
              </Link>
            </Button>
          </div>
          <p className="hero-note">
            <CheckIcon aria-hidden /> No account needed <span aria-hidden>·</span> You choose when to listen
          </p>
          <a className="hero-discover" href="#how-it-works">
            <span>
              <ArrowDownIcon aria-hidden />
            </span>{" "}
            A little context. A better conversation.
          </a>
        </div>
        <div className="demo-stage">
          <div className="demo-stage-heading">
            <span>
              <SparklesIcon aria-hidden /> A conversation, connected.
            </span>
            <span className="demo-example-label">INTERACTIVE EXAMPLE</span>
          </div>
          <LiveTurnDemo />
          <div className="demo-stage-flow" aria-hidden>
            <span>Listen</span>
            <span className="flow-line" />
            <span>Understand</span>
            <span className="flow-line" />
            <span>Respond</span>
          </div>
        </div>
      </div>
      <div className="landing-container capability-strip">
        <p>
          Built for the moments
          <br />
          <strong>you want to be heard.</strong>
        </p>
        <div>
          <AudioLinesIcon aria-hidden />
          <span>
            Live transcription
            <small>AssemblyAI Universal-3.5 Pro Realtime, with speaker labels</small>
          </span>
        </div>
        <div>
          <LanguagesIcon aria-hidden />
          <span>
            Across languages<small>Read in Indonesian, English, or Japanese</small>
          </span>
        </div>
        <div>
          <FileSearchIcon aria-hidden />
          <span>
            Your context, included<small>Answers grounded in your documents</small>
          </span>
        </div>
      </div>
    </section>
  );
}

const BENEFITS = [
  {
    icon: AudioLinesIcon,
    label: "FOLLOW ALONG",
    title: "Stay with the conversation.",
    body: "Live transcripts and turn-by-turn translations help you keep up, even when the conversation moves fast.",
    type: "transcript",
  },
  {
    icon: FileSearchIcon,
    label: "BRING YOUR CONTEXT",
    title: "Answers with a foundation.",
    body: "Add your project docs. Get suggestions grounded in their contents, with source passages you can inspect.",
    type: "sources",
  },
  {
    icon: MessageSquareQuoteIcon,
    label: "FIND YOUR WORDS",
    title: "Be ready for your turn.",
    body: "When a question comes your way, get a draft in your language and a ready-to-say reply in theirs.",
    type: "answer",
  },
];

export function Problem() {
  return (
    <section id="problem" className="landing-section benefits-section">
      <div className="landing-container">
        <div className="section-heading-row">
          <SectionIntro
            eyebrow="MORE THAN TRANSLATION"
            title={"You know the topic.\nNow join the conversation."}
            body="For the webinar question, the project demo, and the meeting where your ideas deserve to be heard."
          />
          <span className="section-side-note">
            Less searching for words.
            <br />
            More space for your ideas.
          </span>
        </div>
        <div className="benefit-grid">
          {BENEFITS.map((item, index) => (
            <article className={`benefit-card benefit-${item.type}`} key={item.type}>
              <div className="benefit-card-top">
                <item.icon aria-hidden />
                <span>0{index + 1}</span>
              </div>
              <p className="benefit-label">{item.label}</p>
              <h3>{item.title}</h3>
              <p className="benefit-body">{item.body}</p>
              <div className="benefit-artifact">
                {item.type === "transcript" ? (
                  <>
                    <p className="artifact-label">EXAMPLE TRANSLATION</p>
                    <p>
                      <span className="language-code">EN</span> Let’s talk about your project.
                    </p>
                    <p lang="id">
                      <span className="language-code">ID</span> Mari bahas proyek Anda.
                    </p>
                  </>
                ) : null}
                {item.type === "sources" ? (
                  <>
                    <p className="artifact-label">YOUR KNOWLEDGE, CONNECTED</p>
                    <div className="source-file">
                      <FileTextIcon aria-hidden />
                      <span>
                        architecture.pdf<small>Source passage · page 4</small>
                      </span>
                      <CheckIcon aria-hidden />
                    </div>
                    <div className="source-file">
                      <FileTextIcon aria-hidden />
                      <span>
                        README.md<small>Source passage · Realtime sync</small>
                      </span>
                      <CheckIcon aria-hidden />
                    </div>
                  </>
                ) : null}
                {item.type === "answer" ? (
                  <>
                    <p className="artifact-label">
                      <SparklesIcon aria-hidden /> EXAMPLE · READY TO SAY
                    </p>
                    <blockquote>“We use optimistic locking to keep everyone’s changes in sync.”</blockquote>
                    <p className="artifact-footnote">A starting point. Always yours to review.</p>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const PRINCIPLES = [
  {
    icon: HandIcon,
    title: "Your voice. Your call.",
    body: "Review every suggestion and decide what to say. Contexa never joins or speaks in a meeting on your behalf.",
  },
  {
    icon: FileSearchIcon,
    title: "See where answers come from.",
    body: "Inspect the supporting passages. When your documents don’t cover a question, Contexa tells you.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Listening starts with you.",
    body: "Choose your audio source and press Start. You can stop the session whenever you need to.",
  },
];

export function Principles() {
  return (
    <section id="principles" className="landing-section principles-section">
      <div className="landing-container principles-grid">
        <div>
          <p className="landing-eyebrow">BUILT AROUND YOU</p>
          <h2>
            A little assistance.
            <br />
            <span>All your agency.</span>
          </h2>
          <p className="principles-description">
            Confidence comes from understanding your answer, knowing its source, and making it your own.
          </p>
          <div className="principles-signature">
            <span aria-hidden>
              <AudioLinesIcon />
            </span>{" "}
            Your context. Your language. Your voice.
          </div>
        </div>
        <ul>
          {PRINCIPLES.map((item) => (
            <li key={item.title}>
              <item.icon aria-hidden />
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    question: "Can I try Contexa without a live meeting?",
    answer:
      "Yes. Explore the demo to try a scripted session with sample documents. It doesn’t capture audio or require a live meeting. Start a regular session when you’re ready to use your own audio.",
  },
  {
    question: "What do I need to start?",
    answer:
      "Choose your microphone, a recording, or a browser tab with audio. For tab audio, use Chrome or Edge and enable Share tab audio. You can start without an account and add documents for grounded answer suggestions.",
  },
  {
    question: "Which languages can I follow along in?",
    answer:
      "Read translations in Bahasa Indonesia, English, or Japanese. Speech support depends on the language and speech model selected in session setup. Suggested replies default to the speaker’s language.",
  },
  {
    question: "Can I use my own documents?",
    answer:
      "Yes. Add PDF, DOCX, Markdown, or TXT files, up to 10 MB each and 10 documents per session. You can also import a supported web page, PDF link, or GitHub repository. Review the cited passages before using a suggested answer.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="landing-section">
      <div className="landing-container faq-grid">
        <SectionIntro
          eyebrow="A FEW THINGS TO KNOW"
          title="Before you jump in."
          body="A clearer picture of your first conversation with Contexa."
        />
        <div className="faq-list">
          {QUESTIONS.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <span aria-hidden>+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="landing-container final-section">
      <div className="final-cta">
        <div>
          <p className="landing-eyebrow">LET YOUR IDEAS DO THE TALKING</p>
          <h2>
            Your next conversation,
            <br />
            with a little more confidence.
          </h2>
          <p>Bring your documents. Pick your language. Join in.</p>
        </div>
        <div className="final-actions">
          <Button asChild size="lg" className="landing-primary">
            <Link href="/session">
              Start a session <ArrowRightIcon />
            </Link>
          </Button>
          <Link className="final-demo-link" href="/session?preview">
            Or explore the demo <ArrowRightIcon aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
