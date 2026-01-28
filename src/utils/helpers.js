const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const paginate = (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return { offset, limit: parseInt(limit) };
};

const formatResponse = (data, meta = {}) => {
  return {
    success: true,
    data,
    meta
  };
};

const formatError = (message, code = 500) => {
  return {
    success: false,
    error: message,
    code
  };
};

module.exports = {
  generateSlug,
  paginate,
  formatResponse,
  formatError
};