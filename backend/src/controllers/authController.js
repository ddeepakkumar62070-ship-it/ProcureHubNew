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
  const { name, email, password, role, businessName } = req.body;

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150
      || !isValidEmail(email) || typeof password !== 'string'
      || Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72
      || (businessName !== undefined && (typeof businessName !== 'string'
        || !businessName.trim() || businessName.trim().length > 200))) {
    return res.status(400).json({
      message: 'Provide a name up to 150 characters, a valid email, a password of 8 to 72 bytes, and an optional business name up to 200 characters.',
    });
  }
  if (!['BUYER', 'SUPPLIER'].includes(role)) {
    return res.status(400).json({ message: 'Public registration is limited to BUYER and SUPPLIER accounts.' });
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
      return res.status(409).json({ message: 'User already exists.' });
    }
    return next(error);
  }
};

const loginUser = async (req, res, next) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || typeof password !== 'string' || !password
      || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'A valid email and password are required.' });
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
