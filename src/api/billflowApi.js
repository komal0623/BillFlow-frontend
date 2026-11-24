const API_BASE = "http://localhost:8080/api";

async function parseError(response, fallbackMessage) {
  const errBody = await response.json().catch(() => ({}));
  throw new Error(errBody.message || fallbackMessage);
}

export async function getAllProducts() {
  const response = await fetch(`${API_BASE}/products`);
  if (!response.ok) {
    await parseError(response, "Failed to load products.");
  }
  return response.json();
}

export async function createProduct(productPayload) {
  const response = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productPayload),
  });
  if (!response.ok) {
    await parseError(response, "Failed to create product.");
  }
  return response.json();
}

export async function updateProduct(productId, productPayload) {
  const response = await fetch(`${API_BASE}/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productPayload),
  });
  if (!response.ok) {
    await parseError(response, "Failed to update product.");
  }
  return response.json();
}

export async function deleteProduct(productId) {
  const response = await fetch(`${API_BASE}/products/${productId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await parseError(response, "Failed to delete product.");
  }
}

export async function restockProduct(productId, quantity) {
  const response = await fetch(
    `${API_BASE}/products/${productId}/restock?quantity=${encodeURIComponent(quantity)}`,
    { method: "PATCH" }
  );
  if (!response.ok) {
    await parseError(response, "Failed to restock product.");
  }
  return response.json();
}

export async function getAllOrders() {
  const response = await fetch(`${API_BASE}/orders`);
  if (!response.ok) {
    await parseError(response, "Failed to load orders.");
  }
  return response.json();
}

export async function createOrder(orderPayload) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  if (!response.ok) {
    await parseError(response, "Failed to create order.");
  }
  return response.json();
}
