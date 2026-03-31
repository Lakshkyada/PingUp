import jwt from 'jsonwebtoken';

const auth = (req, res, next) => {
  try {
    const headerToken = req.header('Authorization')?.replace('Bearer ', '');
    const cookieToken = req.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('token='))
      ?.split('=')[1];

    const token = headerToken || cookieToken;
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

export default auth;
