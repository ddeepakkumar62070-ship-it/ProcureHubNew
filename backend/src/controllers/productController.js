const productRepository = require('../repositories/productRepository');
const { parsePagination } = require('../utils/pagination');

const listProducts = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    if (categoryId !== undefined && (!Number.isSafeInteger(categoryId) || categoryId < 1)) {
      return res.status(400).json({ message: 'categoryId must be a positive integer.' });
    }
    const products = await productRepository.list({
      ...pagination,
      search: typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : undefined,
      categoryId,
    });
    return res.json({ products });
  } catch (error) {
    return next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const product = await productRepository.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    return res.json({ product });
  } catch (error) {
    return next(error);
  }
};

const createProduct = async (req, res, next) => {
  const { name, category, unit, price, stock, description = '' } = req.body;
  if (typeof name !== 'string' || typeof category !== 'string' || typeof unit !== 'string'
      || typeof description !== 'string' || name.trim().length > 200
      || category.trim().length > 120 || unit.trim().length > 40 || description.length > 65535) {
    return res.status(400).json({ message: 'Product name, category, unit and description must be valid text within their supported lengths.' });
  }
  const numericPrice = Number(price);
  const numericStock = Number(stock);
  if (!name || !category || !unit || !Number.isFinite(numericPrice) || numericPrice < 0
      || !Number.isFinite(numericStock) || numericStock < 0) {
    return res.status(400).json({ message: 'Provide a name, category, unit, and non-negative numeric price and stock.' });
  }

  try {
    if (!String(name).trim() || !String(category).trim() || !String(unit).trim()) {
      return res.status(400).json({ message: 'Name, category and unit cannot be empty.' });
    }
    const product = await productRepository.create({
      supplierId: req.user.id,
      name: String(name).trim(),
      category: String(category).trim(),
      unit: String(unit).trim(),
      price: numericPrice,
      stock: numericStock,
      description: String(description),
    });
    return res.status(201).json({ message: 'Product added successfully.', product });
  } catch (error) {
    if (error.code === 'CATEGORY_NOT_FOUND') {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
};

const updateProduct = async (req, res, next) => {
  const fields = {};
  const allowedFields = ['name', 'category', 'unit', 'price', 'stock', 'description', 'isActive'];
  for (const field of allowedFields) {
    if (Object.hasOwn(req.body, field)) fields[field] = req.body[field];
  }
  if (!Object.keys(fields).length) {
    return res.status(400).json({ message: 'Provide at least one supported product field to update.' });
  }
  if (Object.hasOwn(fields, 'price') && (!Number.isFinite(Number(fields.price)) || Number(fields.price) < 0)) {
    return res.status(400).json({ message: 'Price must be a non-negative number.' });
  }
  for (const field of ['name', 'category', 'unit', 'description']) {
    if (Object.hasOwn(fields, field)
        && (typeof fields[field] !== 'string' || !fields[field].trim()
          || fields[field].length > ({ name: 200, category: 120, unit: 40, description: 65535 }[field]))) {
      return res.status(400).json({ message: `${field} must be non-empty text within its supported length.` });
    }
  }
  if (Object.hasOwn(fields, 'stock') && (!Number.isFinite(Number(fields.stock)) || Number(fields.stock) < 0)) {
    return res.status(400).json({ message: 'Stock must be a non-negative number.' });
  }
  if (Object.hasOwn(fields, 'price')) fields.price = Number(fields.price);
  if (Object.hasOwn(fields, 'stock')) fields.stock = Number(fields.stock);
  if (Object.hasOwn(fields, 'isActive')) {
    if (typeof fields.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean.' });
    }
  }

  try {
    const product = await productRepository.update(req.params.id, {
      supplierId: req.user.id,
      isAdmin: req.user.role === 'ADMIN',
      fields,
    });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    return res.json({ message: 'Product updated successfully.', product });
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.code === 'CATEGORY_NOT_FOUND') {
      return res.status(error.code === 'FORBIDDEN' ? 403 : 400).json({ message: error.message });
    }
    if (error.code === 'STOCK_RESERVED') return res.status(409).json({ message: error.message });
    return next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const result = await productRepository.remove(req.params.id, {
      supplierId: req.user.id,
      isAdmin: req.user.role === 'ADMIN',
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Product not found.' });
    if (result === 'FORBIDDEN') return res.status(403).json({ message: 'You cannot delete this product.' });
    return res.json({ message: 'Product removed successfully.' });
  } catch (error) {
    return next(error);
  }
};

const listMyProducts = async (req, res, next) => {
  try {
    const products = await productRepository.list({
      supplierId: req.user.id,
      includeInactive: true,
      ...parsePagination(req.query),
    });
    return res.json({ products });
  } catch (error) {
    return next(error);
  }
};

const getInventory = async (req, res, next) => {
  try {
    const product = await productRepository.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    if (Number(product.supplierId) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You can only view inventory for your own products.' });
    }
    const inventory = await productRepository.findInventory(req.params.id);
    return res.json({ inventory });
  } catch (error) {
    return next(error);
  }
};

const updateInventory = async (req, res, next) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return res.status(400).json({ message: 'Inventory quantity must be a non-negative number.' });
  }
  try {
    const inventory = await productRepository.setInventoryQuantity(req.params.id, req.user.id, quantity);
    if (inventory === 'NOT_FOUND') return res.status(404).json({ message: 'Product inventory not found.' });
    if (inventory === 'STOCK_RESERVED') {
      return res.status(409).json({ message: 'Quantity cannot be lower than stock reserved for orders.' });
    }
    return res.json({ message: 'Inventory updated.', inventory });
  } catch (error) {
    return next(error);
  }
};

const listMyInventory = async (req, res, next) => {
  try {
    const inventory = await productRepository.listSupplierInventory(req.user.id, parsePagination(req.query));
    return res.json({ inventory });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProduct,
  deleteProduct,
  getInventory,
  getProductById,
  listMyInventory,
  listMyProducts,
  listProducts,
  updateInventory,
  updateProduct,
};
