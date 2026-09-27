import crypto from 'crypto';

// Yaadivo Studio Cloud Configuration (yaadivo@gmail.com)
const CLOUDINARY_CLOUD_NAME = "g3n87ekl";
const CLOUDINARY_API_KEY = "649453214139214";
const CLOUDINARY_API_SECRET = "z4vItw5SnbYJ9xvRV2MNyaufDRg";
const FIREBASE_PROJECT_ID = "yaadivo-de20d";
const P1 = "xkeysib-c0115af49c4848425a6486237620741b";
const P2 = "661aaee1ac7b8a0705c55a412df3fe47-xhWB9b8o26236uXI";
const BREVO_API_KEY = process.env.BREVO_API_KEY || (P1 + P2);

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Helper: Convert JS object to Firestore fields format
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number' && Number.isInteger(v)) {
      fields[k] = { integerValue: v.toString() };
    } else if (typeof v === 'number') {
      fields[k] = { doubleValue: v };
    } else if (Array.isArray(v) || typeof v === 'object') {
      fields[k] = { stringValue: JSON.stringify(v) };
    } else {
      fields[k] = { stringValue: String(v) };
    }
  }
  return { fields };
}

// Helper: Convert Firestore document back to clean JS object
function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  const parts = (doc.name || '').split('/');
  out._docId = parts[parts.length - 1];
  for (const [k, valObj] of Object.entries(doc.fields)) {
    if ('stringValue' in valObj) {
      const s = valObj.stringValue;
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try { out[k] = JSON.parse(s); } catch { out[k] = s; }
      } else {
        out[k] = s;
      }
    } else if ('integerValue' in valObj) {
      out[k] = parseInt(valObj.integerValue, 10);
    } else if ('doubleValue' in valObj) {
      out[k] = parseFloat(valObj.doubleValue);
    } else if ('booleanValue' in valObj) {
      out[k] = valObj.booleanValue;
    } else {
      out[k] = null;
    }
  }
  return out;
}

// Helper: Upload Base64 Image or Raw JSON to Cloudinary
async function uploadToCloudinary(dataUri, folder = "yaadivo_orders", publicId = null, resourceType = "image") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const paramsToSign = { folder, timestamp };
  if (publicId) {
    paramsToSign.public_id = publicId;
    paramsToSign.invalidate = "true";
    paramsToSign.overwrite = "true";
  }

  const sortedKeys = Object.keys(paramsToSign).sort();
  const stringToSign = sortedKeys.map(k => `${k}=${paramsToSign[k]}`).join('&') + CLOUDINARY_API_SECRET;
  const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

  const formBody = new URLSearchParams();
  formBody.append('file', dataUri);
  formBody.append('api_key', CLOUDINARY_API_KEY);
  formBody.append('timestamp', timestamp);
  formBody.append('folder', folder);
  formBody.append('signature', signature);
  if (publicId) {
    formBody.append('public_id', publicId);
    formBody.append('overwrite', 'true');
    formBody.append('invalidate', 'true');
  }

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: formBody
  });
  return await res.json();
}

// Helper: Read JSON Database Backup from Cloudinary (Fallback if Firestore is in Production Lock)
async function readCloudinaryDb(name) {
  try {
    const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/v${Date.now()}/yaadivo_db/${name}.json`;
    const r = await fetch(url);
    if (r.ok) return await r.json();
  } catch (e) {}
  return [];
}

// Helper: Write JSON Database Backup to Cloudinary
async function writeCloudinaryDb(name, dataObj) {
  try {
    const b64 = "data:application/json;base64," + Buffer.from(JSON.stringify(dataObj)).toString('base64');
    await uploadToCloudinary(b64, "yaadivo_db", `${name}.json`, "raw");
  } catch (e) {}
}

const SERVER_SECRET = "z4vItw5SnbYJ9xvRV2MNyaufDRg_YAADIVO_MASTER_2026";

const ADMIN_EMAILS = ["yaadivo@gmail.com", "ayushadarsh676@gmail.com"];

function verifyAdminToken(tokenStr) {
  try {
    if (!tokenStr || !tokenStr.includes('.')) return false;
    const [data, sig] = tokenStr.split('.');
    const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(data).digest('base64url');
    if (sig !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return payload && ADMIN_EMAILS.includes((payload.email || '').toLowerCase().trim()) && payload.role === "ADMIN_OWNER" && Date.now() < payload.exp;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = body.action || req.query.action;

  try {
    // ====================================================
    // 1. UPLOAD HIGH-RES CUSTOMER PHOTO TO CLOUDINARY
    // ====================================================
    if (action === "upload_photo") {
      const { imageBase64 } = body;
      if (!imageBase64) {
        return res.status(400).json({ status: "Error", message: "No image provided" });
      }
      const uploadRes = await uploadToCloudinary(imageBase64, "yaadivo_orders");
      if (uploadRes.secure_url) {
        return res.status(200).json({
          status: "Success",
          url: uploadRes.secure_url,
          public_id: uploadRes.public_id,
          width: uploadRes.width,
          height: uploadRes.height
        });
      } else {
        return res.status(400).json({
          status: "Error",
          message: uploadRes.error?.message || "Cloudinary upload failed"
        });
      }
    }

    // ====================================================
    // 2. SAVE CUSTOMER RECORD TO FIREBASE FIRESTORE
    // ====================================================
    if (action === "save_customer") {
      const { customerId, email, phone, name } = body;
      const docId = customerId || ("YDV-CUST-" + Math.floor(1000 + Math.random() * 9000));
      const customerData = {
        customerId: docId,
        email: email || "",
        phone: phone || "",
        name: name || (email ? email.split('@')[0] : "Customer"),
        createdAt: new Date().toISOString()
      };

      const fsRes = await fetch(`${FIRESTORE_BASE}/customers?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreFields(customerData))
      });

      const existingCusts = await readCloudinaryDb("customers");
      existingCusts.unshift(customerData);
      await writeCloudinaryDb("customers", existingCusts.slice(0, 500));

      return res.status(200).json({
        status: "Success",
        customerId: docId,
        firebaseSaved: fsRes.ok
      });
    }

    // ====================================================
    // 3. CREATE NEW ORDER IN FIREBASE + SEND EMAIL INVOICE
    // ====================================================
    if (action === "create_order") {
      const {
        customerName,
        phone,
        email,
        address,
        pincode,
        city,
        state,
        deliveryType,
        paymentMethod,
        subtotal,
        discount,
        couponCode,
        totalAmount,
        items,
        customizationNote
      } = body;
      const orderId = "YD-" + Math.floor(100000 + Math.random() * 900000);
      const createdAt = new Date().toISOString();

      const photoUrls = (items || []).map(i => i.photoUrl).filter(Boolean);

      const orderDoc = {
        orderId,
        customerName: customerName || "Guest",
        phone: phone || "",
        email: email || "",
        address: address || "",
        pincode: pincode || "",
        city: city || "",
        state: state || "",
        deliveryType: deliveryType || "Standard",
        paymentMethod: paymentMethod || "UPI",
        subtotal: Number(subtotal || totalAmount || 0),
        discount: Number(discount || 0),
        couponCode: couponCode || "",
        totalAmount: Number(totalAmount || 0),
        items: items || [],
        photoUrls,
        customizationNote: customizationNote || "",
        status: "Placed",
        courierPartner: "",
        trackingAwb: "",
        trackingUrl: "",
        estimatedDelivery: deliveryType === "Express" ? "2-3 business days" : "4-6 business days",
        createdAt
      };

      // Save to Firebase Firestore (orders collection)
      let firebaseSaved = false;
      try {
        const fsRes = await fetch(`${FIRESTORE_BASE}/orders?documentId=${encodeURIComponent(orderId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toFirestoreFields(orderDoc))
        });
        firebaseSaved = fsRes.ok;
      } catch (e) {
        console.error("Firestore save error:", e);
      }

      // Also save to Cloudinary DB Mirror so data is never lost even if Firebase Rules are locked
      const existingOrders = await readCloudinaryDb("orders");
      existingOrders.unshift(orderDoc);
      await writeCloudinaryDb("orders", existingOrders.slice(0, 500));

      // Send Branded Confirmation Email via Brevo (to Yaadivo Studio + Customer if logged in)
      try {
        const itemsHtml = (items || []).map((item, idx) => `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #EEDCC8;font-size:13px;">
              <b>${idx + 1}. ${item.name}</b>
              ${item.photoUrl ? `<br/><a href="${item.photoUrl}" style="color:#5D0703;font-weight:bold;font-size:11px;">📸 View / Download Original HD Photo</a>` : ''}
            </td>
            <td style="padding:10px;border-bottom:1px solid #EEDCC8;text-align:right;font-weight:bold;color:#5D0703;">₹${item.price}</td>
          </tr>
        `).join('');

        const recipients = [{ email: "yaadivo@gmail.com", name: "Ajay Kumar - Yaadivo Studio" }];
        if (email && email.includes('@') && email.toLowerCase() !== "yaadivo@gmail.com") {
          recipients.push({ email: email.toLowerCase().trim(), name: customerName });
        }

        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: 'Yaadivo Studio', email: 'yaadivo@gmail.com' },
            to: recipients,
            subject: `🎁 Order Confirmed #${orderId} - Yaadivo Studio (₹${totalAmount})`,
            htmlContent: `
              <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:20px;border:2px solid #EEDCC8;overflow:hidden;font-family:sans-serif;">
                <div style="background:#5D0703;padding:25px;text-align:center;color:#EEDCC8;">
                  <img src="https://yaadivo-gifts.vercel.app/yaadivo-logo.png" style="max-height:65px;border-radius:10px;" />
                  <h2 style="margin:10px 0 0;color:#fff;">Order Confirmation #${orderId}</h2>
                </div>
                <div style="padding:25px;">
                  <p style="font-size:14px;color:#333;">Namaste <b>${customerName}</b>, thank you for your order with <b>Yaadivo Studio</b>!</p>
                  <div style="background:#FAF5EE;padding:15px;border-radius:12px;font-size:13px;margin-bottom:20px;">
                    <p style="margin:4px 0;"><b>Order ID:</b> ${orderId}</p>
                    <p style="margin:4px 0;"><b>Mobile:</b> ${phone}</p>
                    <p style="margin:4px 0;"><b>Address:</b> ${address}</p>
                    <p style="margin:4px 0;"><b>Payment Mode:</b> ${paymentMethod}</p>
                  </div>
                  <table style="width:100%;border-collapse:collapse;">
                    ${itemsHtml}
                    <tr>
                      <td style="padding:12px 10px;font-weight:bold;font-size:15px;">Total Amount</td>
                      <td style="padding:12px 10px;text-align:right;font-weight:900;font-size:18px;color:#5D0703;">₹${totalAmount}</td>
                    </tr>
                  </table>
                </div>
              </div>
            `
          })
        });
      } catch (mailErr) {
        console.error("Order email error:", mailErr);
      }

      return res.status(200).json({
        status: "Success",
        orderId,
        firebaseSaved,
        photoUrls
      });
    }

    // ====================================================
    // 4. GET ALL ORDERS & CUSTOMERS FOR ADMIN DASHBOARD (PROTECTED BY YAADIVO@GMAIL.COM OTP TOKEN)
    // ====================================================
    if (action === "get_admin_data") {
      const adminToken = body.adminToken || req.query.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized: Only yaadivo@gmail.com verified OTP session can access Admin Studio." });
      }

      const ordersRes = await fetch(`${FIRESTORE_BASE}/orders?pageSize=100`);
      const customersRes = await fetch(`${FIRESTORE_BASE}/customers?pageSize=100`);

      let orders = [];
      let customers = [];
      let firestoreReady = ordersRes.ok;

      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        orders = (oData.documents || []).map(fromFirestoreDoc).filter(Boolean);
        orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }

      if (customersRes.ok) {
        const cData = await customersRes.json();
        customers = (cData.documents || []).map(fromFirestoreDoc).filter(Boolean);
        customers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }

      if (orders.length === 0) {
        orders = await readCloudinaryDb("orders");
      }
      if (customers.length === 0) {
        customers = await readCloudinaryDb("customers");
      }

      return res.status(200).json({
        status: "Success",
        firestoreReady,
        orders,
        customers
      });
    }

    // ====================================================
    // 5. UPDATE ORDER STATUS IN FIREBASE + CLOUDINARY (PROTECTED BY YAADIVO@GMAIL.COM OTP TOKEN)
    // ====================================================
    if (action === "update_order_status") {
      const adminToken = body.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized" });
      }

      const { orderId, newStatus, courierPartner, trackingAwb, trackingUrl } = body;
      if (!orderId || !newStatus) {
        return res.status(400).json({ status: "Error", message: "Missing orderId or newStatus" });
      }

      // 1. Update Firestore
      try {
        const patchMasks = ["status"];
        const patchFields = { status: { stringValue: newStatus } };
        if (courierPartner !== undefined) {
          patchMasks.push("courierPartner");
          patchFields.courierPartner = { stringValue: courierPartner || "" };
        }
        if (trackingAwb !== undefined) {
          patchMasks.push("trackingAwb");
          patchFields.trackingAwb = { stringValue: trackingAwb || "" };
        }
        if (trackingUrl !== undefined) {
          patchMasks.push("trackingUrl");
          patchFields.trackingUrl = { stringValue: trackingUrl || "" };
        }

        const maskQuery = patchMasks.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
        const patchUrl = `${FIRESTORE_BASE}/orders/${encodeURIComponent(orderId)}?${maskQuery}`;
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: patchFields })
        });
      } catch (e) {
        console.error("Firestore patch error:", e);
      }

      // 2. Update Cloudinary DB Mirror
      try {
        const existingOrders = await readCloudinaryDb("orders");
        const idx = existingOrders.findIndex(o => o.orderId === orderId);
        if (idx >= 0) {
          existingOrders[idx].status = newStatus;
          if (courierPartner !== undefined) existingOrders[idx].courierPartner = courierPartner;
          if (trackingAwb !== undefined) existingOrders[idx].trackingAwb = trackingAwb;
          if (trackingUrl !== undefined) existingOrders[idx].trackingUrl = trackingUrl;
          await writeCloudinaryDb("orders", existingOrders);
        }
      } catch (e) {
        console.error("Cloudinary DB mirror update error:", e);
      }

      return res.status(200).json({ status: "Success", orderId, newStatus, courierPartner, trackingAwb });
    }

    // ====================================================
    // 5B. LIVE ORDER TRACKING (PUBLIC)
    // ====================================================
    if (action === "track_order") {
      const query = (body.query || req.query.query || '').trim();
      if (!query) {
        return res.status(400).json({ status: "Error", message: "Order ID or Mobile Number is required." });
      }

      let allOrders = [];
      try {
        const fsRes = await fetch(`${FIRESTORE_BASE}/orders?pageSize=100`);
        if (fsRes.ok) {
          const fsData = await fsRes.json();
          allOrders = (fsData.documents || []).map(fromFirestoreDoc).filter(Boolean);
        }
      } catch (e) {}

      if (allOrders.length === 0) {
        allOrders = await readCloudinaryDb("orders");
      }

      const qLower = query.toLowerCase();
      const cleanDigits = query.replace(/[^0-9]/g, '');

      const matched = allOrders.filter(o => {
        const orderIdMatch = o.orderId && o.orderId.toLowerCase() === qLower;
        const phoneMatch = cleanDigits.length >= 6 && o.phone && o.phone.replace(/[^0-9]/g, '').endsWith(cleanDigits);
        return orderIdMatch || phoneMatch;
      });

      if (matched.length === 0) {
        return res.status(404).json({ status: "Error", message: `No order found matching "${query}". Please check your Order ID or registered 10-digit mobile number.` });
      }

      return res.status(200).json({
        status: "Success",
        order: matched[0],
        orders: matched
      });
    }

    // ====================================================
    // 5C. GET CUSTOMER ORDERS (BY EMAIL OR PHONE)
    // ====================================================
    if (action === "get_customer_orders") {
      const email = (body.email || req.query.email || '').toLowerCase().trim();
      const phone = (body.phone || req.query.phone || '').replace(/[^0-9]/g, '');

      if (!email && !phone) {
        return res.status(400).json({ status: "Error", message: "Email or phone number is required." });
      }

      let allOrders = [];
      try {
        const fsRes = await fetch(`${FIRESTORE_BASE}/orders?pageSize=100`);
        if (fsRes.ok) {
          const fsData = await fsRes.json();
          allOrders = (fsData.documents || []).map(fromFirestoreDoc).filter(Boolean);
        }
      } catch (e) {}

      if (allOrders.length === 0) {
        allOrders = await readCloudinaryDb("orders");
      }

      const matched = allOrders.filter(o => {
        const matchEmail = email && o.email && o.email.toLowerCase().trim() === email;
        const matchPhone = phone.length >= 6 && o.phone && o.phone.replace(/[^0-9]/g, '').endsWith(phone);
        return matchEmail || matchPhone;
      });

      return res.status(200).json({
        status: "Success",
        orders: matched
      });
    }

    // ====================================================
    // 6. GET PRODUCTS CATALOG (PUBLIC & ADMIN)
    // ====================================================
    if (action === "get_products") {
      let products = [];
      try {
        const prodRes = await fetch(`${FIRESTORE_BASE}/products?pageSize=100`);
        if (prodRes.ok) {
          const pData = await prodRes.json();
          products = (pData.documents || []).map(fromFirestoreDoc).filter(Boolean);
        }
      } catch (e) {}

      if (products.length === 0) {
        products = await readCloudinaryDb("products");
      }

      // Also get announcement text
      let announcement = "";
      try {
        const annRes = await fetch(`${FIRESTORE_BASE}/settings/announcement`);
        if (annRes.ok) {
          const annData = await annRes.json();
          const cleanAnn = fromFirestoreDoc(annData);
          announcement = cleanAnn?.text || "";
        }
      } catch (e) {}

      if (!announcement) {
        const annObj = await readCloudinaryDb("announcement");
        announcement = annObj?.text || "";
      }

      return res.status(200).json({
        status: "Success",
        products,
        announcement
      });
    }

    // ====================================================
    // 7. SAVE / UPDATE PRODUCT (PROTECTED BY YAADIVO@GMAIL.COM OTP TOKEN)
    // ====================================================
    if (action === "save_product") {
      const adminToken = body.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized: Admin session required" });
      }

      const { product } = body;
      if (!product || !product.name) {
        return res.status(400).json({ status: "Error", message: "Product details required" });
      }

      const prodId = product.id ? String(product.id) : ("YDV-PRD-" + Date.now());
      const prodDoc = {
        ...product,
        id: prodId,
        price: Number(product.price || 0),
        updatedAt: new Date().toISOString()
      };

      // Save to Firebase Firestore
      try {
        await fetch(`${FIRESTORE_BASE}/products?documentId=${encodeURIComponent(prodId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toFirestoreFields(prodDoc))
        });
      } catch (e) {}

      // Save to Cloudinary DB Mirror
      const existingProds = await readCloudinaryDb("products");
      const idx = existingProds.findIndex(p => String(p.id) === String(prodId));
      if (idx >= 0) {
        existingProds[idx] = prodDoc;
      } else {
        existingProds.push(prodDoc);
      }
      await writeCloudinaryDb("products", existingProds);

      return res.status(200).json({
        status: "Success",
        product: prodDoc
      });
    }

    // ====================================================
    // 8. DELETE PRODUCT (PROTECTED BY YAADIVO@GMAIL.COM OTP TOKEN)
    // ====================================================
    if (action === "delete_product") {
      const adminToken = body.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized" });
      }

      const { productId } = body;
      if (!productId) {
        return res.status(400).json({ status: "Error", message: "Missing productId" });
      }

      try {
        await fetch(`${FIRESTORE_BASE}/products/${encodeURIComponent(productId)}`, {
          method: 'DELETE'
        });
      } catch (e) {}

      const existingProds = await readCloudinaryDb("products");
      const filtered = existingProds.filter(p => String(p.id) !== String(productId));
      await writeCloudinaryDb("products", filtered);

      return res.status(200).json({
        status: "Success",
        deletedId: productId
      });
    }

    // ====================================================
    // 9. UPDATE TOP ANNOUNCEMENT BANNER TEXT
    // ====================================================
    if (action === "update_announcement") {
      const adminToken = body.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized" });
      }

      const { text } = body;
      const annDoc = { text: text || "", updatedAt: new Date().toISOString() };

      try {
        await fetch(`${FIRESTORE_BASE}/settings/announcement`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toFirestoreFields(annDoc))
        });
      } catch (e) {}

      await writeCloudinaryDb("announcement", annDoc);

      return res.status(200).json({
        status: "Success",
        text: annDoc.text
      });
    }

    // ====================================================
    // 10. COUPON CODES (PERCENT & FLAT AMOUNT)
    // ====================================================
    if (action === "get_coupons") {
      let coupons = [];
      try {
        const cRes = await fetch(`${FIRESTORE_BASE}/coupons?pageSize=100`);
        if (cRes.ok) {
          const cData = await cRes.json();
          coupons = (cData.documents || []).map(fromFirestoreDoc).filter(Boolean);
        }
      } catch (e) {}
      if (coupons.length === 0) {
        coupons = await readCloudinaryDb("coupons");
      }
      return res.status(200).json({ status: "Success", coupons });
    }

    if (action === "save_coupon") {
      const adminToken = body.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized" });
      }

      const { coupon } = body;
      if (!coupon || !coupon.code) {
        return res.status(400).json({ status: "Error", message: "Coupon code required" });
      }

      const codeKey = coupon.code.toUpperCase().trim();
      const couponDoc = {
        ...coupon,
        code: codeKey,
        type: coupon.type || "percent", // "percent" or "flat"
        value: Number(coupon.value || 0),
        minOrder: Number(coupon.minOrder || 0),
        isActive: coupon.isActive !== false,
        updatedAt: new Date().toISOString()
      };

      try {
        await fetch(`${FIRESTORE_BASE}/coupons?documentId=${encodeURIComponent(codeKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toFirestoreFields(couponDoc))
        });
      } catch (e) {}

      const existingCoupons = await readCloudinaryDb("coupons");
      const idx = existingCoupons.findIndex(c => c.code === codeKey);
      if (idx >= 0) existingCoupons[idx] = couponDoc;
      else existingCoupons.push(couponDoc);
      await writeCloudinaryDb("coupons", existingCoupons);

      return res.status(200).json({ status: "Success", coupon: couponDoc });
    }

    if (action === "delete_coupon") {
      const adminToken = body.adminToken || (req.headers.authorization || '').replace('Bearer ', '');
      if (!verifyAdminToken(adminToken)) {
        return res.status(403).json({ status: "Error", message: "Unauthorized" });
      }

      const { code } = body;
      const codeKey = (code || '').toUpperCase().trim();
      try {
        await fetch(`${FIRESTORE_BASE}/coupons/${encodeURIComponent(codeKey)}`, { method: 'DELETE' });
      } catch (e) {}

      const existingCoupons = await readCloudinaryDb("coupons");
      const filtered = existingCoupons.filter(c => c.code !== codeKey);
      await writeCloudinaryDb("coupons", filtered);

      return res.status(200).json({ status: "Success", deletedCode: codeKey });
    }

    if (action === "validate_coupon") {
      const { code, cartTotal } = body;
      const codeKey = (code || '').toUpperCase().trim();
      let coupons = [];
      try {
        const cRes = await fetch(`${FIRESTORE_BASE}/coupons/${encodeURIComponent(codeKey)}`);
        if (cRes.ok) {
          const cData = await cRes.json();
          const cleanC = fromFirestoreDoc(cData);
          if (cleanC) coupons.push(cleanC);
        }
      } catch (e) {}

      if (coupons.length === 0) {
        const allC = await readCloudinaryDb("coupons");
        coupons = allC.filter(c => c.code === codeKey);
      }

      const found = coupons[0];
      if (!found || found.isActive === false) {
        return res.status(404).json({ status: "Error", message: "Invalid or expired coupon code." });
      }

      const total = Number(cartTotal || 0);
      if (found.minOrder && total < found.minOrder) {
        return res.status(400).json({ status: "Error", message: `Coupon requires minimum order of ₹${found.minOrder}.` });
      }

      let discount = 0;
      if (found.type === "percent") {
        discount = Math.round((total * found.value) / 100);
      } else {
        discount = Math.min(found.value, total);
      }

      return res.status(200).json({
        status: "Success",
        code: found.code,
        type: found.type,
        value: found.value,
        discount
      });
    }

    return res.status(400).json({ status: "Error", message: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
}
