/**
 * Documents API — /api/documents
 * POST (public): Upload document (encrypted → R2)
 * GET ?id=N (admin): View document (decrypt → serve)
 * PUT ?id=N (admin): Mark document as verified
 */

import { encryptFile, decryptFile, hashBytes } from './_crypto.js';

function ensureDocumentBindings(env) {
  if (!env?.CUSTOMERS_DB) return 'Missing binding: CUSTOMERS_DB';
  if (!env?.DOCUMENTS) return 'Missing binding: DOCUMENTS';
  if (!env?.ENCRYPTION_KEY) return 'Missing secret: ENCRYPTION_KEY';
  return null;
}

// POST: Public — upload a document
async function handlePost(request, env) {
  const bindingError = ensureDocumentBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Document service misconfigured', detail: bindingError }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const docType = formData.get('doc_type');
  const bookingId = formData.get('booking_id');

  if (!file || !docType || !bookingId) {
    return Response.json({ error: 'Missing file, doc_type, or booking_id' }, { status: 400 });
  }

  const allowedTypes = ['license_front', 'license_back', 'international_license', 'translation', 'passport'];
  if (!allowedTypes.includes(docType)) {
    return Response.json({ error: 'Invalid doc_type' }, { status: 400 });
  }

  // Basic upload hardening: only images/PDF and cap file size.
  const maxFileSize = 10 * 1024 * 1024; // 10MB
  const fileType = file?.type || '';
  const isAllowedMime = fileType.startsWith('image/') || fileType === 'application/pdf';
  if (!isAllowedMime) {
    return Response.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (typeof file?.size === 'number' && file.size > maxFileSize) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 413 });
  }

  // Verify booking exists
  const booking = await env.CUSTOMERS_DB.prepare('SELECT id FROM bookings WHERE id = ?').bind(bookingId).first();
  if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

  // Read file bytes
  const fileBytes = await file.arrayBuffer();

  // Hash before encryption
  const fileHash = await hashBytes(fileBytes);

  // Encrypt file
  const encryptedData = await encryptFile(fileBytes, env);

  // Upload to R2
  const r2Key = `booking-${bookingId}/${docType}-${Date.now()}`;
  await env.DOCUMENTS.put(r2Key, encryptedData, {
    customMetadata: {
      booking_id: String(bookingId),
      doc_type: docType,
      original_filename: file.name,
    },
  });

  // Record in D1
  const result = await env.CUSTOMERS_DB.prepare(`
    INSERT INTO customer_documents (booking_id, doc_type, r2_key, file_hash, original_filename)
    VALUES (?, ?, ?, ?, ?)
  `).bind(bookingId, docType, r2Key, fileHash, file.name).run();

  return Response.json({ status: 'ok', document_id: result.meta.last_row_id });
}

// GET: Admin — view a document (decrypted)
async function handleGet(request, env) {
  const bindingError = ensureDocumentBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Document service misconfigured', detail: bindingError }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  const doc = await env.CUSTOMERS_DB.prepare('SELECT * FROM customer_documents WHERE id = ?').bind(id).first();
  if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

  // Fetch from R2
  const r2Object = await env.DOCUMENTS.get(doc.r2_key);
  if (!r2Object) return Response.json({ error: 'File not found in storage' }, { status: 404 });

  // Decrypt
  const encryptedBytes = await r2Object.arrayBuffer();
  const decryptedBytes = await decryptFile(encryptedBytes, env);

  // Determine content type from filename
  const ext = (doc.original_filename || '').split('.').pop().toLowerCase();
  const mimeTypes = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    heic: 'image/heic', webp: 'image/webp', pdf: 'application/pdf',
  };

  return new Response(decryptedBytes, {
    headers: {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// PUT: Admin — verify a document
async function handlePut(request, env, data) {
  const bindingError = ensureDocumentBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Document service misconfigured', detail: bindingError }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  const email = data?.userEmail || 'admin';

  await env.CUSTOMERS_DB.prepare(
    "UPDATE customer_documents SET verified = 1, verified_by = ?, verified_at = datetime('now') WHERE id = ?"
  ).bind(email, id).run();

  // Log
  await env.CUSTOMERS_DB.prepare(
    'INSERT INTO access_logs (user_email, action, resource, detail) VALUES (?, ?, ?, ?)'
  ).bind(email, 'verify_document', `document/${id}`, 'Verified').run();

  return Response.json({ status: 'ok' });
}

export async function onRequest(context) {
  const { request, env, data } = context;

  switch (request.method) {
    case 'POST': return handlePost(request, env);
    case 'GET': return handleGet(request, env);
    case 'PUT': return handlePut(request, env, data);
    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
}
