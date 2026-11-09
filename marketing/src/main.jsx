/* eslint react-refresh/only-export-components: off -- static landing entry point */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import registry from "../../backend/src/config/plans.json" with { type: "json" };
import "./styles.css";

const appUrl = (
  import.meta.env.VITE_APP_URL || "http://localhost:5173"
).replace(/\/$/, "");
const plans = registry.plans;
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: registry.currency,
  maximumFractionDigits: 0,
});

const featureGroups = [
  {
    number: "01",
    title: "Create clear invoices",
    copy: "Build drafts, review line items and configured tax fields, then finalize and keep a PDF copy with your records.",
  },
  {
    number: "02",
    title: "Keep the details together",
    copy: "Organize customer records, expenses and payment entries in one workspace for your business.",
  },
  {
    number: "03",
    title: "See what needs attention",
    copy: "Check outstanding balances, due dates and reports that help you follow up on your own terms.",
  },
];

const faq = [
  {
    question: "Do I need a card to start the trial?",
    answer:
      "No. The 14-day King trial starts after you set up your workspace. No card is collected to start.",
  },
  {
    question: "Does InvoiceFlow file GST returns or give tax advice?",
    answer:
      "No. InvoiceFlow organizes the invoice and tax information you configure. Review tax settings and treatment with a qualified accountant.",
  },
  {
    question: "What happens to my records if my subscription ends?",
    answer:
      "Your workspace becomes read-only after the trial or paid period ends. You can still view records, download invoice PDFs, record payments on existing invoices, and export your data. Your records are not deleted.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can request a plan change from Billing in your workspace. A downgrade takes effect at the end of the current billing period.",
  },
];

function Price({ plan, interval }) {
  const minor = interval === "year" ? plan.annualMinor : plan.monthlyMinor;
  const shown = interval === "year" ? minor / 12 : minor;
  return <>{money.format(shown / 100)}</>;
}

function ProductPreview({ variant = "dashboard" }) {
  const isInvoiceList = variant === "invoices";
  return (
    <>
      <div
        className="preview-window"
        role="img"
        aria-label={`InvoiceFlow ${isInvoiceList ? "invoice list" : "dashboard"} interface preview`}
      >
        <div className="preview-bar">
          <span className="preview-mark" aria-hidden="true">
            i
          </span>
          <span>InvoiceFlow</span>
          <span className="preview-business">Studio North</span>
          <span className="preview-avatar" aria-label="Owner">
            S
          </span>
        </div>
        <div className="preview-body">
          <aside className="preview-nav" aria-hidden="true">
            <span className="selected">Overview</span>
            <span>Invoices</span>
            <span>Customers</span>
            <span>Reports</span>
          </aside>
          <div className="preview-content">
            <div className="preview-title-row">
              <div>
                <p className="preview-kicker">
                  {isInvoiceList ? "INVOICE REGISTER" : "WORKSPACE OVERVIEW"}
                </p>
                <h2>
                  {isInvoiceList
                    ? "Invoice records"
                    : "Your business at a glance"}
                </h2>
              </div>
              <span className="preview-add">＋ New invoice</span>
            </div>
            <div className="preview-stats">
              <div>
                <span>{isInvoiceList ? "Issued" : "Issued this month"}</span>
                <strong>{isInvoiceList ? "24" : "12"}</strong>
                <small>{isInvoiceList ? "This year" : "Invoices"}</small>
              </div>
              <div>
                <span>{isInvoiceList ? "Drafts" : "Outstanding"}</span>
                <strong>{isInvoiceList ? "3" : "₹48,500"}</strong>
                <small>
                  {isInvoiceList ? "In progress" : "Across 6 invoices"}
                </small>
              </div>
              <div>
                <span>{isInvoiceList ? "Paid" : "Overdue"}</span>
                <strong>{isInvoiceList ? "18" : "₹12,000"}</strong>
                <small>
                  {isInvoiceList ? "This month" : "Needs a follow-up"}
                </small>
              </div>
            </div>
            <div className="preview-list">
              <div className="preview-list-heading">
                <strong>
                  {isInvoiceList ? "All invoices" : "Recent invoices"}
                </strong>
                <span>{isInvoiceList ? "Filter" : "View all"}</span>
              </div>
              <div className="preview-row">
                <span className="preview-dot dot-blue" /> INV-2026-041{" "}
                <span>Northstar Studio</span>
                <b>₹18,000</b>
                <em>Sent</em>
              </div>
              <div className="preview-row">
                <span className="preview-dot dot-green" /> INV-2026-
                {isInvoiceList ? "038" : "040"} <span>Paper Kite Co.</span>
                <b>₹9,500</b>
                <em className="paid">Paid</em>
              </div>
              <div className="preview-row">
                <span className="preview-dot dot-amber" /> INV-2026-039{" "}
                <span>Field Notes Ltd.</span>
                <b>₹12,000</b>
                <em className="late">Overdue</em>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="preview-caption">
        Illustrative workspace preview · Example records
      </p>
    </>
  );
}

function PricingCard({ planKey, interval }) {
  const plan = plans[planKey];
  const invoiceLimit = plan.finalizedInvoicesPerMonth.toLocaleString("en-IN");
  const isFeatured = planKey === "anointed";
  const features = {
    basic: [
      `${invoiceLimit} finalized invoices each month`,
      `${plan.activeCustomers} active customers`,
      "Customers, invoices, payments and PDF copies",
      "Due and overdue in-app reminders",
      "Export your own records",
    ],
    anointed: [
      `${invoiceLimit} finalized invoices each month`,
      `${plan.activeCustomers?.toLocaleString("en-IN") ?? "Unlimited"} active customers`,
      "Everything in Basic",
      "Expense records and receipt uploads",
      "Full in-app reminder schedule",
      "CSV reports and full data export",
    ],
    king: [
      `${invoiceLimit} finalized invoices each month`,
      "Unlimited active customers",
      "Everything in Anointed",
      "5 GB receipt storage",
      "Full data export",
    ],
  }[planKey];

  return (
    <article className={`price-card${isFeatured ? " featured" : ""}`}>
      {isFeatured && <span className="popular-tag">POPULAR</span>}
      <div className="plan-heading">
        <div>
          <h3>{plan.name}</h3>
          <p>
            {planKey === "basic"
              ? "For getting started"
              : planKey === "anointed"
                ? "For a growing business"
                : "For a busy workspace"}
          </p>
        </div>
        <span className={`plan-mark ${planKey}`} aria-hidden="true">
          {planKey === "basic" ? "01" : planKey === "anointed" ? "02" : "03"}
        </span>
      </div>
      <p className="price">
        <strong>
          <Price plan={plan} interval={interval} />
        </strong>
        <span> / month</span>
      </p>
      <p className="billing-note">
        {interval === "year"
          ? `Billed annually at ${money.format(plan.annualMinor / 100)}`
          : "Billed monthly"}
      </p>
      <p className="tax-note">Plus applicable taxes.</p>
      <a
        className={
          isFeatured ? "button button-primary" : "button button-secondary"
        }
        href={`${appUrl}/register?plan=trial`}
      >
        Start 14-day free trial <span aria-hidden="true">↗</span>
      </a>
      <p className="card-no-card">No card required to start</p>
      <ul className="plan-features">
        {features.map((feature) => (
          <li key={feature}>
            <span aria-hidden="true">✓</span>
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

function LandingPage() {
  const [interval, setInterval] = useState("month");
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="wordmark" href="#top">
          <span className="brand-glyph" aria-hidden="true">
            i
          </span>
          InvoiceFlow
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="header-actions">
          <a className="login-link" href={`${appUrl}/login`}>
            Sign in
          </a>
          <a
            className="button button-small"
            href={`${appUrl}/register?plan=trial`}
          >
            Start free trial <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main id="main">
        <section className="hero-section" id="top">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              INVOICING, WITH ROOM TO THINK
            </span>
            <h1>
              Good work deserves <span>a clear flow.</span>
            </h1>
            <p className="hero-description">
              Prepare invoices, keep customer and payment records together, and
              see what needs your attention.
            </p>
            <div className="hero-actions">
              <a
                className="button button-primary button-large"
                href={`${appUrl}/register?plan=trial`}
              >
                Start 14-day free trial <span aria-hidden="true">↗</span>
              </a>
              <a className="text-link" href="#how-it-works">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="hero-note">
              <span aria-hidden="true">✳</span> No card required to start · Your
              first 14 days are on us
            </p>
          </div>
          <div className="hero-art">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <span className="art-spark spark-one">✳</span>
            <span className="art-spark spark-two">✳</span>
            <ProductPreview />
            <div className="float-note">
              <span className="float-icon">↗</span>
              <span>
                <strong>Stay in the loop</strong>
                <small>See what is due at a glance</small>
              </span>
            </div>
          </div>
          <div className="hero-bottom">
            <span>BUILT FOR YOUR DAY-TO-DAY</span>
            <div>
              <span>01&nbsp; INVOICES</span>
              <span>02&nbsp; CUSTOMERS</span>
              <span>03&nbsp; RECORDS</span>
            </div>
          </div>
        </section>

        <section className="intro-section section-pad" id="features">
          <div className="section-heading">
            <p className="eyebrow">THE WORK, IN ONE PLACE</p>
            <h2>
              Less searching.
              <br />
              <span>More getting on with it.</span>
            </h2>
            <p>
              Bring the everyday pieces of invoicing into one calm workspace.
            </p>
          </div>
          <div className="feature-grid">
            {featureGroups.map((feature) => (
              <article className="feature-card" key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <div className="feature-icon" aria-hidden="true">
                  {feature.number === "01"
                    ? "▤"
                    : feature.number === "02"
                      ? "◫"
                      : "⌁"}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <a href="#how-it-works" aria-label={`Explore ${feature.title}`}>
                  Explore <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="steps-section section-pad" id="how-it-works">
          <div className="steps-heading">
            <p className="eyebrow">A SIMPLE PLACE TO START</p>
            <h2>
              From first draft
              <br />
              to <span>all caught up.</span>
            </h2>
            <p>Three steps to keep the admin moving.</p>
          </div>
          <div className="steps-list">
            <article>
              <span>01</span>
              <div>
                <h3>Set up your workspace</h3>
                <p>
                  Add your business details and choose the settings you use for
                  invoices.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Make an invoice</h3>
                <p>
                  Add a customer and line items. Review the details, then
                  finalize when it is ready.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Keep track as you go</h3>
                <p>
                  Record payments, check what is outstanding, and download your
                  invoice PDF.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          className="preview-section section-pad"
          aria-labelledby="preview-title"
        >
          <div className="preview-copy">
            <p className="eyebrow">A LITTLE MORE CLARITY</p>
            <h2 id="preview-title">
              Your day, <span>in view.</span>
            </h2>
            <p>
              See recent invoices and the balances that may need a follow-up.
              The overview is built around the records you keep.
            </p>
            <a className="text-link" href={`${appUrl}/register?plan=trial`}>
              Take a look inside <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="preview-stage">
            <div className="preview-glow" />
            <figure className="real-screenshot">
              <img
                src="/dashboard-screenshot.png"
                alt="InvoiceFlow dashboard with business totals and recent invoices. The records shown are examples."
              />
              <figcaption>
                Workspace screenshot · Example records shown
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="pricing-section section-pad" id="pricing">
          <div className="pricing-intro">
            <p className="eyebrow">STRAIGHTFORWARD PLANS</p>
            <h2>
              A plan that <span>fits your flow.</span>
            </h2>
            <p>Start with a 14-day trial. Pick a plan when you are ready.</p>
            <div
              className="billing-switch"
              role="group"
              aria-label="Billing interval"
            >
              <button
                type="button"
                aria-pressed={interval === "month"}
                onClick={() => setInterval("month")}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={interval === "year"}
                onClick={() => setInterval("year")}
              >
                Yearly <span>2 months free</span>
              </button>
            </div>
          </div>
          <div className="pricing-grid">
            <PricingCard planKey="basic" interval={interval} />
            <PricingCard planKey="anointed" interval={interval} />
            <PricingCard planKey="king" interval={interval} />
          </div>
          <p className="pricing-footnote">
            Prices are shown in Indian rupees, before applicable taxes. Annual
            plans are billed once per year. Razorpay checkout is available only
            after payment settings are configured.
          </p>
        </section>

        <section className="faq-section section-pad" id="faq">
          <div className="faq-intro">
            <p className="eyebrow">GOOD QUESTIONS</p>
            <h2>
              A few things
              <br />
              <span>you might wonder.</span>
            </h2>
          </div>
          <div className="faq-list">
            {faq.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <span aria-hidden="true">＋</span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="disclaimer-section">
          <p>
            {
              "InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant."
            }
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main">
          <a className="wordmark" href="#top">
            <span className="brand-glyph" aria-hidden="true">
              i
            </span>
            InvoiceFlow
          </a>
          <p>Make the business paperwork a little easier to follow.</p>
          <a className="footer-trial" href={`${appUrl}/register?plan=trial`}>
            Start your free trial <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} InvoiceFlow</span>
          <nav aria-label="Legal and support">
            <a href="#terms">Terms</a>
            <a href="#privacy">Privacy</a>
            <a href="#cancellation">Refund &amp; cancellation</a>
            <a href="#contact">Contact</a>
            <a href="#status">Status</a>
          </nav>
        </div>
        <div className="footer-notices">
          <p id="terms">
            <strong>Terms:</strong> Terms will be supplied by the InvoiceFlow
            owner before paid subscriptions launch.
          </p>
          <p id="privacy">
            <strong>Privacy:</strong> Privacy information will be supplied by
            the InvoiceFlow owner before paid subscriptions launch.
          </p>
          <p id="cancellation">
            <strong>Refund and cancellation:</strong> Policy details will be
            supplied by the InvoiceFlow owner before paid subscriptions launch.
          </p>
          <p id="contact">
            <strong>Contact:</strong> Contact details have not been configured.
          </p>
          <p id="status">
            <strong>Status:</strong> A public service status page has not been
            configured.
          </p>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<LandingPage />);
