function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'Admin access required.');
  return res.redirect('/login');
}

// Makes current user available in all views without repeating code
function attachUser(req, res, next) {
  res.locals.currentUser = (req.session && req.session.user) || null;
  next();
}

module.exports = { isLoggedIn, isAdmin, attachUser };
