const UsersModel = require('../models/Users');

const UsersController = {

    registerUser: (req, res) => {
        const user = req.body;
        UsersModel.addUser(user, (err) => {
            if (err) {
                req.flash('error', 'Registration failed');
                req.flash('formData', req.body);
                return res.redirect('/register');
            }

            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        });
    },

    loginUser: (req, res) => {
        const { email, password } = req.body;

        UsersModel.getAllUsers((err, users) => {
            if (err) {
                req.flash('error', 'Database error');
                return res.redirect('/login');
            }

            const user = users.find(u => u.email === email && u.password === password);

            if (!user) {
                req.flash('error', 'Invalid credentials');
                return res.redirect('/login');
            }

            req.session.user = user;

            if (user.role === 'admin') {
                return res.redirect('/inventory');
            } else {
                return res.redirect('/shopping');
            }
        });
    }
};

module.exports = UsersController;
