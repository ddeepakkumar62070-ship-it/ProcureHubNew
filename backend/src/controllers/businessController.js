const businessRepository = require('../repositories/businessRepository');
const { parsePagination } = require('../utils/pagination');

const editableFields = ['name', 'businessType', 'phone', 'address', 'description', 'website', 'taxIdentifier'];

async function getMyProfile(req, res, next) {
  try {
    const business = await businessRepository.findOwnedByUserId(req.user.id);
    if (!business) return res.status(404).json({ message: 'Business profile not found.' });
    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}

async function updateMyProfile(req, res, next) {
  const fields = {};
  for (const field of editableFields) {
    if (Object.hasOwn(req.body, field)) fields[field] = req.body[field];
  }
  if (!Object.keys(fields).length) {
    return res.status(400).json({ message: 'Provide at least one supported business profile field.' });
  }
  for (const [field, value] of Object.entries(fields)) {
    if (value !== null && typeof value !== 'string') {
      return res.status(400).json({ message: `${field} must be a string.` });
    }
    if (typeof value === 'string' && value.length > (field === 'description' ? 1000 : 500)) {
      return res.status(400).json({ message: `${field} is too long.` });
    }
  }
  if (typeof fields.name === 'string' && !fields.name.trim()) {
    return res.status(400).json({ message: 'Business name cannot be empty.' });
  }
  if (fields.website && !/^https?:\/\/\S+$/i.test(fields.website)) {
    return res.status(400).json({ message: 'Website must be a valid http or https URL.' });
  }
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value === 'string') fields[field] = value.trim();
  }

  try {
    const business = await businessRepository.updateOwned(req.user.id, fields);
    if (!business) return res.status(404).json({ message: 'Business profile not found.' });
    return res.json({ message: 'Business profile updated.', business });
  } catch (error) {
    return next(error);
  }
}

async function listBusinesses(req, res, next) {
  try {
    const businesses = await businessRepository.listAll(parsePagination(req.query));
    return res.json({ businesses });
  } catch (error) {
    return next(error);
  }
}

async function getBusinessById(req, res, next) {
  try {
    const businessId = Number(req.params.id);
    if (!Number.isSafeInteger(businessId) || businessId < 1) {
      return res.status(400).json({ message: 'Business ID must be a positive integer.' });
    }
    const business = await businessRepository.findByBusinessId(businessId);
    if (!business) return res.status(404).json({ message: 'Business profile not found.' });
    if (req.user.role !== 'ADMIN' && Number(business.ownerUserId) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You cannot access another user’s private business profile.' });
    }
    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}

async function getSupplierProfile(req, res, next) {
  try {
    const supplierId = Number(req.params.supplierId);
    if (!Number.isSafeInteger(supplierId) || supplierId < 1) {
      return res.status(400).json({ message: 'Supplier ID must be a positive integer.' });
    }
    const business = await businessRepository.findSupplierPublicProfile(supplierId);
    if (!business) return res.status(404).json({ message: 'Supplier profile not found.' });
    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getBusinessById, getMyProfile, getSupplierProfile, listBusinesses, updateMyProfile };
