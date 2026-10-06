const express = require('express');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { db, dbPath } = require('./database');

const app = express();
app.use(express.json());

const sendResponse = (res, statusCode, data) => {
  return res.status(statusCode).json({
    statusCode,
    data: Array.isArray(data) ? data : [data]
  });
};

// 0. HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
  sendResponse(res, 200, { status: 'UP', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// 1. ENDPOINTS HTTP (EXPRESS - PUERTO 80)
// ---------------------------------------------------------------------------

// 1. GET /categories - Listar categorías
app.get('/categories', (req, res) => {
  db.all('SELECT * FROM categories', [], (err, rows) => {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, rows);
  });
});

// 2. GET /categories/:id - Obtener categoría por ID
app.get('/categories/:id', (req, res) => {
  db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, row ? [row] : []);
  });
});

// 3. POST /categories - Crear categoría
app.post('/categories', (req, res) => {
  const { name } = req.body;
  db.run('INSERT INTO categories (name) VALUES (?)', [name], function(err) {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 201, [{ id: this.lastID, name }]);
  });
});

// 4. DELETE /categories/:id - Eliminar categoría
app.delete('/categories/:id', (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, [{ deletedId: req.params.id, changes: this.changes }]);
  });
});

// 5. GET /products - Listar productos con su categoría (JOIN normalizado)
app.get('/products', (req, res) => {
  const sql = `SELECT p.id, p.name, p.price, c.name as category 
               FROM products p LEFT JOIN categories c ON p.category_id = c.id`;
  db.all(sql, [], (err, rows) => {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, rows);
  });
});

// 6. GET /products/:id - Obtener un producto por ID
app.get('/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, row ? [row] : []);
  });
});

// 7. POST /products - Crear producto
app.post('/products', (req, res) => {
  const { name, price, category_id } = req.body;
  db.run('INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)', [name, price, category_id], function(err) {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 201, [{ id: this.lastID, name, price, category_id }]);
  });
});

// 8. DELETE /products/:id - Eliminar producto
app.delete('/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, [{ deletedId: req.params.id, changes: this.changes }]);
  });
});

// 9. POST /db/backup - Copia de seguridad del archivo SQLite
app.post('/db/backup', (req, res) => {
  const backupDir = path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const backupPath = path.join(backupDir, `backup-${Date.now()}.db`);

  fs.copyFile(dbPath, backupPath, (err) => {
    if (err) return sendResponse(res, 500, { error: err.message });
    sendResponse(res, 200, [{ message: 'Backup creado con éxito', file: backupPath }]);
  });
});

// 10. DELETE /db/truncate - Vaciar todas las tablas
app.delete('/db/truncate', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM products');
    db.run('DELETE FROM categories', (err) => {
      if (err) return sendResponse(res, 500, { error: err.message });
      sendResponse(res, 200, [{ message: 'Tablas vaciadas correctamente' }]);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. PROTOCOLO SOCKET TCP (PUERTO 6061)
// Formatos admitidos:
//  - Inserción: { "insert": { ... } }
//  - Consulta:  { "get": { ... } }
// ---------------------------------------------------------------------------

const sendSocket = (socket, statusCode, data) => {
  const payload = {
    statusCode,
    data: Array.isArray(data) ? data : [data]
  };
  socket.write(JSON.stringify(payload) + '\n');
};

const tcpServer = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    try {
      const rawText = chunk.toString().trim();
      if (!rawText) return;

      const payload = JSON.parse(rawText);

      // CASO 1: { "insert": <element> }
      if (payload.insert) {
        const el = payload.insert;

        // Inserción de Categoría: {"insert": {"name": "..."}}
        if (el.name && !el.price && !el.category_id) {
          db.run('INSERT INTO categories (name) VALUES (?)', [el.name], function(err) {
            if (err) return sendSocket(socket, 500, { error: err.message });
            sendSocket(socket, 201, [{ id: this.lastID, name: el.name }]);
          });
        }
        // Inserción de Producto: {"insert": {"name": "...", "price": ..., "category_id": ...}}
        else if (el.name && el.price !== undefined && el.category_id !== undefined) {
          db.run(
            'INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)',
            [el.name, el.price, el.category_id],
            function(err) {
              if (err) return sendSocket(socket, 500, { error: err.message });
              sendSocket(socket, 201, [{ id: this.lastID, name: el.name, price: el.price, category_id: el.category_id }]);
            }
          );
        } else {
          sendSocket(socket, 400, { error: 'Payload de insert no coincide con categoria o producto' });
        }
      }

      // CASO 2: { "get": <element> }
      else if (payload.get) {
        const el = payload.get;

        // Consulta de Categorías: {"get": {"type": "category"}} o {"get": {"type": "category", "id": 1}}
        if (el.type === 'category' || el.table === 'categories') {
          if (el.id) {
            db.get('SELECT * FROM categories WHERE id = ?', [el.id], (err, row) => {
              if (err) return sendSocket(socket, 500, { error: err.message });
              sendSocket(socket, 200, row ? [row] : []);
            });
          } else {
            db.all('SELECT * FROM categories', [], (err, rows) => {
              if (err) return sendSocket(socket, 500, { error: err.message });
              sendSocket(socket, 200, rows);
            });
          }
        }
        // Consulta de Productos (con JOIN): {"get": {"type": "product"}} o {"get": {"type": "product", "id": 1}}
        else if (el.type === 'product' || el.table === 'products') {
          const sql = `SELECT p.id, p.name, p.price, c.name as category 
                       FROM products p LEFT JOIN categories c ON p.category_id = c.id`;

          if (el.id) {
            db.get(`${sql} WHERE p.id = ?`, [el.id], (err, row) => {
              if (err) return sendSocket(socket, 500, { error: err.message });
              sendSocket(socket, 200, row ? [row] : []);
            });
          } else {
            db.all(sql, [], (err, rows) => {
              if (err) return sendSocket(socket, 500, { error: err.message });
              sendSocket(socket, 200, rows);
            });
          }
        } else {
          sendSocket(socket, 400, { error: 'Tipo de recurso no soportado en get (use "category" o "product")' });
        }
      } 
      else {
        sendSocket(socket, 400, { error: 'Protocolo invalido. El objeto raíz debe tener "insert" o "get"' });
      }
    } catch (parseError) {
      sendSocket(socket, 400, { error: 'Formato JSON invalido', detail: parseError.message });
    }
  });

  socket.on('error', (err) => {
    console.error('Socket TCP error:', err.message);
  });
});

// ---------------------------------------------------------------------------
// 3. INICIO DE SERVICIOS (solo si se ejecuta directamente)
// ---------------------------------------------------------------------------
const HTTP_PORT = process.env.PORT || 80;
const TCP_PORT = process.env.TCP_PORT || 6061;

let httpServer = null;

if (require.main === module) {
  httpServer = app.listen(HTTP_PORT, () => {
    console.log(`[HTTP] Servidor activo en el puerto ${HTTP_PORT}`);
  });

  tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`[TCP Socket] Servidor escuchando en el puerto ${TCP_PORT}`);
  });
}

module.exports = { app, tcpServer };