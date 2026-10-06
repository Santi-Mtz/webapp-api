# 🚀 WebApp API REST & TCP Socket Server

Aplicación Web Node.js que expone una API REST HTTP en el puerto 80 y un protocolo de socket TCP en el puerto 6061 con persistencia en SQLite. Incluye pruebas automatizadas con reporte de cobertura, contenedorización optimizada en Docker y despliegue continuo (CI/CD) automático hacia AWS EC2 mediante GitHub Actions.

---

## 📐 Arquitectura del Sistema

```
                      +-------------------+
                      |   GitHub Actions  |
                      |   CI/CD Pipeline  |
                      +---------+---------+
                                |
             +------------------+------------------+
             |                                     |
    1. Exec Tests & Coverage             2. Build & Push Image
    (Jest / Supertest >= 70%)            (Docker Hub: latest & SHA)
             |                                     |
             v                                     v
   +-------------------+                 +-------------------+
   |   GitHub Runner   |                 |    Docker Hub     |
   +-------------------+                 +---------+---------+
                                                   |
                                                   | 3. SSH Deploy Command
                                                   v
                                         +-------------------+
                                         |    AWS EC2 Instance|
                                         |   (Ubuntu Server) |
                                         |  Container:       |
                                         |  webapp-prod      |
                                         |  - HTTP :80       |
                                         |  - TCP  :6061     |
                                         +-------------------+
```

---

## 🛠️ Requisitos e Instalación Local

### Prerrequisitos
- Node.js v18+
- Docker (opcional para pruebas en contenedores)

### Comandos de Ejecución Local

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar servidor localmente:**
   ```bash
   npm start
   ```
   - HTTP API disponible en: `http://localhost/` (o puerto especificado en `PORT`)
   - TCP Socket en: `localhost:6061`

3. **Ejecutar Pruebas Automatizadas y Cobertura:**
   ```bash
   npm test
   ```

---

## 📡 Endpoints de la API REST (Puerto 80)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| **GET** | `/api/health` | Estado de salud de la aplicación |
| **GET** | `/categories` | Listar todas las categorías |
| **GET** | `/categories/:id` | Obtener una categoría por ID |
| **POST** | `/categories` | Crear una nueva categoría |
| **DELETE** | `/categories/:id` | Eliminar una categoría por ID |
| **GET** | `/products` | Listar productos con su categoría (`JOIN`) |
| **GET** | `/products/:id` | Obtener un producto por ID |
| **POST** | `/products` | Crear un nuevo producto |
| **DELETE** | `/products/:id` | Eliminar un producto por ID |
| **POST** | `/db/backup` | Realizar backup de la base de datos SQLite |
| **DELETE** | `/db/truncate` | Vaciar todas las tablas |

---

## 🔌 Protocolo Socket TCP (Puerto 6061)

Admite mensajes en formato JSON:

1. **Inserción de Categoría / Producto:**
   ```json
   { "insert": { "name": "Categoría Ejemplo" } }
   { "insert": { "name": "Producto Ejemplo", "price": 99.99, "category_id": 1 } }
   ```

2. **Consulta con JOIN / Filtrado:**
   ```json
   { "get": { "type": "category" } }
   { "get": { "type": "product", "id": 1 } }
   ```

---

## 🔐 Configuración de Secretos en GitHub (GitHub Secrets)

Para que el pipeline de GitHub Actions se ejecute correctamente y despliegue en la instancia EC2 de AWS, es necesario configurar los siguientes **Repository Secrets** en GitHub (`Settings` > `Secrets and variables` > `Actions`):

| Secret Name | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `DOCKER_HUB_USERNAME` | Usuario registrado en Docker Hub | `santimtz23` |
| `DOCKER_HUB_TOKEN` | Personal Access Token (PAT) de Docker Hub | `dch_pat_...` |
| `EC2_HOST` | Dirección IP pública o DNS IPv4 de la instancia AWS EC2 | `54.210.X.X` |
| `EC2_USERNAME` | Usuario de SSH de la instancia Ubuntu | `ubuntu` |
| `EC2_SSH_KEY` | Clave privada RSA SSH (`.pem`) completa | `-----BEGIN RSA PRIVATE KEY----- ...` |

---

## 🐳 Comandos Docker Manuales

1. **Construir imagen:**
   ```bash
   docker build -t santimtz23/webapp:latest .
   ```

2. **Correr contenedor local:**
   ```bash
   docker run -d -p 80:80 -p 6061:6061 --name webapp-prod santimtz23/webapp:latest
   ```
