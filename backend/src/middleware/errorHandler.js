function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  const status = Number.isInteger(err.statusCode) ? err.statusCode :
    (Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500);

  if (status >= 500) {
    console.error('Unhandled API error:', err.message);
  }
  return res.status(status).json({
    error: status === 500 ? 'Internal server error' : (err.message || 'Request failed')
  });
}

module.exports = { notFound, errorHandler };
