import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const emptyProduct = { name: '', category: '', unit: 'each', price: '', stock: '', description: '' };

export default function ProductsPage() {
  const { user } = useAuth();
  const isSupplier = user?.role === 'SUPPLIER';
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [stockEdits, setStockEdits] = useState({});
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierDetails, setSupplierDetails] = useState({});
  const [editingProductId, setEditingProductId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(isSupplier ? '/products/mine' : '/products', {
        params: isSupplier ? {} : { search: search || undefined, categoryId: categoryId || undefined },
      });
      setProducts(data.products);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, isSupplier, search]);

  useEffect(() => {
    api.get('/categories')
      .then(({ data }) => setCategories(data.categories))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Could not load product categories.'));
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addProduct = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/products', { ...form, price: Number(form.price), stock: Number(form.stock) });
      setProducts((current) => [data.product, ...current]);
      setForm(emptyProduct);
      setSuccess(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not create product.');
    }
  };

  const updateStock = async (productId) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put(`/products/${productId}/inventory`, { quantity: Number(stockEdits[productId]) });
      setProducts((current) => current.map((product) => (
        product.id === productId ? { ...product, stock: data.inventory.quantity } : product
      )));
      setSuccess('Inventory quantity updated.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update inventory.');
    }
  };

  const startEditing = (product) => {
    setEditingProductId(product.id);
    setEditForm({
      name: product.name,
      category: product.category,
      unit: product.unit,
      price: product.price,
      description: product.description || '',
    });
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put(`/products/${editingProductId}`, {
        ...editForm,
        price: Number(editForm.price),
      });
      setProducts((current) => current.map((product) => product.id === editingProductId ? data.product : product));
      setEditingProductId(null);
      setSuccess(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update product.');
    }
  };

  const setProductActive = async (product) => {
    setError('');
    setSuccess('');
    try {
      if (product.isActive) {
        const { data } = await api.delete(`/products/${product.id}`);
        setSuccess(data.message);
        await loadProducts();
      } else {
        const { data } = await api.put(`/products/${product.id}`, { isActive: true });
        setProducts((current) => current.map((entry) => entry.id === product.id ? data.product : entry));
        setSuccess(data.message);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not change product availability.');
    }
  };

  const showSupplier = async (supplierId) => {
    if (supplierDetails[supplierId]) {
      setSupplierDetails((current) => ({ ...current, [supplierId]: null }));
      return;
    }
    try {
      const { data } = await api.get(`/businesses/suppliers/${supplierId}/public`);
      setSupplierDetails((current) => ({ ...current, [supplierId]: data.business }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load supplier profile.');
    }
  };

  return (
    <WorkspaceLayout title={isSupplier ? 'Products and inventory' : 'Product catalogue'}>
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      {isSupplier && (
        <section className="panel">
          <h2>Add a product</h2>
          <form className="workspace-form grid-form" onSubmit={addProduct}>
            <label>Product name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              <option value="">Select category</option>
              {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
            </select></label>
            <label>Unit<input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
            <label>Unit price<input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
            <label>Available quantity<input required min="0" step="0.001" type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
            <label className="full-width">Description<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <button className="primary-btn" type="submit">Add product</button>
          </form>
        </section>
      )}
      {!isSupplier && (
        <section className="panel catalog-filters">
          <label>Search products<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, category or supplier" /></label>
          <label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
        </section>
      )}
      <section className="panel">
        <div className="section-title"><h2>{isSupplier ? 'Your listed products' : 'Available products'}</h2><span>{products.length} shown</span></div>
        {loading ? <p>Loading products…</p> : products.length === 0 ? <p className="empty-state">No products found.</p> : (
          <div className="card-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="section-title"><h3>{product.name}</h3><span className="status-pill">{product.category}</span></div>
                <p>{product.description || 'No description provided.'}</p>
                <p><strong>{product.currency || 'USD'} {Number(product.price).toFixed(2)}</strong> / {product.unit}</p>
                <p>Available quantity: <strong>{product.stock}</strong></p>
                {isSupplier ? (
                  <>
                    {!product.isActive && <span className="status-pill">Inactive</span>}
                    <label>Update stock
                      <span className="inline-form">
                        <input type="number" min="0" step="0.001" value={stockEdits[product.id] ?? product.stock} onChange={(event) => setStockEdits({ ...stockEdits, [product.id]: event.target.value })} />
                        <button className="secondary-btn" onClick={() => updateStock(product.id)}>Save stock</button>
                      </span>
                    </label>
                    {editingProductId === product.id ? (
                      <form className="workspace-form" onSubmit={saveProduct}>
                        <label>Name<input required value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
                        <label>Category<select required value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}>
                          {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                        </select></label>
                        <label>Unit<input required value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value })} /></label>
                        <label>Unit price<input required type="number" min="0" step="0.01" value={editForm.price} onChange={(event) => setEditForm({ ...editForm, price: event.target.value })} /></label>
                        <label>Description<textarea rows={2} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>
                        <div className="button-row">
                          <button className="primary-btn" type="submit">Save changes</button>
                          <button className="secondary-btn" type="button" onClick={() => setEditingProductId(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="button-row">
                        <button className="secondary-btn" onClick={() => startEditing(product)}>Edit product</button>
                        <button className="secondary-btn" onClick={() => setProductActive(product)}>{product.isActive ? 'Deactivate' : 'Reactivate'}</button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button className="text-button" onClick={() => showSupplier(product.supplierId)}>Supplier details</button>
                    {supplierDetails[product.supplierId] && (
                      <div className="supplier-info">
                        <strong>{supplierDetails[product.supplierId].name}</strong>
                        <span>{supplierDetails[product.supplierId].businessType}</span>
                        <span>{supplierDetails[product.supplierId].averageRating
                          ? `${Number(supplierDetails[product.supplierId].averageRating).toFixed(1)} / 5 average rating`
                          : 'No reviews yet'}</span>
                      </div>
                    )}
                    <Link className="text-button" to="/requests">Create a purchase request</Link>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}
