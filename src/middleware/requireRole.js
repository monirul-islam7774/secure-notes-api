import { HttpError } from '../utils/httpError.js';

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden: insufficient role');
  next();
};
