import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="page-shell hero-page">
      <nav className="topbar">
        <div className="brand">ProcureHub</div>
        <div className="nav-actions">
          <Link to="/login">Login</Link>
          <Link to="/register" className="primary-btn">Register</Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <span className="eyebrow">B2B procurement platform</span>
          <h1>Streamline purchases across buyers, suppliers, and admins.</h1>
          <p>
            ProcureHub helps businesses manage purchase requests, quotations, orders,
            payments, and supplier reviews in one simple workflow.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="primary-btn">Get Started</Link>
            <Link to="/login" className="secondary-btn">View demo</Link>
          </div>
        </div>
        <div className="hero-card">
          <h3>Procurement flow</h3>
          <ul>
            <li>Buyer submits purchase request</li>
            <li>Supplier sends quotation</li>
            <li>Buyer selects supplier</li>
            <li>Order is tracked to delivery</li>
          </ul>
        </div>
      </section>

      <section className="feature-grid">
        <div className="feature-card">
          <h3>Buyers</h3>
          <p>Create purchase requests, compare quotations, and manage order progress.</p>
        </div>
        <div className="feature-card">
          <h3>Suppliers</h3>
          <p>Manage inventory, submit quotations, update orders, and track reviews.</p>
        </div>
        <div className="feature-card">
          <h3>Admins</h3>
          <p>Monitor platform activity, users, products, orders, and reviews.</p>
        </div>
      </section>
    </div>
  );
}
