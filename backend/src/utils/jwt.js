const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set in the backend environment.');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  return secret;
}

const generateToken = (user) => jwt.sign(
  { id: user.id, role: user.role, email: user.email },
  getJwtSecret(),
  { expiresIn: '7d' },
);

const verifyToken = (token) => jwt.verify(token, getJwtSecret());

module.exports = { generateToken, getJwtSecret, verifyToken };
