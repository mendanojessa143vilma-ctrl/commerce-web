// LocalStorage Initialization Safeguard
if (!localStorage.getItem('tm_v4_blue_theme_initialized')) {
  localStorage.clear();
  localStorage.setItem('tm_v4_blue_theme_initialized', 'true');
}

const API_BASE_URL = 'http://localhost:5000/api';

// Fallback Default Catalog (Including ASUS Vivobook 15)
const defaultProducts = [
  { id: 1, category: 't-shirt', title: 'T-SHIRT NA RED', price: 199.00, img: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300' },
  { id: 2, category: 't-shirt', title: 'T-SHIRT BLACK', price: 199.00, img: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=300' },
  { id: 3, category: 't-shirt', title: 'MATCHA MORNINGS', price: 199.00, img: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=300' },
  { id: 4, category: 'lanyard', title: 'TECH LANYARD BLUE', price: 29.00, img: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300' },
  { id: 5, category: 'uniform', title: 'OFFICE UNIFORM SHIRT', price: 149.00, img: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=300' },
  { id: 6, category: 'laptop', title: 'MSI KATANA 15', price: 899.00, img: 'https://pngimg.com/uploads/macbook/macbook_PNG8.png' },
  { id: 7, category: 'laptop', title: 'ASUS ZENBOOK 14', price: 1199.00, img: 'https://pngimg.com/uploads/macbook/macbook_PNG8.png' },
  { id: 8, category: 'laptop', title: 'ASUS Vivobook 15', price: 500.00, img: 'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?w=300' }
];

// Data Access Layer (Synced with Session Storage & API Fallbacks)
const db = {
  getCurrentUser: () => {
    const session = localStorage.getItem('tm_session');
    return session ? JSON.parse(session) : null;
  },
  setCurrentUser: (user) => localStorage.setItem('tm_session', JSON.stringify(user)),
  clearSession: () => {
    localStorage.removeItem('tm_session');
    localStorage.removeItem('token');
  },

  getProducts: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/products`);
      if (res.ok) {
        const products = await res.json();
        if (products && products.length > 0) return products;
      }
    } catch (err) {
      console.warn('Backend unavailable, using local catalog cache.', err);
    }
    const cached = localStorage.getItem('tm_products');
    return cached ? JSON.parse(cached) : defaultProducts;
  },

  saveProductsCache: (products) => localStorage.setItem('tm_products', JSON.stringify(products)),

  getOrders: async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/orders`, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
      });
      if (res.ok) return await res.json();
      if (res.status === 401 || res.status === 403) return [];
    } catch (err) {
      console.warn('Could not fetch MySQL orders:', err);
    }
    const localOrders = localStorage.getItem('tm_orders');
    return localOrders ? JSON.parse(localOrders) : [];
  },

  getAllOrders: async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/orders/all`, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('Could not fetch all MySQL orders:', err);
    }
    return [];
  }
};

// Global State
let cart = [];
let isSignUp = false;
let currentAuthRole = 'user';
let revenueChartInstance = null;
let categoryChartInstance = null;
let userSalesChartInstance = null;
let globalProductsCache = [];
let clientOrdersRefreshTimer = null;

// App Initialization Engine
document.addEventListener('DOMContentLoaded', async () => {
  await refreshAllProductViews();
  updateAuthUI();
  await renderTxHistory();
  await renderUserDashboardMetrics();
  loadClientAccountSettings();
  await renderClientOrders();
  updateCartUI();

  // Auto-formatting for Expiry Input (MM/YY)
  const expiryInput = document.getElementById('card-expiry');
  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '').slice(0, 4); // Keep only numbers, max 4 digits
      if (value.length > 2) {
        value = value.slice(0, 2) + '/' + value.slice(2);
      }
      e.target.value = value;
    });
  }

  const contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Thank you! Your inquiry has been sent successfully.');
      contactForm.reset();
    });
  }
});

async function refreshAllProductViews() {
  globalProductsCache = await db.getProducts();
  db.saveProductsCache(globalProductsCache);

  renderShopProducts(globalProductsCache);
  renderLaptopProducts(globalProductsCache.filter(p => p.category === 'laptop'));
  renderHomeTrending(globalProductsCache);
  await renderAdminProductTable(globalProductsCache);
}

function renderShopProducts(items) {
  const container = document.getElementById('product-list');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;">No items found.</p>';
    return;
  }

  container.innerHTML = items.map(p => `
    <div class="product-card">
      <div class="prod-img"><img src="${p.img}" alt="${p.title}" onerror="this.src='https://via.placeholder.com/150'"></div>
      <div class="prod-info"><span>${p.title}</span><span>₱${Number(p.price).toFixed(2)}</span></div>
      <div class="prod-desc">${(p.category || 'GEAR').toUpperCase()} / AUTHENTIC GEAR</div>
      <button class="btn-buy blue-btn" onclick="addToCart('${p.title.replace(/'/g, "\\'")}', ${p.price})">BUY NOW</button>
    </div>
  `).join('');
}

function renderLaptopProducts(laptops) {
  const container = document.getElementById('laptop-list');
  if (!container) return;

  container.innerHTML = laptops.map(l => `
    <div class="product-card">
      <div class="prod-img"><img src="${l.img}" alt="${l.title}" onerror="this.src='https://via.placeholder.com/150'"></div>
      <div class="prod-info"><span>${l.title}</span><span>₱${Number(l.price).toFixed(2)}</span></div>
      <div class="prod-desc">Intel Core Ultra | High Performance</div>
      <button class="btn-buy blue-btn" onclick="addToCart('${l.title.replace(/'/g, "\\'")}', ${l.price})">Buy Now</button>
    </div>
  `).join('');
}

function renderHomeTrending(products) {
  const container = document.getElementById('home-trending-grid');
  if (!container) return;

  container.innerHTML = products.slice(0, 3).map(p => `
    <div class="product-card">
      <div class="prod-img"><img src="${p.img}" alt="${p.title}" onerror="this.src='https://via.placeholder.com/150'"></div>
      <div class="prod-info"><span>${p.title}</span><span>₱${Number(p.price).toFixed(2)}</span></div>
      <div class="prod-desc">Trending catalog item</div>
      <button class="btn-buy blue-btn" onclick="addToCart('${p.title.replace(/'/g, "\\'")}', ${p.price})">BUY NOW</button>
    </div>
  `).join('');
}

// Protected Route Navigation
function switchPage(pageId) {
  const currentUser = db.getCurrentUser();

  if (pageId === 'page-admin-dash' || pageId === 'page-user-dash') {
    if (!currentUser || currentUser.role !== 'admin') {
      alert('This dashboard is available to administrators only.');
      switchPage('page-shop');
      return;
    }
  }

  if (pageId === 'page-client-account') {
    if (!currentUser || currentUser.role === 'admin') {
      switchPage(currentUser?.role === 'admin' ? 'page-admin-dash' : 'page-shop');
      return;
    }
    loadClientAccountSettings();
    renderClientOrders();
    clearInterval(clientOrdersRefreshTimer);
    clientOrdersRefreshTimer = setInterval(renderClientOrders, 15000);
  } else {
    clearInterval(clientOrdersRefreshTimer);
    clientOrdersRefreshTimer = null;
  }

  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === pageId);
  });

  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) sidebar.style.display = (pageId === 'page-contact' || pageId === 'page-admin-dash') ? 'none' : 'block';

  if (pageId === 'page-admin-dash') {
    renderCharts();
    renderAdminProductTable(globalProductsCache);
  }
  if (pageId === 'page-user-dash') {
    requestAnimationFrame(() => renderUserDashboardMetrics());
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const target = btn.getAttribute('data-target');
    if (target) switchPage(target);
  });
});

// Admin Product & Analytics Sync
async function renderAdminProductTable(products) {
  const tbody = document.getElementById('admin-product-table');
  const countEl = document.getElementById('admin-inventory-count');
  const userCountEl = document.getElementById('admin-users-count');
  const ordersCountEl = document.getElementById('admin-orders-count');

  if (countEl) countEl.innerText = products.length.toLocaleString();

  try {
    const [uRes, oRes] = await Promise.all([
      fetch(`${API_BASE_URL}/users`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
      fetch(`${API_BASE_URL}/orders/all`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
    ]);
    if (userCountEl && uRes.ok) userCountEl.innerText = (await uRes.json()).length.toLocaleString();
    if (ordersCountEl && oRes.ok) ordersCountEl.innerText = (await oRes.json()).length.toLocaleString();
  } catch (err) {
    if (userCountEl) userCountEl.innerText = '0';
    if (ordersCountEl) ordersCountEl.innerText = '0';
  }

  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No products in database.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td><img src="${p.img}" class="table-img-thumb" alt="Product" onerror="this.src='https://via.placeholder.com/40'"></td>
      <td><strong>${p.title}</strong></td>
      <td><span class="badge-pill" style="color:#1d4ed8; background:#eff6ff; margin:0;">${p.category}</span></td>
      <td>₱${Number(p.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>
        <div class="action-btn-group">
          <button class="btn-edit" onclick="editProduct(${p.id})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-delete" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openProductModal(product = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('prod-modal-title');

  if (product) {
    title.innerText = 'Edit Product';
    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-title').value = product.title;
    document.getElementById('prod-category').value = product.category;
    document.getElementById('prod-price').value = product.price;
    document.getElementById('prod-img').value = product.img;
  } else {
    title.innerText = 'Add New Product';
    document.getElementById('product-form').reset();
    document.getElementById('prod-id').value = '';
  }

  modal.classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('prod-id').value;
  const title = document.getElementById('prod-title').value.trim();
  const category = document.getElementById('prod-category').value;
  const price = parseFloat(document.getElementById('prod-price').value);
  const img = document.getElementById('prod-img').value.trim();

  const payload = { title, category, price, img };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API_BASE_URL}/products/${id}` : `${API_BASE_URL}/products`;

  try {
    const res = await fetch(url, {
      method,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Database write operation failed.');

    await refreshAllProductViews();
    closeProductModal();
  } catch (err) {
    console.error('API product sync error:', err);
    if (id) {
      globalProductsCache = globalProductsCache.map(p => p.id == id ? { id: Number(id), ...payload } : p);
    } else {
      globalProductsCache.push({ id: Date.now(), ...payload });
    }
    db.saveProductsCache(globalProductsCache);
    await refreshAllProductViews();
    closeProductModal();
  }
});

function editProduct(id) {
  const product = globalProductsCache.find(p => p.id === id);
  if (product) openProductModal(product);
}

async function deleteProduct(id) {
  if (confirm('Are you sure you want to delete this product?')) {
    try {
      await fetch(`${API_BASE_URL}/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (err) {
      console.warn('Failed to delete on MySQL backend directly:', err);
    }
    globalProductsCache = globalProductsCache.filter(p => p.id !== id);
    db.saveProductsCache(globalProductsCache);
    await refreshAllProductViews();
  }
}

// Search and Filtering
function filterCategory(cat) {
  switchPage('page-shop');
  if (cat === 'all') {
    renderShopProducts(globalProductsCache);
    return;
  }
  renderShopProducts(globalProductsCache.filter(p => p.category === cat));
}

function viewLaptops() {
  switchPage('page-shop');
  renderShopProducts(globalProductsCache.filter(p => p.category === 'laptop'));
}

function searchProducts() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const filtered = globalProductsCache.filter(p => p.title.toLowerCase().includes(query) || p.category.toLowerCase().includes(query));

  const activePage = document.querySelector('.page-view.active').id;
  if (activePage !== 'page-shop' && activePage !== 'page-collection') {
    switchPage('page-shop');
  }

  renderShopProducts(filtered);
}

// Authentication Controller & Modal Triggers
function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function setAuthRole(role) {
  currentAuthRole = role;
  document.getElementById('tab-user-role').classList.toggle('active', role === 'user');
  document.getElementById('tab-admin-role').classList.toggle('active', role === 'admin');

  const hint = document.getElementById('demo-creds-hint');
  const emailInput = document.getElementById('auth-email');
  const nameInput = document.getElementById('auth-name');

  if (role === 'admin') {
    hint.innerHTML = '<strong>Demo Admin:</strong> Email: <b>admin@techmartx.com</b> | Pass: <b>admin123</b>';
    emailInput.value = 'admin@techmartx.com';
    if (nameInput) nameInput.value = 'Admin';
  } else {
    hint.innerHTML = '<strong>Demo User:</strong> Email: <b>user@gmail.com</b> | Pass: <b>user123</b>';
    emailInput.value = 'user@gmail.com';
    if (nameInput) nameInput.value = 'Alex';
  }

  document.getElementById('auth-pass').value = '';
}

// Custom Toast Message Functions
function showNotification(message) {
  document.getElementById('toast-message').innerText = message;
  document.getElementById('toast-modal').style.display = 'flex';
}

function closeToastModal() {
  document.getElementById('toast-modal').style.display = 'none';
}

// Logout Confirmation Modal Control
function openLogoutModal() {
  document.getElementById('logout-modal').style.display = 'flex';
}

function closeLogoutModal() {
  document.getElementById('logout-modal').style.display = 'none';
}

function confirmLogout() {
  db.clearSession();
  closeLogoutModal();
  updateAuthUI();
  switchPage('page-home');
  showNotification('Logged out successfully');
}

function toggleAuthMode() {
  isSignUp = !isSignUp;
  const modalTitle = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const nameGroup = document.getElementById('auth-name-group');
  const toggleBtn = document.getElementById('auth-toggle-btn');

  if (isSignUp) {
    modalTitle.innerText = currentAuthRole === 'admin' ? 'Create Admin Account' : 'Create Customer Account';
    submitBtn.innerText = 'Sign Up';
    nameGroup.style.display = 'block';
    toggleBtn.innerText = 'Already have an account? Login';
  } else {
    modalTitle.innerText = currentAuthRole === 'admin' ? 'Admin Portal Login' : 'Customer Login';
    submitBtn.innerText = 'Login';
    nameGroup.style.display = 'none';
    toggleBtn.innerText = "Don't have an account? Sign Up";
  }
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('auth-pass');
  const toggleIcon = document.getElementById('toggle-password-btn');

  if (!passwordInput || !toggleIcon) return;

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleIcon.classList.remove('fa-eye-slash');
    toggleIcon.classList.add('fa-eye');
  } else {
    passwordInput.type = 'password';
    toggleIcon.classList.remove('fa-eye');
    toggleIcon.classList.add('fa-eye-slash');
  }
}

// Auth Form Submit Handler
document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value.trim();
  const nameInput = document.getElementById('auth-name').value.trim();
  
  const displayName = nameInput || email.split('@')[0] || 'User';

  const endpoint = isSignUp ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`;
  const payload = isSignUp 
    ? { email, password: pass, nickname: displayName, role: currentAuthRole } 
    : { email, password: pass };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      showNotification(data.message || 'Authentication failed!');
      return;
    }

    if (isSignUp) {
      closeAuthModal();
      showNotification('Account created successfully! Please log in.');
      toggleAuthMode();
      return;
    }

    localStorage.setItem('token', data.token);
    db.setCurrentUser({
      name: data.user.full_name || data.user.nickname || displayName,
      email: data.user.email,
      role: data.user.role || currentAuthRole
    });

    updateAuthUI();
    closeAuthModal();

    switchPage(data.user.role === 'admin' ? 'page-user-dash' : 'page-shop');

    showNotification('Logged in successfully');

  } catch (err) {
    console.error('Server communication error:', err);
    localStorage.setItem('token', 'local_demo_token');
    db.setCurrentUser({ name: displayName, email: email, role: currentAuthRole });
    updateAuthUI();
    closeAuthModal();
    
    showNotification('Logged in successfully');
  }
});

function updateAuthUI() {
  const user = db.getCurrentUser();
  const authBtn = document.getElementById('nav-auth-btn');
  const adminNavItem = document.getElementById('admin-nav-item');
  const dashboardNavItem = document.getElementById('dashboard-nav-item');
  const clientAccountNavItem = document.getElementById('client-account-nav-item');
  const userDashHeader = document.getElementById('dash-username');
  const userEmailDisplay = document.getElementById('user-email-display');

  if (!authBtn) return;

  if (user) {
    authBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> Logout (${user.name})`;
    authBtn.onclick = function(e) {
      e.preventDefault();
      openLogoutModal();
    };
    if (userDashHeader) userDashHeader.innerText = `Welcome back, ${user.name}`;
    if (userEmailDisplay) userEmailDisplay.innerText = user.email;
    if (adminNavItem) adminNavItem.style.display = (user.role === 'admin') ? 'block' : 'none';
    if (dashboardNavItem) dashboardNavItem.style.display = (user.role === 'admin') ? 'block' : 'none';
    if (clientAccountNavItem) clientAccountNavItem.style.display = (user.role === 'user') ? 'block' : 'none';
  } else {
    authBtn.innerHTML = 'Login / Sign Up';
    authBtn.onclick = function(e) {
      e.preventDefault();
      openAuthModal();
    };
    if (adminNavItem) adminNavItem.style.display = 'none';
    if (dashboardNavItem) dashboardNavItem.style.display = 'none';
    if (clientAccountNavItem) clientAccountNavItem.style.display = 'none';
    if (userDashHeader) userDashHeader.innerText = 'Welcome back, Guest';
    if (userEmailDisplay) userEmailDisplay.innerText = 'guest@techmartx.com';
  }
}

// Cart Mechanics
function addToCart(title, price) {
  cart.push({ title, price: Number(price) });
  updateCartUI();
  toggleCart(true);
}

function updateCartUI() {
  document.getElementById('cart-count').innerText = cart.length;
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');

  if (cart.length === 0) {
    container.innerHTML = '<p class="empty-cart-msg">Your shopping cart is empty.</p>';
    totalEl.innerText = '0.00';
    return;
  }

  let total = 0;
  container.innerHTML = cart.map((item, index) => {
    total += item.price;
    return `
      <div class="cart-item">
        <span>${item.title}</span>
        <div>
          <b>₱${item.price.toFixed(2)}</b>
          <i class="fa-solid fa-xmark" style="color:#ef4444; margin-left:8px; cursor:pointer;" onclick="removeFromCart(${index})"></i>
        </div>
      </div>
    `;
  }).join('');

  totalEl.innerText = total.toFixed(2);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartUI();
}

function toggleCart(forceState = null) {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-backdrop');

  const shouldOpen = forceState !== null ? forceState : !drawer.classList.contains('open');
  drawer.classList.toggle('open', shouldOpen);
  backdrop.classList.toggle('open', shouldOpen);
}

// Payment Mechanics
let activeGeneratedOTP = null;
let pendingOrderDetails = null;

function switchPayFields(method) {
  const gcashFields = document.getElementById('gcash-fields');
  const codFields = document.getElementById('cod-fields');
  const cardFields = document.getElementById('card-fields');
  const submitBtn = document.getElementById('checkout-submit-btn');

  if (gcashFields) gcashFields.style.display = (method === 'gcash') ? 'block' : 'none';
  if (codFields) codFields.style.display = (method === 'cod') ? 'block' : 'none';
  if (cardFields) cardFields.style.display = (method === 'card') ? 'block' : 'none';

  if (submitBtn) {
    submitBtn.innerText = (method === 'gcash') ? 'Continue to OTP' : 'Place Order';
  }
}

function openPaymentModal() {
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }

  cancelOTPStep();

  const currentUser = db.getCurrentUser();
  if (currentUser?.role === 'user') {
    const settings = getClientSettings();
    const shipName = document.getElementById('ship-name');
    const shipAddress = document.getElementById('ship-address');
    const paymentMethod = settings.payment || 'gcash';
    const paymentRadio = document.querySelector(`input[name="payMethod"][value="${paymentMethod}"]`);

    if (shipName) shipName.value = settings.addressName || settings.name || currentUser.name || '';
    if (shipAddress) shipAddress.value = settings.address || '';
    if (paymentRadio) paymentRadio.checked = true;
    switchPayFields(paymentMethod);
  }
  
  const gcashRadio = document.querySelector('input[name="payMethod"][value="gcash"]');
  if (gcashRadio && !document.querySelector('input[name="payMethod"]:checked')) {
    gcashRadio.checked = true;
    switchPayFields('gcash');
  }

  document.getElementById('payment-modal').classList.add('active');
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.remove('active');
  cancelOTPStep();
}

function cancelOTPStep() {
  activeGeneratedOTP = null;
  pendingOrderDetails = null;

  const checkoutForm = document.getElementById('checkout-form');
  const otpStep = document.getElementById('gcash-otp-step');
  const spinnerStep = document.getElementById('payment-spinner-step');
  const modalTitle = document.getElementById('payment-modal-title');

  if (checkoutForm) checkoutForm.style.display = 'block';
  if (otpStep) otpStep.style.display = 'none';
  if (spinnerStep) spinnerStep.style.display = 'none';
  if (modalTitle) modalTitle.innerText = 'Checkout Order';
}

document.getElementById('checkout-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const shipName = document.getElementById('ship-name').value.trim();
  const shipAddress = document.getElementById('ship-address').value.trim();
  const payMethod = document.querySelector('input[name="payMethod"]:checked').value;
  const totalAmount = document.getElementById('cart-total').innerText;

  const orderTitle = cart[0].title + (cart.length > 1 ? ` (+${cart.length - 1} items)` : '');
  const deliveryAddress = `${shipName}, ${shipAddress}`;

  if (payMethod === 'gcash') {
    const phoneInput = document.getElementById('gcash-phone').value.trim();
    if (!phoneInput || phoneInput.length !== 10 || isNaN(phoneInput)) {
      alert('Please enter a valid 10-digit GCash mobile number (e.g. 9171234567).');
      return;
    }

    activeGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    pendingOrderDetails = {
      title: orderTitle,
      address: deliveryAddress,
      amount: getNumericOrderAmount(totalAmount)
    };

    document.getElementById('checkout-form').style.display = 'none';
    document.getElementById('gcash-otp-step').style.display = 'block';
    document.getElementById('payment-modal-title').innerText = 'Verify GCash OTP';
    document.getElementById('display-user-phone').innerText = `+63 ${phoneInput}`;
    document.getElementById('generated-otp-display').innerText = activeGeneratedOTP;
    document.getElementById('user-otp-input').value = '';
    return;
  }

  // Credit Card Validation: Card Number (max 19 digits), Expiry (MM/YY), and CVC (3-4 digits)
  if (payMethod === 'card') {
    const cardNumInput = document.getElementById('card-number');
    const cardExpiryInput = document.getElementById('card-expiry');
    const cardCvcInput = document.getElementById('card-cvc');

    const cardNumVal = cardNumInput ? cardNumInput.value.trim() : '';
    const cardExpiryVal = cardExpiryInput ? cardExpiryInput.value.trim() : '';
    const cardCvcVal = cardCvcInput ? cardCvcInput.value.trim() : '';

    if (!cardNumVal || !/^\d+$/.test(cardNumVal) || cardNumVal.length > 19) {
      alert('Please enter a valid credit card number consisting of numbers only (maximum 19 digits).');
      return;
    }

    // Expiry Validation: Must match MM/YY format (e.g., 12/28)
    if (!cardExpiryVal || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiryVal)) {
      alert('Please enter a valid expiry date in MM/YY format.');
      return;
    }

    // CVC Validation: Must consist of 3 or 4 digits only
    if (!cardCvcVal || !/^\d{3,4}$/.test(cardCvcVal)) {
      alert('Please enter a valid 3 or 4-digit CVC code.');
      return;
    }
  }

  let methodLabel = payMethod === 'cod' ? 'Cash on Delivery' : 'Credit Card';
  let paymentStatus = payMethod === 'cod' ? 'Pending' : 'Paid';

  const spinnerTitle = document.getElementById('spinner-title');
  const spinnerDesc = document.getElementById('spinner-desc');

  if (payMethod === 'cod') {
    if (spinnerTitle) spinnerTitle.innerText = 'Processing Order...';
    if (spinnerDesc) spinnerDesc.innerText = 'Confirming your Cash on Delivery order. Please wait...';
  } else if (payMethod === 'card') {
    if (spinnerTitle) spinnerTitle.innerText = 'Processing Card Payment...';
    if (spinnerDesc) spinnerDesc.innerText = 'Authorizing credit card transaction. Please wait...';
  } else if (payMethod === 'gcash') {
    if (spinnerTitle) spinnerTitle.innerText = 'Processing Gateway Payment...';
    if (spinnerDesc) spinnerDesc.innerText = 'Communicating with GCash servers. Please wait...';
  }

  triggerPaymentProcessing({
    title: orderTitle,
    address: deliveryAddress,
    method: methodLabel,
    payment_method: methodLabel,
    amount: getNumericOrderAmount(totalAmount),
    status: paymentStatus
  });
});

document.getElementById('otp-verify-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const enteredOTP = document.getElementById('user-otp-input').value.trim();

  if (enteredOTP !== activeGeneratedOTP) {
    alert('Invalid authentication code. Please enter the generated code displayed on screen.');
    return;
  }

  const randomRefDigits = Math.floor(1000000000 + Math.random() * 9000000000);
  const gcashRefID = `GC${randomRefDigits}`;

  const spinnerTitle = document.getElementById('spinner-title');
  const spinnerDesc = document.getElementById('spinner-desc');
  if (spinnerTitle) spinnerTitle.innerText = 'Processing Gateway Payment...';
  if (spinnerDesc) spinnerDesc.innerText = 'Communicating with GCash servers. Please wait...';

  triggerPaymentProcessing({
    title: pendingOrderDetails.title,
    address: pendingOrderDetails.address,
    method: `GCash (${gcashRefID})`,
    payment_method: `GCash (${gcashRefID})`,
    amount: pendingOrderDetails.amount,
    status: 'Paid'
  });
});

// MySQL Order Creation Handler
function triggerPaymentProcessing(orderRecord) {
  document.getElementById('checkout-form').style.display = 'none';
  document.getElementById('gcash-otp-step').style.display = 'none';
  document.getElementById('payment-spinner-step').style.display = 'block';
  document.getElementById('payment-modal-title').innerText = 'Processing Order';

  setTimeout(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(orderRecord)
      });

      if (!response.ok) {
        throw new Error(`Order API returned HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('Could not save order directly to MySQL database:', err);
      const orders = JSON.parse(localStorage.getItem('tm_orders') || '[]');
      orderRecord._localId = `local-${Date.now()}`;
      orders.unshift(orderRecord);
      localStorage.setItem('tm_orders', JSON.stringify(orders));
    }

    await renderTxHistory();
    cart = [];
    updateCartUI();
    closePaymentModal();
    toggleCart(false);
    switchPage(db.getCurrentUser()?.role === 'admin' ? 'page-user-dash' : 'page-shop');
  }, 1500);
}

function getNumericOrderAmount(value) {
  if (typeof value === 'number') return Number(value) || 0;
  if (typeof value === 'string') {
    const raw = value.replace(/[^\d.-]/g, '');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getOrderAmount(order) {
  if (!order) return 0;
  const amountValue = order.amount ?? order.total_amount ?? order.totalAmount ?? order.total ?? order.price;
  return getNumericOrderAmount(amountValue);
}

function normalizeOrderStatus(status) {
  return String(status || 'Pending').trim().toLowerCase().replace(/-/g, ' ');
}

async function renderUserDashboardMetrics() {
  const totalSalesEl = document.getElementById('user-total-sales');
  const currentBalanceEl = document.getElementById('user-current-balance');
  const currentCapitalEl = document.getElementById('dash-current-capital');
  const canvas = document.getElementById('userSalesChart');

  if (!totalSalesEl && !currentBalanceEl && !currentCapitalEl && !canvas) return;

  const loadedOrders = await getDashboardOrders();
  const orders = loadedOrders.filter(Boolean);
  const products = globalProductsCache.length ? globalProductsCache : await db.getProducts();
  const currentCapital = (products || []).reduce((sum, product) => sum + getNumericOrderAmount(product.price), 0);
  const activeOrders = orders.filter(order => {
    const status = normalizeOrderStatus(order.status);
    return status !== 'cancelled' && status !== 'returned';
  });
  const revenueOrders = orders.filter(order => {
    const status = normalizeOrderStatus(order.status);
    return status === 'sold' || status === 'paid' || status === 'delivered';
  });
  const deliveredOrders = activeOrders.filter(order => normalizeOrderStatus(order.status) === 'delivered');
  const totalSales = revenueOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const currentBalance = Math.max(0, deliveredOrders.reduce((sum, order) => sum + getOrderAmount(order) * 0.72, 0));
  const lastMonthSales = Math.max(0, totalSales * 0.68);
  const statusCounts = orders.reduce((counts, order) => {
    const status = normalizeOrderStatus(order.status);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const pendingCount = (statusCounts.pending || 0) + (statusCounts.processing || 0);

  // Formatted currency fields with thousands separators and 2 decimal places
  if (totalSalesEl) totalSalesEl.innerText = `₱${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currentBalanceEl) currentBalanceEl.innerText = `₱${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currentCapitalEl) currentCapitalEl.innerText = `₱${currentCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const dashboardValues = {
    'dash-order-count': orders.length,
    'dash-pending-count': pendingCount,
    'dash-status-pending': statusCounts.pending || 0,
    'dash-status-processing': statusCounts.processing || 0,
    'dash-status-packed': statusCounts.packed || 0,
    'dash-status-out-for-delivery': statusCounts['out for delivery'] || 0,
    'dash-status-delivered': statusCounts.delivered || 0
  };

  // Formatted count fields with thousands separators
  Object.entries(dashboardValues).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.innerText = Number(value).toLocaleString();
  });

  if (canvas) {
    if (userSalesChartInstance) userSalesChartInstance.destroy();
    userSalesChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['Last Month', 'Current Sales'],
        datasets: [{
          label: 'Total Sales (₱)',
          data: [lastMonthSales, totalSales],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: {
          legend: { display: true }
        }
      }
    });
  }
}

async function getDashboardOrders() {
  const currentUser = db.getCurrentUser();
  const apiOrders = currentUser?.role === 'admin' ? await db.getAllOrders() : await db.getOrders();
  const localOrders = JSON.parse(localStorage.getItem('tm_orders') || '[]');
  const localById = new Map(localOrders.map(order => [String(order.id ?? order._localId), order]));
  const isAdmin = currentUser?.role === 'admin';
  const mergedApiOrders = (apiOrders || []).map(apiOrder => {
    const orderKey = String(apiOrder.id ?? apiOrder._localId);
    const localOrder = localById.get(orderKey);
    if (!localOrder) return apiOrder;

    return {
      ...apiOrder,
      ...localOrder,
      amount: getOrderAmount(apiOrder) > 0 ? apiOrder.amount : localOrder.amount,
      status: isAdmin ? (localOrder.status || apiOrder.status) : apiOrder.status
    };
  });
  const apiKeys = new Set(mergedApiOrders.map(order => String(order.id ?? order._localId)));
  return [...mergedApiOrders, ...localOrders.filter(order => !apiKeys.has(String(order.id ?? order._localId)))];
}

async function updateOrderStatus(orderId, newStatus) {
  const currentOrders = JSON.parse(localStorage.getItem('tm_orders') || '[]');
  const targetIndex = currentOrders.findIndex(order => String(order.id ?? order._localId) === String(orderId));

  if (targetIndex !== -1) {
    currentOrders[targetIndex].status = newStatus;
    localStorage.setItem('tm_orders', JSON.stringify(currentOrders));
  } else {
    const allOrders = await getDashboardOrders();
    const fallbackIndex = allOrders.findIndex(order => String(order.id ?? order._localId) === String(orderId));
    if (fallbackIndex !== -1) {
      allOrders[fallbackIndex].status = newStatus;
      localStorage.setItem('tm_orders', JSON.stringify(allOrders));
    }
  }

  if (!String(orderId).startsWith('local-')) {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error(`Status update failed with HTTP ${response.status}`);
    } catch (err) {
      console.warn('Could not persist order status to MySQL:', err);
    }
  }

  await renderTxHistory(currentOrderFilter);
}

let currentOrderFilter = 'all';

async function renderTxHistory(filter = 'all') {
  const tbody = document.getElementById('tx-history');
  if (!tbody) return;

  currentOrderFilter = filter;
  const orders = await getDashboardOrders();
  const filteredOrders = orders.filter(order => {
    const status = normalizeOrderStatus(order.status);
    const normalizedFilter = normalizeOrderStatus(filter);

    const lookup = {
      all: true,
      sold: status === 'sold',
      paid: status === 'paid',
      pending: status === 'pending',
      processing: status === 'processing',
      packed: status === 'packed',
      'out for delivery': status === 'out for delivery',
      delivered: status === 'delivered',
      returned: status === 'returned',
      cancelled: status === 'cancelled'
    };

    return lookup[normalizedFilter] ?? true;
  });

  if (!filteredOrders || filteredOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No matching transactions.</td></tr>';
    await renderUserDashboardMetrics();
    return;
  }

  tbody.innerHTML = filteredOrders.map((o, index) => {
    const statusValue = o.status || 'Pending';
    const orderKey = o.id ?? `${o.title}-${index}`;
    const normalizedStatus = normalizeOrderStatus(statusValue);
    const statusClass = normalizedStatus === 'delivered' ? 'delivered' :
      normalizedStatus === 'sold' ? 'sold' :
      normalizedStatus === 'paid' ? 'paid' :
      normalizedStatus === 'returned' ? 'returned' :
      normalizedStatus === 'cancelled' ? 'cancelled' :
      normalizedStatus === 'out for delivery' ? 'out-for-delivery' : '';

    return `
      <tr>
        <td>${o.title}</td>
        <td>${o.address}</td>
        <td>${o.method || o.payment_method || o.paymentMethod || o.payment || 'Cash on Delivery'}</td>
        <td>₱${getOrderAmount(o).toFixed(2)}</td>
        <td>
          <select class="status-select ${statusClass}" data-order-id="${orderKey}">
            <option value="Sold" ${statusValue === 'Sold' ? 'selected' : ''}>Sold</option>
            <option value="Paid" ${statusValue === 'Paid' ? 'selected' : ''}>Paid</option>
            <option value="Pending" ${statusValue === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Processing" ${statusValue === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="Packed" ${statusValue === 'Packed' ? 'selected' : ''}>Packed</option>
            <option value="Out for Delivery" ${statusValue === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
            <option value="Delivered" ${statusValue === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Returned" ${statusValue === 'Returned' ? 'selected' : ''}>Returned</option>
            <option value="Cancelled" ${statusValue === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async (event) => {
      const selectedValue = event.target.value;
      const orderId = event.target.getAttribute('data-order-id');
      await updateOrderStatus(orderId, selectedValue);
    });
  });

  document.querySelectorAll('.filter-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });

  await renderUserDashboardMetrics();
}

document.addEventListener('click', async (event) => {
  const filterButton = event.target.closest('.filter-btn, .status-summary-row');
  if (!filterButton) return;

  const nextFilter = filterButton.dataset.filter || 'all';
  await renderTxHistory(nextFilter);
});

// Chart Engine
function renderCharts() {
  const revCanvas = document.getElementById('revenueChart');
  const catCanvas = document.getElementById('categoryChart');

  if (revCanvas) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    revenueChartInstance = new Chart(revCanvas, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [{ label: 'Revenue ($)', data: [400, 650, 850, 1100, 1300, 1500, 1850, 2100, 2350, 2900, 3100, 3400], borderColor: '#2563eb', tension: 0.3 }]
      }
    });
  }

  if (catCanvas) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(catCanvas, {
      type: 'doughnut',
      data: {
        labels: ['T-Shirts', 'Lanyard', 'Uniform', 'Laptop Component'],
        datasets: [{ data: [25, 20, 15, 40], backgroundColor: ['#2563eb', '#27943b', '#d41626', '#e5da0d'] }]
      }
    });
  }
}

function getClientSettings() {
  const user = db.getCurrentUser();
  if (!user || user.role !== 'user') return {};

  const saved = JSON.parse(localStorage.getItem('tm_client_settings') || '{}');
  return saved[user.email] || {};
}

function saveClientSettings(settings) {
  const user = db.getCurrentUser();
  if (!user || user.role !== 'user') return;

  const saved = JSON.parse(localStorage.getItem('tm_client_settings') || '{}');
  saved[user.email] = { ...getClientSettings(), ...settings };
  localStorage.setItem('tm_client_settings', JSON.stringify(saved));
}

function loadClientAccountSettings() {
  const user = db.getCurrentUser();
  if (!user || user.role !== 'user') return;

  const settings = getClientSettings();
  const profileName = document.getElementById('client-profile-name');
  const profileEmail = document.getElementById('client-profile-email');
  const addressName = document.getElementById('client-address-name');
  const addressLine = document.getElementById('client-address-line');
  const defaultPayment = document.getElementById('client-default-payment');
  const profilePhone = document.getElementById('client-profile-phone');
  const avatarPreview = document.getElementById('client-avatar-preview');

  if (profileName) profileName.value = settings.name || user.name || '';
  if (profileEmail) profileEmail.value = user.email || '';
  if (profilePhone) profilePhone.value = settings.phone || '';
  if (addressName) addressName.value = settings.addressName || settings.name || user.name || '';
  if (addressLine) addressLine.value = settings.address || '';
  if (defaultPayment) defaultPayment.value = settings.payment || 'gcash';
  if (avatarPreview) {
    avatarPreview.innerHTML = settings.avatar
      ? `<img src="${settings.avatar}" alt="Profile photo">`
      : '<i class="fa-solid fa-user"></i>';
  }
}

async function renderClientOrders() {
  const container = document.getElementById('client-order-list');
  const user = db.getCurrentUser();
  if (!container || !user || user.role !== 'user') return;

  const orders = await db.getOrders();
  if (!orders.length) {
    container.innerHTML = '<p class="client-empty-state">You have no orders yet. Your purchases will appear here.</p>';
    return;
  }

  container.innerHTML = orders.slice().reverse().map(order => {
    const status = order.status || 'Pending';
    const statusClass = normalizeOrderStatus(status).replace(/\s+/g, '-');
    return `
      <article class="client-order-row">
        <div class="client-order-main"><strong>${order.title || 'Order'}</strong><span>${order.address || 'Address unavailable'}</span></div>
        <div class="client-order-meta"><strong>₱${getOrderAmount(order).toFixed(2)}</strong><span>${order.method || 'Payment pending'}</span></div>
        <span class="client-order-status ${statusClass}">${status}</span>
      </article>
    `;
  }).join('');
}

document.getElementById('client-profile-image')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showNotification('Please choose a JPG, PNG, or WEBP image.');
    event.target.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showNotification('Profile photo must be 2 MB or smaller.');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const preview = document.getElementById('client-avatar-preview');
    if (preview) preview.innerHTML = `<img src="${reader.result}" alt="Profile photo preview">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('client-profile-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('client-profile-name').value.trim();
  const phone = document.getElementById('client-profile-phone').value.trim();
  const existingSettings = getClientSettings();
  const avatarImage = document.querySelector('#client-avatar-preview img');
  const avatar = avatarImage?.src || existingSettings.avatar || '';
  if (!name) return;
  const user = db.getCurrentUser();
  try {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ full_name: name })
    });
    if (!response.ok) throw new Error(`Profile update failed with HTTP ${response.status}`);
  } catch (err) {
    console.warn('Could not persist profile to MySQL; keeping the local profile update.', err);
  }

  db.setCurrentUser({ ...user, name });
  saveClientSettings({ name, phone, avatar });
  updateAuthUI();
  showNotification('Profile updated successfully.');
});

document.getElementById('client-address-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  saveClientSettings({
    addressName: document.getElementById('client-address-name').value.trim(),
    address: document.getElementById('client-address-line').value.trim()
  });
  showNotification('Delivery address saved.');
});

document.getElementById('client-payment-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  saveClientSettings({ payment: document.getElementById('client-default-payment').value });
  showNotification('Payment preference saved.');
});