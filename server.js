const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false } // Required for Aiven cloud connection
});

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

function parseCurrencyAmount(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

// 1. Setup XAMPP MySQL Pool Connection
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Default XAMPP password is empty
  database: 'techmartx_db',
  waitForConnections: true,
  connectionLimit: 10
});

// Test Database Connection
db.getConnection()
  .then(() => console.log('Connected to XAMPP MySQL Database successfully!'))
  .catch(err => console.error('MySQL connection error:', err.message));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin required.' });
  }
  next();
};

// 2. Signup Route
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, nickname, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = 'user';

    const sql = 'INSERT INTO users (email, password, full_name, role) VALUES (?, ?, ?, ?)';
    const [result] = await db.query(sql, [email.toLowerCase().trim(), hashedPassword, nickname || 'User', userRole]);

    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('❌ [MYSQL ERROR]:', err.message);
    res.status(500).json({ message: 'Database insert failed', error: err.message });
  }
});

// 3. Login Route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (users.length === 0) return res.status(400).json({ message: 'Invalid email or password.' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    res.status(200).json({
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error during login.', error: err.message });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const fullName = String(req.body.full_name || '').trim();
    if (!fullName) return res.status(400).json({ message: 'Full name is required.' });

    await db.query('UPDATE users SET full_name = ? WHERE id = ?', [fullName, req.user.id]);
    res.status(200).json({ message: 'Profile updated successfully.', full_name: fullName });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update profile.', error: err.message });
  }
});

// 4. Fetch Users
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, full_name, email, role FROM users');
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users.', error: err.message });
  }
});

// 5. Products Endpoints
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, title, category, price, COALESCE(image_url, img, "") AS img FROM products');
    res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ message: 'Server error fetching products', error: err.message });
  }
});

app.post('/api/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const title = req.body.title;
    const category = req.body.category;
    const price = req.body.price;
    const imageUrl = req.body.img || req.body.image_url || '';

    if (!title || !category || !price) {
      return res.status(400).json({ message: 'Title, category, and price are required.' });
    }

    const [result] = await db.query(
      'INSERT INTO products (title, category, price, img, image_url) VALUES (?, ?, ?, ?, ?)',
      [title, category, price, imageUrl, imageUrl]
    );
    res.status(201).json({ id: result.insertId, title, category, price, img: imageUrl });
  } catch (err) {
    console.error('Error adding product:', err.message);
    res.status(500).json({ message: 'Failed to add product to database', error: err.message });
  }
});

app.put('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, price, img } = req.body;
    const imageUrl = img || '';

    await db.query(
      'UPDATE products SET title = ?, category = ?, price = ?, img = ?, image_url = ? WHERE id = ?',
      [title, category, price, imageUrl, imageUrl, id]
    );
    res.status(200).json({ message: 'Product updated successfully' });
  } catch (err) {
    console.error('Error updating product:', err.message);
    res.status(500).json({ message: 'Failed to update product', error: err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM products WHERE id = ?', [id]);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err.message);
    res.status(500).json({ message: 'Failed to delete product', error: err.message });
  }
});

// 6. Orders Endpoints (Fully synced with phpMyAdmin columns: user_id, recipient_name, delivery_address, payment_method, total_amount, status)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const [rows] = await db.query(
      'SELECT id, recipient_name AS title, delivery_address AS address, payment_method AS method, total_amount AS amount, status FROM orders WHERE user_id = ?',
      [req.user.id]
    );
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders.', error: err.message });
  }
});

app.get('/api/orders/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const [rows] = await db.query(
      'SELECT id, recipient_name AS title, delivery_address AS address, payment_method AS method, total_amount AS amount, status FROM orders'
    );
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch all orders.', error: err.message });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { title, address, method, payment_method, amount, status } = req.body;
    
console.log('ORDER BODY:', req.body);
console.log('PAYMENT METHOD:', payment_method);
console.log('METHOD:', method);
    
    const userId = req.user.id;
    const recipientName = req.user.full_name || 'User';
    const numericAmount = parseCurrencyAmount(amount);

    const [result] = await db.query(
      'INSERT INTO orders (user_id, recipient_name, delivery_address, payment_method, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, `${recipientName} - ${title}`, address, finalPaymentMethod, numericAmount, status || 'Pending']
    );

    res.status(201).json({ message: 'Order created successfully', id: result.insertId });
  } catch (err) {
    console.error('Error creating order:', err.message);
    res.status(500).json({ message: 'Failed to create order', error: err.message });
  }
});

app.patch('/api/orders/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const allowedStatuses = ['Sold', 'Paid', 'Pending', 'Processing', 'Packed', 'Out for Delivery', 'Delivered', 'Returned', 'Cancelled'];
    const { status } = req.body;

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status.' });
    }

    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Order not found.' });

    res.status(200).json({ message: 'Order status updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order status.', error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));