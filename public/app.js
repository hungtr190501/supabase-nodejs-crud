let supabaseClient = null;
let allCategories = [];
let allServices = [];
let selectedServices = [];

// DOM Elements
const categoryTabs = document.getElementById('categoryTabs');
const servicesGrid = document.getElementById('servicesGrid');
const selectedItemsBox = document.getElementById('selectedItemsBox');
const bookingForm = document.getElementById('bookingForm');
const formStatus = document.getElementById('formStatus');
const mobileToggle = document.getElementById('mobileToggle');
const navBar = document.getElementById('navBar');

// Formatting helper for currency (VND)
function formatVND(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

// UUID Generator for safe client-side ID assignment without RLS SELECT policy requirements
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Fallback images if storage link is empty
const fallbackImages = {
  'gia-tien': 'https://images.unsplash.com/photo-1549417229-aa67d3263c09?auto=format&fit=crop&q=80&w=600',
  'rap-cuoi': 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600',
  'mam-trap': 'https://images.unsplash.com/photo-1520854221256-174b1ec358ef?auto=format&fit=crop&q=80&w=600',
  'xe-hoa': 'https://images.unsplash.com/photo-1511527661048-7fe73d85e9a4?auto=format&fit=crop&q=80&w=600'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupNavbar();
  
  try {
    // 1. Fetch public Supabase configuration from Express server
    const configRes = await fetch('/api/config');
    const config = await configRes.json();
    
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      showError('Lỗi cấu hình: Thiếu thông tin kết nối Supabase.');
      return;
    }
    
    // 2. Initialize Supabase client
    supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    
    // 3. Load catalog data
    await loadCatalog();
  } catch (err) {
    console.error('Initialization failed:', err);
    showError('Không thể kết nối đến cơ sở dữ liệu. Vui lòng kiểm tra môi trường hoặc thử lại.');
  }
});

// Mobile navbar toggle
function setupNavbar() {
  mobileToggle.addEventListener('click', () => {
    navBar.classList.toggle('show');
    const icon = mobileToggle.querySelector('i');
    if (navBar.classList.contains('show')) {
      icon.className = 'fa-solid fa-xmark';
    } else {
      icon.className = 'fa-solid fa-bars';
    }
  });

  // Close menu when clicking nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      // Set active state
      document.querySelectorAll('.nav-link').forEach(nl => nl.classList.remove('active'));
      link.classList.add('active');
      
      navBar.classList.remove('show');
      mobileToggle.querySelector('i').className = 'fa-solid fa-bars';
    });
  });
}

// Load categories & services from Supabase
async function loadCatalog() {
  // Fetch categories
  const { data: categories, error: catErr } = await supabaseClient
    .from('yn_categories')
    .select('*')
    .order('name');
    
  if (catErr) throw catErr;
  allCategories = categories || [];
  
  // Fetch services
  const { data: services, error: servErr } = await supabaseClient
    .from('yn_services')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('price');
    
  if (servErr) throw servErr;
  allServices = services || [];

  // Render elements
  renderCategoryTabs();
  renderServices('all');
}

// Render dynamic filter tabs
function renderCategoryTabs() {
  let html = `<button class="tab-btn active" data-category="all">Tất cả</button>`;
  
  allCategories.forEach(cat => {
    html += `<button class="tab-btn" data-category="${cat.id}">${cat.name}</button>`;
  });
  
  categoryTabs.innerHTML = html;

  // Add click handlers
  categoryTabs.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const catId = btn.getAttribute('data-category');
      renderServices(catId);
    });
  });
}

// Render service cards based on category filter
function renderServices(categoryId) {
  const filtered = categoryId === 'all' 
    ? allServices 
    : allServices.filter(s => s.category_id === categoryId);

  if (filtered.length === 0) {
    servicesGrid.innerHTML = `
      <div class="loading-spinner" style="grid-column: 1/-1;">
        <i class="fa-solid fa-circle-info"></i> Không tìm thấy dịch vụ nào thuộc danh mục này.
      </div>`;
    return;
  }

  let html = '';
  filtered.forEach(service => {
    const isSelected = selectedServices.some(s => s.id === service.id);
    const category = allCategories.find(c => c.id === service.category_id);
    const slug = category ? category.slug : 'gia-tien';
    
    // Choose image: database field or fallback
    const imgUrl = service.image_url || fallbackImages[slug] || fallbackImages['gia-tien'];
    
    // Create feature list items
    const featuresHtml = (service.features || [])
      .map(f => `<li><i class="fa-solid fa-check"></i> ${f}</li>`)
      .join('');

    html += `
      <div class="service-card" data-id="${service.id}">
        ${service.is_featured ? `<span class="service-badge">Phổ Biến</span>` : ''}
        <div class="service-img-wrapper">
          <img class="service-img" src="${imgUrl}" alt="${service.name}" onerror="this.onerror=null; this.src='${fallbackImages[slug]}';">
        </div>
        <div class="service-body">
          <h3 class="service-name">${service.name}</h3>
          <div class="service-price-tag">
            ${formatVND(service.price)} <span class="service-unit">/ ${service.unit}</span>
          </div>
          <p class="service-desc">${service.description || 'Chưa có mô tả chi tiết cho gói này.'}</p>
          <ul class="service-features-list">
            ${featuresHtml}
          </ul>
          <button class="btn btn-select btn-block ${isSelected ? 'selected' : ''}" onclick="toggleSelectService('${service.id}')">
            <i class="fa-solid ${isSelected ? 'fa-square-check' : 'fa-circle-plus'}"></i> 
            ${isSelected ? 'Đã Chọn Gói' : 'Chọn Dịch Vụ này'}
          </button>
        </div>
      </div>
    `;
  });

  servicesGrid.innerHTML = html;
}

// Select/Deselect service item toggle
window.toggleSelectService = function(serviceId) {
  const service = allServices.find(s => s.id === serviceId);
  if (!service) return;

  const index = selectedServices.findIndex(s => s.id === serviceId);
  if (index > -1) {
    // Remove
    selectedServices.splice(index, 1);
  } else {
    // Add
    selectedServices.push(service);
  }

  // Refresh lists
  updateSelectedServicesUI();
  
  // Re-render services grid to update button states without layout resets
  const activeTab = categoryTabs.querySelector('.tab-btn.active');
  const activeCatId = activeTab ? activeTab.getAttribute('data-category') : 'all';
  renderServices(activeCatId);
};

// Update selection display inside the booking form
function updateSelectedServicesUI() {
  if (selectedServices.length === 0) {
    selectedItemsBox.innerHTML = `Chưa chọn dịch vụ nào. Hãy click "Thêm vào danh sách" trên các thẻ dịch vụ ở trên!`;
    return;
  }

  let total = 0;
  let html = `<div style="display: flex; flex-wrap: wrap;">`;
  
  selectedServices.forEach(service => {
    total += Number(service.price);
    html += `
      <span class="selected-item-tag">
        ${service.name} (${formatVND(service.price)})
        <i class="fa-solid fa-circle-xmark" onclick="toggleSelectService('${service.id}')"></i>
      </span>`;
  });
  
  html += `</div>`;
  html += `
    <div class="total-estimate-box">
      <span>Tổng Chi Phí Ước Tính:</span>
      <span>${formatVND(total)}</span>
    </div>`;

  selectedItemsBox.innerHTML = html;
}

// Form Submission handling
bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!supabaseClient) {
    showFormError('Kết nối cơ sở dữ liệu chưa sẵn sàng. Vui lòng tải lại trang.');
    return;
  }

  if (selectedServices.length === 0) {
    showFormError('Vui lòng chọn ít nhất một dịch vụ/gói thuê trước khi gửi.');
    return;
  }

  // Get values
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const email = document.getElementById('custEmail').value.trim();
  const date = document.getElementById('eventDate').value;
  const address = document.getElementById('eventAddress').value.trim();
  const notes = document.getElementById('bookingNotes').value.trim();

  // Button state
  const submitBtn = document.getElementById('submitBtn');
  const origBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi yêu cầu...`;

  try {
    const bookingId = generateUUID();

    // 1. Insert into yn_bookings
    const { error: bookErr } = await supabaseClient
      .from('yn_bookings')
      .insert([
        {
          id: bookingId,
          customer_name: name,
          customer_phone: phone,
          customer_email: email || null,
          event_date: date,
          event_address: address,
          notes: notes || null
        }
      ]);

    if (bookErr) throw bookErr;

    // 2. Insert line items
    const lineItems = selectedServices.map(s => ({
      booking_id: bookingId,
      service_id: s.id,
      quantity: 1,
      notes: null
    }));

    const { error: itemErr } = await supabaseClient
      .from('yn_booking_items')
      .insert(lineItems);

    if (itemErr) throw itemErr;

    // Success styling
    showFormSuccess('Gửi yêu cầu thành công! Chúng tôi sẽ liên hệ Zalo/Hotline của bạn sớm nhất.');
    
    // Clear selections & reset form
    selectedServices = [];
    updateSelectedServicesUI();
    bookingForm.reset();
    
    // Refresh catalog grids
    renderServices('all');
    const allTab = categoryTabs.querySelector('[data-category="all"]');
    if (allTab) {
      categoryTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      allTab.classList.add('active');
    }
  } catch (err) {
    console.error('Submit booking failed:', err);
    showFormError('Lỗi lưu trữ: Không thể gửi yêu cầu của bạn. Chi tiết: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origBtnText;
  }
});

// UI Messages Helpers
function showError(message) {
  servicesGrid.innerHTML = `
    <div class="loading-spinner" style="color: var(--primary); font-weight: 600; grid-column: 1/-1;">
      <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
      ${message}
    </div>`;
}

function showFormError(message) {
  formStatus.textContent = message;
  formStatus.className = 'form-status error';
  formStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showFormSuccess(message) {
  formStatus.textContent = message;
  formStatus.className = 'form-status success';
  formStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
