import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Download, ChevronDown, ChevronUp, Loader2, Printer } from 'lucide-react';
import { auth } from '../firebase';
import './AdminOrders.css';
import AdminNavbar from './AdminNavbar';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalOrders: 0
  });
  const [authChecked, setAuthChecked] = useState(false);
  const navigate = useNavigate();

  const dateOptions = [
    { value: 'all', label: 'All Dates' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  useEffect(() => {
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    setAuthChecked(true);
    if (user) {
      try {
        const idToken = await user.getIdToken(true);
        console.log('Firebase user UID:', user.uid, 'Token:', idToken.slice(0, 10) + '...');
        const response = await fetch('http://localhost:5000/api/verify-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ token: idToken })
        });
        const data = await response.json();
        console.log('Verify token response:', data);
        if (!response.ok || !data.valid || !data.user.isAdmin) {
          console.warn('Admin check failed:', { valid: data.valid, isAdmin: data.user?.isAdmin, responseStatus: response.status });
          alert(`Access denied: ${data.message || 'You must be an admin to access this page.'}`);
          navigate('/login');
          return;
        }
        fetchOrders();
      } catch (error) {
        console.error('Error verifying admin status:', error);
        alert('Failed to verify admin status: ' + error.message);
        navigate('/login');
      }
    } else {
      console.warn('No Firebase user found');
      setLoading(false);
      setOrders([]);
      setFilteredOrders([]);
      navigate('/login');
    }
  });

  return () => unsubscribe();
}, []);

const fetchOrders = async () => {
  try {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) {
      console.warn('No user for fetchOrders');
      throw new Error('User not authenticated');
    }

    const idToken = await user.getIdToken(true);
    let url = `http://localhost:5000/api/orders?page=${pagination.page}&limit=${pagination.limit}&all=true`;
    
    if (statusFilter !== 'all') {
      url += `&status=${statusFilter}`;
    }
    
    console.log('Fetching orders with URL:', url);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    const data = await response.json();
    console.log('Fetch orders response:', data);
    if (response.ok) {
      setOrders(data.orders);
      setFilteredOrders(data.orders);
      setPagination(prev => ({
        ...prev,
        totalPages: data.pagination.totalPages,
        totalOrders: data.pagination.totalOrders
      }));
    } else {
      console.error('Fetch orders failed:', data);
      throw new Error(data.error || 'Failed to fetch orders');
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    alert(`Failed to fetch orders: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    let result = [...orders];

    if (searchTerm) {
      result = result.filter(order => 
        (order.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.paymentDetails?.trackingNumber && 
         order.paymentDetails.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    const now = new Date();
    if (dateFilter === 'today') {
      const today = new Date(now.setHours(0, 0, 0, 0));
      result = result.filter(order => new Date(order.createdAt) >= today);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7));
      result = result.filter(order => new Date(order.createdAt) >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
      result = result.filter(order => new Date(order.createdAt) >= monthAgo);
    }

    setFilteredOrders(result);
  }, [searchTerm, dateFilter, orders]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const idToken = await user.getIdToken();
      const response = await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrders(orders.map(order => 
          order._id === orderId ? updatedOrder.order : order
        ));
        fetchOrders();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExpand = (orderId) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({
      ...prev,
      page: newPage
    }));
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending': return 'orange';
      case 'processing': return 'blue';
      case 'shipped': return 'purple';
      case 'delivered': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  if (!authChecked || (loading && orders.length === 0)) {
    return (
      <div className="admin-loading">
        <Loader2 className="spin" size={48} />
        <p>Loading orders...</p>
      </div>
    );
  }

  return (
    <div>
      <AdminNavbar />
      <div className="admin-orders-container">
        <h1>Order Management</h1>
        
        <div className="orders-controls">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search orders by name, email, phone, ID or tracking..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <div className="filter-select">
              <Filter size={16} />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-select">
              <Filter size={16} />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                {dateOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button className="export-btn" onClick={fetchOrders}>
              <Download size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="orders-summary-cards">
          <div className="summary-card">
            <h3>Total Orders</h3>
            <p>{pagination.totalOrders}</p>
          </div>
          <div className="summary-card">
            <h3>Pending</h3>
            <p>{orders.filter(o => o.status === 'pending').length}</p>
          </div>
          <div className="summary-card">
            <h3>Processing</h3>
            <p>{orders.filter(o => o.status === 'processing').length}</p>
          </div>
          <div className="summary-card">
            <h3>Completed</h3>
            <p>{orders.filter(o => o.status === 'delivered').length}</p>
          </div>
        </div>

        <div className="orders-table">
          <div className="table-header">
            <div className="header-cell">Order ID</div>
            <div className="header-cell">Customer</div>
            <div className="header-cell">Date</div>
            <div className="header-cell">Amount</div>
            <div className="header-cell">Status</div>
            <div className="header-cell">Payment</div>
            <div className="header-cell">Actions</div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="no-orders">
              <p>No orders found matching your criteria</p>
              <button onClick={fetchOrders} className="refresh-btn">
                Refresh Orders
              </button>
            </div>
          ) : (
            filteredOrders.map(order => (
              <div key={order._id} className="order-row">
                <div className="order-main" onClick={() => toggleOrderExpand(order._id)}>
                  <div className="order-cell">
                    <span className="mobile-label">Order ID:</span>
                    <span className="order-id">#{order._id.slice(-8).toUpperCase()}</span>
                  </div>
                  <div className="order-cell">
                    <span className="mobile-label">Customer:</span>
                    <div className="customer-info">
                      <p className="customer-name">{order.userId.name || order.name || 'Unknown'}</p>
                      <p className="customer-email">{order.userId.email || order.email || order.phone || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="order-cell">
                    <span className="mobile-label">Date:</span>
                    {formatDate(order.createdAt)}
                  </div>
                  <div className="order-cell">
                    <span className="mobile-label">Amount:</span>
                    {formatCurrency(order.total)}
                  </div>
                  <div className="order-cell">
                    <span className="mobile-label">Status:</span>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(order.status) }}
                    >
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                  <div className="order-cell">
                    <span className="mobile-label">Payment:</span>
                    <span className="payment-method">
                      {order.paymentMethod.toUpperCase()}
                    </span>
                  </div>
                  <div className="order-cell actions">
                    {expandedOrder === order._id ? <ChevronUp /> : <ChevronDown />}
                  </div>
                </div>

                {expandedOrder === order._id && (
                  <div className="order-details">
                    <div className="details-section">
                      <h4>Order Items</h4>
                      <div className="order-items">
                        {order.items.map((item, index) => (
                          <div key={index} className="order-item">
                            <img src={item.image} alt={item.name} className="item-image" />
                            <div className="item-info">
                              <p className="item-name">{item.name}</p>
                              <p className="item-quantity">Qty: {item.quantity}</p>
                              <p className="item-price">{formatCurrency(item.price)} each</p>
                            </div>
                            <div className="item-total">
                              {formatCurrency(item.price * item.quantity)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="details-section">
                      <h4>Shipping Information</h4>
                      <div className="shipping-info">
                        <p><strong>Address:</strong> {order.address}, {order.city}, {order.state} - {order.zip}</p>
                        <p><strong>Phone:</strong> {order.phone}</p>
                        <p><strong>Email:</strong> {order.email || 'N/A'}</p>
                        {order.shippedAt && <p><strong>Shipped On:</strong> {formatDate(order.shippedAt)}</p>}
                        {order.deliveredAt && <p><strong>Delivered On:</strong> {formatDate(order.deliveredAt)}</p>}
                      </div>
                    </div>

                    <div className="details-section">
                      <h4>Order Status</h4>
                      <div className="status-controls">
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order._id, e.target.value)}
                          disabled={loading}
                        >
                          {statusOptions.filter(opt => opt.value !== 'all').map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button 
                          className="print-btn"
                          onClick={() => window.print()}
                        >
                          <Printer size={16} /> Print Invoice
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="pagination-controls">
          <button 
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1 || loading}
          >
            Previous
          </button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button 
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages || loading}
          >
            Next
          </button>
          <select
            value={pagination.limit}
            onChange={(e) => {
              setPagination(prev => ({
                ...prev,
                limit: parseInt(e.target.value),
                page: 1
              }));
            }}
            disabled={loading}
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;