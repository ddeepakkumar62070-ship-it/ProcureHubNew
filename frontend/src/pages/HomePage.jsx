import { useState } from 'react';
import { Link } from 'react-router-dom';

const workflowSteps = [
  {
    id: 'request',
    label: 'Request',
    title: 'Buyer request',
    description: 'A buyer shares what their business needs.',
    status: 'Request drafted',
    icon: 'bag',
  },
  {
    id: 'quote',
    label: 'Quote',
    title: 'Supplier quote',
    description: 'Suppliers respond with itemized quotations.',
    status: 'Quote received',
    icon: 'quote',
  },
  {
    id: 'order',
    label: 'Order',
    title: 'Purchase order',
    description: 'The selected quote becomes a trackable order.',
    status: 'Order created',
    icon: 'box',
  },
  {
    id: 'delivery',
    label: 'Delivery',
    title: 'Delivery & invoice',
    description: 'Delivery, invoices, and payment records stay connected.',
    status: 'Delivery tracked',
    icon: 'check',
  },
];

function StepIcon({ kind }) {
  if (kind === 'bag') {
    return <><path d="M6 9h12l1.5 11h-15L6 9z" /><path d="M9 10V7a3 3 0 016 0v3" /><path d="M8 14h8" /></>;
  }
  if (kind === 'quote') {
    return <><path d="M5 5h14v11H9l-4 3V5z" /><path d="M9 9h6M9 12h4" /></>;
  }
  if (kind === 'box') {
    return <><path d="M4 8l7-4 7 4v9l-7 4-7-4V8z" /><path d="M4 8l7 4 7-4M11 12v9" /></>;
  }
  return <><path d="M4 12l5 5L20 6" /><path d="M20 12v6H4V6h10" /></>;
}

function WorkflowVisual() {
  const [activeStep, setActiveStep] = useState('quote');
  const active = workflowSteps.find((step) => step.id === activeStep) || workflowSteps[1];

  return (
    <div className="workflow-visual" role="group" aria-label="Interactive procurement workflow illustration">
      <div className="visual-topline">
        <div>
          <span className="visual-kicker">WORKFLOW OVERVIEW</span>
          <h2>From request to delivery</h2>
        </div>
        <span className="visual-live"><i /> Example flow</span>
      </div>
      <div className="workflow-canvas">
        <svg className="workflow-connectors" viewBox="0 0 520 280" preserveAspectRatio="none" aria-hidden="true">
          <path className="connector-line connector-line-base" d="M90 140H430" />
          <path className="connector-line connector-line-active" d="M90 140H430" />
          <circle className="connector-pulse" r="5">
            <animateMotion dur="5s" repeatCount="indefinite" path="M90 140H430" />
          </circle>
        </svg>
        <div className="workflow-cards">
          {workflowSteps.map((step, index) => (
            <button
              className={`workflow-step-card${activeStep === step.id ? ' is-active' : ''}`}
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              aria-pressed={activeStep === step.id}
              aria-label={`${step.label}: ${step.title}`}
            >
              <span className={`workflow-step-icon workflow-icon-${step.icon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <StepIcon kind={step.icon} />
                </svg>
              </span>
              <span className="workflow-step-number">0{index + 1}</span>
              <strong>{step.label}</strong>
              <span className="workflow-step-status">{step.status}</span>
            </button>
          ))}
        </div>
        <div className="visual-detail-card" aria-live="polite">
          <span className="detail-spark">✦</span>
          <div>
            <strong>{active.title}</strong>
            <p>{active.description}</p>
          </div>
          <span className="detail-arrow" aria-hidden="true">↗</span>
        </div>
        <div className="visual-orbit orbit-one" aria-hidden="true" />
        <div className="visual-orbit orbit-two" aria-hidden="true" />
        <span className="visual-dot dot-one" aria-hidden="true" />
        <span className="visual-dot dot-two" aria-hidden="true" />
        <span className="visual-dot dot-three" aria-hidden="true" />
      </div>
      <div className="visual-footer">
        <span className="participant-avatar avatar-buyer">B</span>
        <span className="participant-avatar avatar-supplier">S</span>
        <span className="participant-avatar avatar-admin">A</span>
        <span>Buyers, suppliers &amp; admins — in sync</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="page-shell hero-page landing-page">
      <nav className="landing-nav" aria-label="Main navigation">
        <Link className="landing-brand" to="/" aria-label="ProcureHub home">
          <img className="landing-logo" src="/procurehub-logo.png" alt="ProcureHub" />
        </Link>
        <div className="landing-nav-actions">
          <Link className="landing-login" to="/login">Login</Link>
          <Link to="/register" className="primary-btn landing-register">Register</Link>
        </div>
      </nav>

      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="landing-eyebrow"><span /> B2B procurement platform</span>
            <h1>Streamline purchases across buyers, suppliers, and admins.</h1>
            <p>
              ProcureHub helps businesses manage purchase requests, quotations, orders, payments, and supplier reviews in one simple workflow.
            </p>
            <div className="landing-hero-actions">
              <Link to="/register" className="primary-btn landing-get-started">
                Get Started <span aria-hidden="true">↗</span>
              </Link>
              <Link to="/login" className="landing-demo-link">
                <span className="demo-play" aria-hidden="true">▶</span>
                View Demo
              </Link>
            </div>
            <div className="landing-trust-line">
              <span className="trust-check" aria-hidden="true">✓</span>
              One connected workflow for every business role
            </div>
          </div>
          <WorkflowVisual />
        </section>

        <section className="landing-features" aria-label="ProcureHub roles">
          <div className="landing-features-heading">
            <span className="landing-eyebrow">ONE WORKSPACE, THREE PERSPECTIVES</span>
            <h2>Procurement that keeps everyone moving.</h2>
          </div>
          <div className="feature-grid landing-feature-grid">
            <article className="feature-card landing-feature-card">
              <span className="feature-index">01 / BUYERS</span>
              <h3>Buy with clarity</h3>
              <p>Create requests, compare supplier quotations, and follow every order through delivery.</p>
            </article>
            <article className="feature-card landing-feature-card">
              <span className="feature-index">02 / SUPPLIERS</span>
              <h3>Sell with confidence</h3>
              <p>Manage inventory, respond to opportunities, and keep buyers updated on orders.</p>
            </article>
            <article className="feature-card landing-feature-card">
              <span className="feature-index">03 / ADMINS</span>
              <h3>Oversee the operation</h3>
              <p>Monitor platform activity, users, products, orders, and supplier reviews.</p>
            </article>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link className="landing-brand landing-footer-brand" to="/" aria-label="ProcureHub home">
          <img className="landing-logo" src="/procurehub-logo.png" alt="ProcureHub" />
        </Link>
        <span>Procurement, connected.</span>
      </footer>
    </div>
  );
}
