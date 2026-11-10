const notificationRepository = require('../repositories/notificationRepository');
const { parsePagination } = require('../utils/pagination');

async function listNotifications(req, res, next) {
  try {
    const notifications = await notificationRepository.listForUser(req.user.id, parsePagination(req.query));
    return res.json({ notifications });
  } catch (error) {
    return next(error);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const result = await notificationRepository.markRead(req.user.id, req.params.id);
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Notification not found.' });
    return res.json({ message: result === 'ALREADY_READ' ? 'Notification was already read.' : 'Notification marked as read.' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listNotifications, markNotificationRead };
