const categoryRepository = require('../repositories/categoryRepository');

async function listCategories(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    if (includeInactive && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only administrators can view inactive categories.' });
    }
    return res.json({ categories: await categoryRepository.list({ includeInactive }) });
  } catch (error) {
    return next(error);
  }
}

async function createCategory(req, res, next) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const description = req.body.description === undefined ? null : req.body.description;
  if (!name || name.length > 120 || (description !== null && typeof description !== 'string')) {
    return res.status(400).json({ message: 'A category name up to 120 characters is required; description must be text.' });
  }
  try {
    const category = await categoryRepository.create({ name, description });
    return res.status(201).json({ message: 'Category created.', category });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Category already exists.' });
    return next(error);
  }
}

async function updateCategory(req, res, next) {
  const { name, description, isActive } = req.body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 120)) {
    return res.status(400).json({ message: 'Category name must be between 1 and 120 characters.' });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ message: 'Description must be text.' });
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive must be a boolean.' });
  }
  try {
    const category = await categoryRepository.update(req.params.id, {
      name: name?.trim(),
      description,
      isActive,
    });
    if (!category) return res.status(404).json({ message: 'Category not found.' });
    return res.json({ message: 'Category updated.', category });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Category name already exists.' });
    return next(error);
  }
}

module.exports = { createCategory, listCategories, updateCategory };
