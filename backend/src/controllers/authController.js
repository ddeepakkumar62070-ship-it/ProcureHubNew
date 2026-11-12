const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const { generateToken } = require('../utils/jwt');

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  businessName: user.businessName,
  isActive: Boolean(user.isActive),
});

const isValidEmail = (email) => typeof email === 'string'
  && email.length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const registerUser = async (req, res, next) => {
  const { name, email, password, role, businessName } = req.body || {};
  const errors = {};
  if (typeof name !== 'string' || !name.trim()) errors.name = 'Full name is required.';
  else if (name.trim().length > 150) errors.name = 'Full name must be 150 characters or fewer.';
  if (typeof email !== 'string' || !email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(email.trim())) errors.email = 'Enter a valid email address.';
  if (typeof password !== 'string' || !password) errors.password = 'Password is required.';
  else if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    errors.password = 'Password must be between 8 and 72 bytes.';
  }
  if (businessName !== undefined && businessName !== '') {
    if (typeof businessName !== 'string' || !businessName.trim()) {
      errors.businessName = 'Business name must not be blank.';
    } else if (businessName.trim().length > 200) {
      errors.businessName = 'Business name must be 200 characters or fewer.';
    }
  }
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }
  if (!['BUYER', 'SUPPLIER'].includes(role)) {
    return res.status(400).json({
      message: 'Please correct the highlighted fields.',
      errors: { role: 'Choose Buyer or Supplier.' },
    });
  }

  try {
    const trimmedName = name.trim();
    const user = await userRepository.create({
      name: trimmedName,
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role,
      businessName: (businessName || `${trimmedName}'s Business`).trim(),
    });
    const safeUser = publicUser(user);
    return res.status(201).json({
      message: 'User registered successfully.',
      token: generateToken(safeUser),
      user: safeUser,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'An account with this email already exists.',
        errors: { email: 'An account with this email already exists.' },
      });
    }
    return next(error);
  }
};

const loginUser = async (req, res, next) => {
  const { email, password } = req.body || {};
  const errors = {};
  if (typeof email !== 'string' || !email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(email.trim())) errors.email = 'Enter a valid email address.';
  if (typeof password !== 'string' || !password) errors.password = 'Password is required.';
  else if (Buffer.byteLength(password, 'utf8') > 72) errors.password = 'Invalid email or password.';
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please enter a valid email and password.', errors });
  }

  try {
    const user = await userRepository.findByEmail(email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account is currently inactive.' });
    }

    const safeUser = publicUser(user);
    return res.json({
      message: 'Login successful.',
      token: generateToken(safeUser),
      user: safeUser,
    });
  } catch (error) {
    return next(error);
  }
};

const getCurrentUser = async (req, res) => res.json({ user: req.user });

module.exports = { getCurrentUser, loginUser, registerUser };
