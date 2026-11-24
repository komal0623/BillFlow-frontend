import { useEffect, useMemo, useState } from "react";
import {
  createOrder,
  createProduct,
  deleteProduct,
  getAllOrders,
  getAllProducts,
  restockProduct,
  updateProduct,
} from "./api/billflowApi";

const LOW_STOCK_THRESHOLD = 5;

function computeTotals(subtotal, discountAmount, gstRate) {
  const cleanSubtotal = Math.max(0, Number(subtotal || 0));
  const cleanDiscount = Math.min(cleanSubtotal, Math.max(0, Number(discountAmount || 0)));
  const taxableAmount = Math.max(0, cleanSubtotal - cleanDiscount);
  const totalGst = (taxableAmount * Number(gstRate || 0)) / 100;
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const grandTotal = taxableAmount + totalGst;

  return {
    subtotal: cleanSubtotal,
    discount: cleanDiscount,
    taxableAmount,
    cgst,
    sgst,
    grandTotal,
  };
}

// Reusable 3D tilt wrapper for dashboard cards
function TiltCard({ children, className = "", style = {} }) {
  const [tiltStyle, setTiltStyle] = useState({});

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    const rotateX = (-y * 10).toFixed(2);
    const rotateY = (x * 12).toFixed(2);

    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg)",
    });
  };

  return (
    <div
      className={`tilt-card ${className}`}
      style={{ ...style, ...tiltStyle }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [restockQty, setRestockQty] = useState({});

  // Inventory search, category filter, and product edit state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [editingProductId, setEditingProductId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");

  // New product form state
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("Stationery");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("10");

  // Multi-item order and billing state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [orderQty, setOrderQty] = useState(1);
  const [cartItems, setCartItems] = useState([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [gstRate, setGstRate] = useState(18);

  // Order history search
  const [orderSearch, setOrderSearch] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Load inventory and orders from the Spring Boot backend
  async function syncDashboardData(preferredProductId = "", preferredOrderId = null) {
    setErrorMsg("");
    try {
      const [productList, orderList] = await Promise.all([
        getAllProducts(),
        getAllOrders(),
      ]);
      const safeProducts = Array.isArray(productList) ? productList : [];
      const safeOrders = Array.isArray(orderList) ? orderList : [];
      setProducts(safeProducts);
      setOrders(safeOrders);

      if (preferredProductId) {
        setSelectedProductId(String(preferredProductId));
      } else if (safeProducts.length > 0 && !selectedProductId) {
        setSelectedProductId(String(safeProducts[0].id));
      }

      if (preferredOrderId) {
        const matched = safeOrders.find((o) => o.id === preferredOrderId);
        if (matched) setSelectedOrder(matched);
      } else if (selectedOrder) {
        const refreshed = safeOrders.find((o) => o.id === selectedOrder.id);
        setSelectedOrder(refreshed || safeOrders[safeOrders.length - 1] || null);
      } else if (safeOrders.length > 0) {
        setSelectedOrder(safeOrders[safeOrders.length - 1]);
      }
    } catch (err) {
      setErrorMsg(err.message || "Could not connect to BillFlow backend (localhost:8080).");
    }
  }

  useEffect(() => {
    syncDashboardData();
  }, []);

  const categories = useMemo(() => {
    const unique = new Set(
      products.map((p) => (p.category || "General").trim()).filter(Boolean)
    );
    return ["ALL", ...Array.from(unique)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((prod) => {
      const matchesCategory =
        selectedCategory === "ALL" ||
        (prod.category || "").toLowerCase() === selectedCategory.toLowerCase();
      const matchesQuery =
        !q ||
        (prod.name || "").toLowerCase().includes(q) ||
        (prod.category || "").toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [products, searchQuery, selectedCategory]);

  const lowStockProducts = useMemo(
    () => products.filter((p) => Number(p.stockQuantity ?? 0) <= LOW_STOCK_THRESHOLD),
    [products]
  );

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (ord) =>
        String(ord.id).toLowerCase().includes(q) ||
        (ord.customerName || "").toLowerCase().includes(q) ||
        (ord.customerPhone || "").toLowerCase().includes(q)
    );
  }, [orders, orderSearch]);

  async function handleAddProduct(e) {
    e.preventDefault();
    setErrorMsg("");
    setStatusMsg("");

    const trimmedName = productName.trim();
    const trimmedCategory = productCategory.trim();
    const numericPrice = Number(productPrice);
    const numericStock = Number(productStock);

    if (!trimmedName || !trimmedCategory) {
      setErrorMsg("Product name and category are required.");
      return;
    }
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      setErrorMsg("Price must be 0 or greater.");
      return;
    }
    if (!Number.isInteger(numericStock) || numericStock < 0) {
      setErrorMsg("Stock quantity must be a whole number (0 or greater).");
      return;
    }

    try {
      const created = await createProduct({
        name: trimmedName,
        category: trimmedCategory,
        price: numericPrice,
        stockQuantity: numericStock,
      });
      setStatusMsg(`Added product "${created?.name || trimmedName}" to inventory.`);
      setProductName("");
      setProductCategory("Stationery");
      setProductPrice("");
      setProductStock("10");
      await syncDashboardData(created?.id || "");
    } catch (err) {
      setErrorMsg(err.message || "Failed to create product.");
    }
  }

  function startEditingProduct(prod) {
    setEditingProductId(prod.id);
    setEditName(prod.name || "");
    setEditCategory(prod.category || "Stationery");
    setEditPrice(String(prod.price ?? 0));
    setEditStock(String(prod.stockQuantity ?? 0));
  }

  async function handleSaveEditProduct(productId) {
    setErrorMsg("");
    setStatusMsg("");

    const numericPrice = Number(editPrice);
    const numericStock = Number(editStock);

    if (!editName.trim() || !editCategory.trim()) {
      setErrorMsg("Edited name and category cannot be empty.");
      return;
    }
    if (Number.isNaN(numericPrice) || numericPrice < 0 || !Number.isInteger(numericStock) || numericStock < 0) {
      setErrorMsg("Enter valid non-negative price and integer stock.");
      return;
    }

    try {
      await updateProduct(productId, {
        name: editName.trim(),
        category: editCategory.trim(),
        price: numericPrice,
        stockQuantity: numericStock,
      });
      setEditingProductId(null);
      setStatusMsg(`Updated product #${productId}.`);
      await syncDashboardData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to update product (check backend PUT /api/products/{id}).");
    }
  }

  async function handleDeleteProduct(productId, name) {
    setErrorMsg("");
    setStatusMsg("");
    try {
      await deleteProduct(productId);
      setCartItems((prev) => prev.filter((item) => item.productId !== productId));
      setStatusMsg(`Deleted "${name}".`);
      await syncDashboardData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to delete product (it may be referenced by orders).");
    }
  }

  async function handleRestock(productId) {
    setErrorMsg("");
    setStatusMsg("");
    const qty = Number(restockQty[productId] || 5);
    try {
      await restockProduct(productId, qty);
      setStatusMsg(`Restocked product #${productId} by ${qty}.`);
      await syncDashboardData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to restock product.");
    }
  }

  function handleAddToCart() {
    setErrorMsg("");
    const prod = products.find((p) => String(p.id) === String(selectedProductId)) || products[0];
    const qty = Number(orderQty);

    if (!prod || Number.isNaN(qty) || qty < 1) {
      setErrorMsg("Select a valid product and quantity.");
      return;
    }
    if (qty > Number(prod.stockQuantity ?? 0)) {
      setErrorMsg(`Only ${prod.stockQuantity} units available for ${prod.name}.`);
      return;
    }

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((c) => c.productId === prod.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const nextQty = Math.min(
          Number(prod.stockQuantity ?? 0),
          updated[existingIndex].quantity + qty
        );
        updated[existingIndex] = { ...updated[existingIndex], quantity: nextQty };
        return updated;
      }
      return [
        ...prev,
        {
          productId: prod.id,
          name: prod.name,
          unitPrice: Number(prod.price || 0),
          quantity: qty,
        },
      ];
    });
    setOrderQty(1);
  }

  function handleRemoveCartItem(productId) {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  }

  const draftSubtotal = useMemo(() => {
    if (cartItems.length > 0) {
      return cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    }
    const prod = products.find((p) => String(p.id) === String(selectedProductId));
    return prod ? Number(prod.price || 0) * Number(orderQty || 0) : 0;
  }, [cartItems, products, selectedProductId, orderQty]);

  const draftTotals = useMemo(
    () => computeTotals(draftSubtotal, discountAmount, gstRate),
    [draftSubtotal, discountAmount, gstRate]
  );

  async function handleCreateOrder(e) {
    e.preventDefault();
    setErrorMsg("");
    setStatusMsg("");

    const itemsToSend =
      cartItems.length > 0
        ? cartItems.map((c) => ({ product: { id: c.productId }, quantity: c.quantity }))
        : [
            {
              product: { id: Number(selectedProductId || products[0]?.id) },
              quantity: Number(orderQty),
            },
          ];

    if (!itemsToSend[0]?.product?.id || itemsToSend[0].quantity < 1) {
      setErrorMsg("Please select at least one product and valid quantity.");
      return;
    }

    // Match OrderService expected nested product object structure
    const payload = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      items: itemsToSend,
    };

    try {
      const createdOrder = await createOrder(payload);
      const billingSnapshot = {
        ...createdOrder,
        billingMeta: { ...draftTotals, gstRate: Number(gstRate) },
      };
      setStatusMsg("Order created, stock updated, and invoice generated.");
      setCustomerName("");
      setCustomerPhone("");
      setOrderQty(1);
      setCartItems([]);
      setDiscountAmount(0);
      await syncDashboardData("", createdOrder?.id || null);
      if (createdOrder?.id) {
        setSelectedOrder((prev) => ({ ...(prev || createdOrder), billingMeta: billingSnapshot.billingMeta }));
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to create order.");
    }
  }

  function handlePrintInvoice() {
    window.print();
  }

  const invoiceItems = Array.isArray(selectedOrder?.items) ? selectedOrder.items : [];
  const invoiceSubtotal = useMemo(() => {
    if (invoiceItems.length > 0) {
      return invoiceItems.reduce((sum, line) => {
        const unit = Number(line.unitPrice ?? line.product?.price ?? 0);
        const qty = Number(line.quantity ?? 1);
        return sum + unit * qty;
      }, 0);
    }
    return Number(selectedOrder?.totalAmount ?? selectedOrder?.total ?? 0);
  }, [invoiceItems, selectedOrder]);

  const invoiceTotals = useMemo(() => {
    if (selectedOrder?.billingMeta) {
      return selectedOrder.billingMeta;
    }
    const rawTotal = Number(selectedOrder?.totalAmount ?? selectedOrder?.total ?? invoiceSubtotal);
    return {
      subtotal: invoiceSubtotal,
      discount: 0,
      taxableAmount: rawTotal,
      cgst: 0,
      sgst: 0,
      grandTotal: rawTotal,
      gstRate: 0,
    };
  }, [selectedOrder, invoiceSubtotal]);

  return (
    <main className="billflow-shell">
      <section className="hero-section no-print">
        <div>
          <span className="hero-badge">BillFlow • Billing & Inventory</span>
          <h1 className="hero-title">Smart Billing & Live Inventory</h1>
          <p className="hero-subtitle">
            Track live stock, manage products, build multi-item bills, and print invoices.
          </p>
          <button type="button" className="bf-btn" onClick={() => syncDashboardData()}>
            Refresh Backend Data
          </button>
        </div>

        {/* Text-free 3D cyber cube with glowing core and orbital rings */}
        <div className="cube-stage" aria-hidden="true">
          <div className="cube-aura" />
          <div className="tech-ring ring-outer" />
          <div className="tech-ring ring-inner" />
          <div className="rotating-cube">
            <div className="cube-core" />
            <div className="cube-face cube-front" />
            <div className="cube-face cube-back" />
            <div className="cube-face cube-right" />
            <div className="cube-face cube-left" />
            <div className="cube-face cube-top" />
            <div className="cube-face cube-bottom" />
          </div>
        </div>
      </section>

      {errorMsg && <div className="bf-alert no-print">{errorMsg}</div>}
      {statusMsg && <div className="bf-status no-print">{statusMsg}</div>}

      {lowStockProducts.length > 0 && (
        <div className="bf-alert no-print" style={{ marginBottom: "1.25rem" }}>
          <strong>Low Stock Alert ({`<= ${LOW_STOCK_THRESHOLD}`}):</strong>{" "}
          {lowStockProducts.map((p) => `${p.name} (${p.stockQuantity})`).join(", ")}
        </div>
      )}

      <section className="dashboard-grid no-print">
        <TiltCard>
          <h2>Inventory & Restock</h2>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search item or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: "160px", padding: "0.4rem" }}
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ padding: "0.4rem" }}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "ALL" ? "All Categories" : cat}
                </option>
              ))}
            </select>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="hero-subtitle">No matching products found.</p>
          ) : (
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Restock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((prod) => {
                  const isEditing = editingProductId === prod.id;
                  const isLowStock = Number(prod.stockQuantity ?? 0) <= LOW_STOCK_THRESHOLD;

                  return (
                    <tr key={prod.id}>
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ width: "100%", padding: "0.25rem" }}
                          />
                        ) : (
                          <>
                            {prod.name}{" "}
                            {isLowStock && (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "999px",
                                  background: "rgba(239, 68, 68, 0.2)",
                                }}
                              >
                                Low
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            style={{ width: "70px", padding: "0.25rem" }}
                          />
                        ) : (
                          `₹${prod.price}`
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            style={{ width: "60px", padding: "0.25rem" }}
                          />
                        ) : (
                          prod.stockQuantity
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          style={{ width: "52px", marginRight: "0.3rem" }}
                          value={restockQty[prod.id] ?? 5}
                          onChange={(e) =>
                            setRestockQty((prev) => ({
                              ...prev,
                              [prod.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="bf-btn"
                          onClick={() => handleRestock(prod.id)}
                        >
                          + Add
                        </button>
                      </td>
                      <td>
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="bf-btn"
                              style={{ marginRight: "0.3rem" }}
                              onClick={() => handleSaveEditProduct(prod.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="bf-btn"
                              onClick={() => setEditingProductId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="bf-btn"
                              style={{ marginRight: "0.3rem" }}
                              onClick={() => startEditingProduct(prod)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="bf-btn"
                              onClick={() => handleDeleteProduct(prod.id, prod.name)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TiltCard>

        <TiltCard>
          <h2>Create Multi-Item Order</h2>
          <form onSubmit={handleCreateOrder}>
            <div style={{ marginBottom: "0.7rem" }}>
              <label>
                Customer Name
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "0.7rem" }}>
              <label>
                Customer Phone
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.7rem", alignItems: "end" }}>
              <label style={{ flex: 2 }}>
                Product
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                >
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} (₹{prod.price} • Stock: {prod.stockQuantity})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ width: "78px" }}>
                Qty
                <input
                  type="number"
                  min="1"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>

              <button type="button" className="bf-btn" onClick={handleAddToCart}>
                + Item
              </button>
            </div>

            {cartItems.length > 0 && (
              <div style={{ marginBottom: "0.85rem" }}>
                <strong>Cart Items:</strong>
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                  {cartItems.map((item) => (
                    <li key={item.productId} style={{ marginBottom: "0.25rem" }}>
                      {item.name} × {item.quantity} = ₹{item.unitPrice * item.quantity}{" "}
                      <button
                        type="button"
                        className="bf-btn"
                        style={{ padding: "0.1rem 0.45rem", marginLeft: "0.35rem" }}
                        onClick={() => handleRemoveCartItem(item.productId)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.85rem" }}>
              <label style={{ flex: 1 }}>
                Discount (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.4rem" }}
                />
              </label>

              <label style={{ flex: 1 }}>
                GST Slab (%)
                <select
                  value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.4rem" }}
                >
                  <option value={0}>0% GST</option>
                  <option value={5}>5% GST</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST</option>
                </select>
              </label>
            </div>

            <div style={{ marginBottom: "0.9rem", fontSize: "0.92rem" }}>
              <div>Subtotal: ₹{draftTotals.subtotal.toFixed(2)}</div>
              <div>Discount: -₹{draftTotals.discount.toFixed(2)}</div>
              <div>
                CGST ({(Number(gstRate) / 2).toFixed(1)}%): ₹{draftTotals.cgst.toFixed(2)} | SGST (
                {(Number(gstRate) / 2).toFixed(1)}%): ₹{draftTotals.sgst.toFixed(2)}
              </div>
              <div style={{ marginTop: "0.25rem", fontSize: "1.02rem" }}>
                <strong>Estimated Grand Total: ₹{draftTotals.grandTotal.toFixed(2)}</strong>
              </div>
            </div>

            <button type="submit" className="bf-btn">
              Place Order
            </button>
          </form>
        </TiltCard>
      </section>

      <section className="dashboard-grid no-print" style={{ marginTop: "1.75rem" }}>
        <TiltCard>
          <h2>Add New Product</h2>
          <form onSubmit={handleAddProduct}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label>
                Product Name
                <input
                  type="text"
                  required
                  placeholder="e.g. Eraser"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label>
                Category
                <input
                  type="text"
                  required
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label>
                Price (₹)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label>
                Initial Stock Quantity
                <input
                  type="number"
                  min="0"
                  required
                  value={productStock}
                  onChange={(e) => setProductStock(e.target.value)}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem" }}
                />
              </label>
            </div>

            <button type="submit" className="bf-btn">
              Save Product
            </button>
          </form>
        </TiltCard>

        <TiltCard>
          <h2>Recent Orders</h2>
          <input
            type="text"
            placeholder="Search order # or customer..."
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            style={{ width: "100%", marginBottom: "0.85rem", padding: "0.4rem" }}
          />

          {filteredOrders.length === 0 ? (
            <p className="hero-subtitle">No matching orders found.</p>
          ) : (
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Bill</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => {
                  const isActive = selectedOrder?.id === ord.id;
                  return (
                    <tr
                      key={ord.id}
                      style={{
                        background: isActive ? "rgba(99, 102, 241, 0.16)" : "transparent",
                      }}
                    >
                      <td>#{ord.id}</td>
                      <td>{ord.customerName}</td>
                      <td>₹{ord.totalAmount ?? ord.total ?? "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="bf-btn"
                          onClick={() => setSelectedOrder(ord)}
                        >
                          View Bill
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TiltCard>
      </section>

      <section style={{ marginTop: "1.75rem" }}>
        <TiltCard className="print-only-invoice">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ marginBottom: "0.25rem" }}>Bill / Invoice</h2>
              <p className="hero-subtitle" style={{ margin: 0 }}>
                {selectedOrder
                  ? `Invoice #INV-${selectedOrder.id} • Customer: ${selectedOrder.customerName}`
                  : "Select an order or place a new one to generate a bill."}
              </p>
            </div>

            {selectedOrder && (
              <button
                type="button"
                className="bf-btn no-print"
                onClick={handlePrintInvoice}
              >
                Print Bill
              </button>
            )}
          </div>

          {selectedOrder && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ marginTop: 0 }}>
                <strong>Customer Name:</strong> {selectedOrder.customerName} |{" "}
                <strong>Phone:</strong> {selectedOrder.customerPhone || "-"}
              </p>

              {invoiceItems.length > 0 ? (
                <table className="bf-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Unit Price</th>
                      <th>Qty</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((line, idx) => {
                      const itemName = line.product?.name || `Item #${idx + 1}`;
                      const unitPrice = Number(line.unitPrice ?? line.product?.price ?? 0);
                      const qty = Number(line.quantity ?? 1);
                      const lineAmount = unitPrice * qty;
                      return (
                        <tr key={line.id ?? idx}>
                          <td>{itemName}</td>
                          <td>₹{unitPrice}</td>
                          <td>{qty}</td>
                          <td>₹{lineAmount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="hero-subtitle">
                  Order #{selectedOrder.id} total amount: ₹
                  {selectedOrder.totalAmount ?? selectedOrder.total ?? 0}
                </p>
              )}

              <div style={{ marginTop: "0.85rem", textAlign: "right" }}>
                <div>Subtotal: ₹{Number(invoiceTotals.subtotal || 0).toFixed(2)}</div>
                {Number(invoiceTotals.discount || 0) > 0 && (
                  <div>Discount: -₹{Number(invoiceTotals.discount).toFixed(2)}</div>
                )}
                {Number(invoiceTotals.gstRate || 0) > 0 && (
                  <div>
                    CGST + SGST ({Number(invoiceTotals.gstRate)}%): ₹
                    {(Number(invoiceTotals.cgst || 0) + Number(invoiceTotals.sgst || 0)).toFixed(2)}
                  </div>
                )}
                <p style={{ margin: "0.3rem 0 0", fontSize: "1.08rem" }}>
                  <strong>
                    Grand Total: ₹
                    {selectedOrder.billingMeta
                      ? Number(invoiceTotals.grandTotal || 0).toFixed(2)
                      : selectedOrder.totalAmount ?? selectedOrder.total ?? 0}
                  </strong>
                </p>
              </div>
            </div>
          )}
        </TiltCard>
      </section>
    </main>
  );
}
