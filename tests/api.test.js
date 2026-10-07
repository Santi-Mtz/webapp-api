const request = require('supertest');
const net = require('net');
const { app, tcpServer } = require('../index');
const { db } = require('../database');

let serverInstance;
let TEST_TCP_PORT = 0;

beforeAll((done) => {
  serverInstance = tcpServer.listen(0, '0.0.0.0', () => {
    TEST_TCP_PORT = serverInstance.address().port;
    done();
  });
});

afterAll((done) => {
  if (serverInstance && serverInstance.listening) {
    serverInstance.close(() => {
      db.close(() => {
        done();
      });
    });
  } else {
    db.close(() => {
      done();
    });
  }
});

beforeEach((done) => {
  db.serialize(() => {
    db.run('DELETE FROM products');
    db.run('DELETE FROM categories', () => {
      done();
    });
  });
});

// Helper para clientes TCP
function sendTcpMessage(messageObject) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ port: TEST_TCP_PORT, host: '127.0.0.1' }, () => {
      client.write(JSON.stringify(messageObject) + '\n');
    });

    client.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString().trim());
        client.end();
        resolve(response);
      } catch (err) {
        client.end();
        reject(err);
      }
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

describe('Pruebas HTTP REST API & TCP Socket Protocol', () => {
  // 1. Health Check
  test('GET /api/health debe retornar estado UP', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data[0].status).toBe('UP');
  });

  // 2. HTTP Categorías CRUD
  test('POST /categories y GET /categories', async () => {
    const createRes = await request(app)
      .post('/categories')
      .send({ name: 'Electrónica' });
    expect(createRes.statusCode).toEqual(201);
    expect(createRes.body.data[0]).toHaveProperty('id');

    const catId = createRes.body.data[0].id;

    const getSingleRes = await request(app).get(`/categories/${catId}`);
    expect(getSingleRes.statusCode).toEqual(200);
    expect(getSingleRes.body.data[0].name).toBe('Electrónica');

    const getAllRes = await request(app).get('/categories');
    expect(getAllRes.statusCode).toEqual(200);
    expect(getAllRes.body.data.length).toBe(1);

    const deleteRes = await request(app).delete(`/categories/${catId}`);
    expect(deleteRes.statusCode).toEqual(200);
  });

  // 3. HTTP Productos CRUD
  test('POST /products, GET /products y DELETE /products', async () => {
    const catRes = await request(app)
      .post('/categories')
      .send({ name: 'Hogar' });
    const catId = catRes.body.data[0].id;

    const prodRes = await request(app)
      .post('/products')
      .send({ name: 'Lámpara', price: 29.99, category_id: catId });
    expect(prodRes.statusCode).toEqual(201);
    const prodId = prodRes.body.data[0].id;

    const getProdRes = await request(app).get(`/products/${prodId}`);
    expect(getProdRes.statusCode).toEqual(200);
    expect(getProdRes.body.data[0].name).toBe('Lámpara');

    const getAllProdRes = await request(app).get('/products');
    expect(getAllProdRes.statusCode).toEqual(200);
    expect(getAllProdRes.body.data[0].category).toBe('Hogar');

    const delProdRes = await request(app).delete(`/products/${prodId}`);
    expect(delProdRes.statusCode).toEqual(200);
  });

  // 4. HTTP Backup y Truncate
  test('POST /db/backup y DELETE /db/truncate', async () => {
    const backupRes = await request(app).post('/db/backup');
    expect(backupRes.statusCode).toEqual(200);

    const truncateRes = await request(app).delete('/db/truncate');
    expect(truncateRes.statusCode).toEqual(200);
  });

  // 5. Socket TCP Protocol Tests
  test('TCP Socket insert y get para Categorías y Productos', async () => {
    // Insertar categoría vía TCP
    const insertCatRes = await sendTcpMessage({ insert: { name: 'Ropa' } });
    expect(insertCatRes.statusCode).toBe(201);
    const catId = insertCatRes.data[0].id;

    // Obtener categoría vía TCP
    const getCatRes = await sendTcpMessage({ get: { type: 'category', id: catId } });
    expect(getCatRes.statusCode).toBe(200);
    expect(getCatRes.data[0].name).toBe('Ropa');

    // Obtener todas las categorías vía TCP
    const getAllCatTcp = await sendTcpMessage({ get: { type: 'category' } });
    expect(getAllCatTcp.statusCode).toBe(200);
    expect(getAllCatTcp.data.length).toBe(1);

    // Insertar producto vía TCP
    const insertProdRes = await sendTcpMessage({
      insert: { name: 'Camiseta', price: 15.5, category_id: catId }
    });
    expect(insertProdRes.statusCode).toBe(201);
    const prodId = insertProdRes.data[0].id;

    // Obtener producto por ID vía TCP
    const getProdRes = await sendTcpMessage({ get: { type: 'product', id: prodId } });
    expect(getProdRes.statusCode).toBe(200);
    expect(getProdRes.data[0].name).toBe('Camiseta');

    // Obtener todos los productos vía TCP
    const getAllProdTcp = await sendTcpMessage({ get: { type: 'product' } });
    expect(getAllProdTcp.statusCode).toBe(200);

    // Casos de error TCP
    const invalidInsert = await sendTcpMessage({ insert: { invalid: true } });
    expect(invalidInsert.statusCode).toBe(400);

    const invalidType = await sendTcpMessage({ get: { type: 'unknown' } });
    expect(invalidType.statusCode).toBe(400);

    const invalidPayload = await sendTcpMessage({ unknownKey: 123 });
    expect(invalidPayload.statusCode).toBe(400);
  });
});
