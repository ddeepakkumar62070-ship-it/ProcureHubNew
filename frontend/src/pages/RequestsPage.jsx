import { useCallback, useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const blankItem = () => ({ productId: '', name: '', quantity: '1', unit: 'each' });

export default function RequestsPage() {
  const { user } = useAuth();
  const isBuyer = user?.role === 'BUYER';
  const [requests, setRequests] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ title: '', category: '', deliveryAddress: '', deliveryDeadline: '', notes: '', items: [blankItem()] });
  const [quoteFields, setQuoteFields] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [requestResponse, quoteResponse] = await Promise.all([
        api.get('/purchase-requests'),
        api.get('/quotations'),
      ]);
      setRequests(requestResponse.data.requests);
      setQuotations(quoteResponse.data.quotations);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load purchase requests and quotations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    Promise.all([api.get('/categories'), api.get('/products')])
      .then(([categoryResponse, productResponse]) => {
        setCategories(categoryResponse.data.categories);
        setProducts(productResponse.data.products);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Could not load categories or products.'));
  }, [loadData]);

  const createRequest = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...form,
        deliveryDeadline: form.deliveryDeadline || undefined,
        items: form.items.map((item) => ({
          productId: item.productId ? Number(item.productId) : undefined,
          name: item.name,
          quantity: Number(item.quantity),
          unit: item.unit,
        })),
      };
      const { data } = await api.post('/purchase-requests', payload);
      setRequests((current) => [data.request, ...current]);
      setForm({ title: '', category: '', deliveryAddress: '', deliveryDeadline: '', notes: '', items: [blankItem()] });
      setSuccess(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not create purchase request.');
    }
  };

  const selectProduct = (index, productId) => {
    const selected = products.find((product) => String(product.id) === productId);
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, productId, name: selected?.name || item.name, unit: selected?.unit || item.unit }
        : item),
    }));
  };

  const submitQuotation = async (request) => {
    setError('');
    setSuccess('');
    const fields = quoteFields[request.id] || {};
    const items = request.items.map((item) => ({
      requestItemId: item.id,
      quantity: Number(item.quantity),
      unitPrice: Number(fields[item.id] || 0),
    }));
    try {
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const { data } = await api.post('/quotations', {
        requestId: request.id,
        amount: Number(total.toFixed(2)),
        items,
        deliveryDays: Number(fields.deliveryDays || 0),
        message: fields.message || '',
        terms: fields.terms || '',
      });
      setSuccess(data.message);
      await loadData();
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit quotation.');
      return false;
    }
  };

  const updateQuotation = async (quotationId, status) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.patch(`/quotations/${quotationId}`, { status });
      setSuccess(data.message);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update quotation.');
    }
  };

  const createOrder = async (quotationId) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/orders', { quotationId });
      setSuccess(data.message);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not create purchase order.');
    }
  };

  const updateItem = (index, key, value) => {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  };

  return (
    <WorkspaceLayout title={isBuyer ? 'Purchase requests and quotations' : 'Requests to quote'}>
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      {isBuyer && (
        <section className="panel">
          <h2>Create a purchase request</h2>
          <form className="workspace-form grid-form" onSubmit={createRequest}>
            <label>Request title<input required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              <option value="">Select category</option>
              {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
            </select></label>
            <label>Delivery address<input value={form.deliveryAddress} onChange={(event) => setForm({ ...form, deliveryAddress: event.target.value })} /></label>
            <label>Delivery deadline<input type="date" value={form.deliveryDeadline} onChange={(event) => setForm({ ...form, deliveryDeadline: event.target.value })} /></label>
            <label className="full-width">Notes<textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <div className="full-width request-lines">
              <h3>Items requested</h3>
              {form.items.map((item, index) => (
                <div className="request-line" key={index}>
                  <label>Catalogue product (optional)<select value={item.productId} onChange={(event) => selectProduct(index, event.target.value)}>
                    <option value="">Custom item</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.supplierName}</option>)}
                  </select></label>
                  <label>Item name<input required value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} /></label>
                  <label>Quantity<input required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></label>
                  <label>Unit<input required value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} /></label>
                  {form.items.length > 1 && <button className="text-button remove-line" type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}
                </div>
              ))}
              <button className="secondary-btn" type="button" onClick={() => setForm({ ...form, items: [...form.items, blankItem()] })}>Add another item</button>
            </div>
            <button className="primary-btn" type="submit">Post purchase request</button>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="section-title"><h2>{isBuyer ? 'Your requests' : 'Open buyer requests'}</h2><button className="secondary-btn" onClick={loadData}>Refresh</button></div>
        {loading ? <p>Loading requests…</p> : requests.length === 0 ? <p className="empty-state">No requests available.</p> : (
          <div className="stack-list">
            {requests.map((request) => (
              <article className="workflow-card" key={request.id}>
                <div className="section-title"><div><h3>{request.title}</h3><span>{request.category} · Request #{request.id}</span></div><span className="status-pill">{request.status}</span></div>
                {request.notes && <p>{request.notes}</p>}
                <ul className="compact-list">{request.items.map((item) => <li key={item.id}>{item.name}: {item.quantity} {item.unit}</li>)}</ul>
                {isBuyer ? (
                  <div className="quote-list">
                    <h4>Quotations</h4>
                    {quotations.filter((quote) => Number(quote.requestId) === Number(request.id)).length === 0
                      ? <p>No quotations received yet.</p>
                      : quotations.filter((quote) => Number(quote.requestId) === Number(request.id)).map((quote) => (
                        <div className="quote-card" key={quote.id}>
                          <div className="section-title"><strong>{quote.supplierName || `Supplier #${quote.supplierId}`}</strong><span className="status-pill">{quote.status}</span></div>
                          <p>Total: {quote.currency} {Number(quote.amount).toFixed(2)}{quote.deliveryDays !== null ? ` · ${quote.deliveryDays} delivery days` : ''}</p>
                          {quote.message && <p>{quote.message}</p>}
                          <ul className="compact-list">{quote.items.map((item) => <li key={item.id}>{item.name}: {item.quantity} × {quote.currency} {Number(item.unitPrice).toFixed(2)}</li>)}</ul>
                          {quote.status === 'PENDING' && <div className="button-row">
                            <button className="primary-btn" onClick={() => updateQuotation(quote.id, 'ACCEPTED')}>Accept</button>
                            <button className="secondary-btn" onClick={() => updateQuotation(quote.id, 'REJECTED')}>Reject</button>
                          </div>}
                          {quote.status === 'ACCEPTED' && <button className="primary-btn" onClick={() => createOrder(quote.id)}>Create purchase order</button>}
                        </div>
                      ))}
                  </div>
                ) : (() => {
                  const submittedQuote = quotations.find((quote) => Number(quote.requestId) === Number(request.id));
                  return submittedQuote
                    ? <p className="alert info">You submitted a quotation for this request. Current status: <strong>{submittedQuote.status}</strong> · {submittedQuote.currency} {Number(submittedQuote.amount).toFixed(2)}.</p>
                    : <SupplierQuoteForm
                      request={request}
                      values={quoteFields[request.id] || {}}
                      setValues={(values) => setQuoteFields({ ...quoteFields, [request.id]: values })}
                      onSubmit={() => submitQuotation(request)}
                    />;
                })()}
              </article>
            ))}
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}

function SupplierQuoteForm({ request, values, setValues, onSubmit }) {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const update = (key, value) => setValues({ ...values, [key]: value });
  const send = async (event) => {
    event.preventDefault();
    if (await onSubmit()) setSubmitted(true);
  };
  if (user?.role !== 'SUPPLIER') return null;
  return (
    <form className="quote-form" onSubmit={send}>
      <h4>Submit your quotation</h4>
      {request.items.map((item) => (
        <label key={item.id}>{item.name} — {item.quantity} {item.unit} · Unit price
          <input required min="0" step="0.01" type="number" value={values[item.id] ?? ''} onChange={(event) => update(item.id, event.target.value)} />
        </label>
      ))}
      <div className="grid-form">
        <label>Delivery days<input min="0" step="1" type="number" value={values.deliveryDays ?? ''} onChange={(event) => update('deliveryDays', event.target.value)} /></label>
        <label>Message<input value={values.message ?? ''} onChange={(event) => update('message', event.target.value)} /></label>
      </div>
      <label>Terms<textarea rows={2} value={values.terms ?? ''} onChange={(event) => update('terms', event.target.value)} /></label>
      <button className="primary-btn" type="submit" disabled={submitted}>{submitted ? 'Quotation submitted' : 'Submit quotation'}</button>
    </form>
  );
}
